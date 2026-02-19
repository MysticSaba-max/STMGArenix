import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import crypto from "crypto";

dotenv.config();

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
const SESSION_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

// Score max autorisé pour qu'un utilisateur obtienne une session
const MAX_ALLOWED_BOT_SCORE = 60;

export async function verifyTurnstile(req, res) {
  const { token, fingerprint, botSignals } = req.body;
  const ip = req.ip || req.socket?.remoteAddress || "";

  if (!fingerprint) {
    return res.status(400).json({ error: "Fingerprint requis" });
  }

  // ─── Vérification du score bot côté client ───────────────────────────────
  let botScore = 0;
  if (botSignals && typeof botSignals === "object") {
    botScore = computeServerSideBotScore(botSignals);
  }

  // Refus immédiat si score bot trop élevé (même sans Turnstile)
  if (botScore >= MAX_ALLOWED_BOT_SCORE) {
    console.warn(`Bot détecté (score: ${botScore}) depuis IP: ${ip}`);
    return res.status(403).json({
      error: "Comportement automatisé détecté. Vérification échouée.",
      code: "BOT_DETECTED",
    });
  }

  // ─── Mode développement (pas de clé Turnstile) ───────────────────────────
  if (!SECRET_KEY) {
    const sessionToken = jwt.sign(
      { verified: true, fingerprint, ip, botScore },
      SESSION_SECRET,
      { expiresIn: "1h" }
    );
    return res.json({ sessionToken });
  }

  if (!token) {
    return res.status(403).json({ error: "Captcha manquant" });
  }

  // ─── Vérification Turnstile ───────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: SECRET_KEY, response: token, remoteip: ip }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const data = await response.json();

    if (!data.success) {
      return res.status(403).json({ error: "Vérification captcha échouée" });
    }

    const sessionToken = jwt.sign(
      { verified: true, fingerprint, ip, botScore },
      SESSION_SECRET,
      { expiresIn: "1h" }
    );
    return res.json({ sessionToken });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(503).json({ error: "Timeout de vérification captcha" });
    }
    return res.status(500).json({ error: "Erreur de vérification captcha" });
  }
}

export function requireVerifiedSession(req, res, next) {
  if (!SECRET_KEY) return next();

  const token = req.headers["x-vote-session"];
  if (!token) {
    return res.status(403).json({ error: "Session non vérifiée, rechargez la page" });
  }

  try {
    const payload = jwt.verify(token, SESSION_SECRET);

    if (!payload.verified) {
      return res.status(403).json({ error: "Session invalide" });
    }

    // Vérifier que la session n'a pas un bot score trop élevé
    if ((payload.botScore || 0) >= MAX_ALLOWED_BOT_SCORE) {
      return res.status(403).json({
        error: "Session refusée : comportement automatisé détecté.",
        code: "BOT_SESSION",
      });
    }

    // Vérifier que le fingerprint correspond
    if (
      payload.fingerprint &&
      req.body.fingerprint &&
      payload.fingerprint !== req.body.fingerprint
    ) {
      return res.status(403).json({ error: "Session invalide pour cet appareil" });
    }

    next();
  } catch {
    return res.status(403).json({ error: "Session expirée, rechargez la page" });
  }
}

// ─── Calcul serveur du score bot (vérification des signaux clients) ──────────
function computeServerSideBotScore(signals) {
  let score = 0;

  if (signals.webdriver === true) score += 100;
  if (signals.phantom === true) score += 100;
  if (signals.selenium === true) score += 100;
  if (signals.automationFlags === true) score += 90;
  if (signals.headless === true) score += 80;

  // Comportement
  if (
    signals.mouseMovements === 0 &&
    signals.clickCount === 0 &&
    signals.touchCount === 0
  ) score += 30;

  const timeSinceLoad = Number(signals.timeSinceLoad) || 0;
  if (timeSinceLoad < 500) score += 40;
  else if (timeSinceLoad < 1500) score += 15;

  // Navigateur
  const browser = signals.browser || {};
  if (!browser.languages) score += 20;
  if (!browser.timezone) score += 15;
  if (browser.hardwareConcurrency === 0) score += 15;
  if (browser.plugins === 0 && !browser.touchSupport) score += 15;

  // Canvas / WebGL
  if (!signals.canvasFp || signals.canvasFp === "no-canvas" || signals.canvasFp === "canvas-error") {
    score += 25;
  }
  if (!signals.webglFp || signals.webglFp === "no-webgl") score += 20;

  return Math.min(score, 200);
}
