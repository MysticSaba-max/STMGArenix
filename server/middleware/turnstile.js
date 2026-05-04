import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { logBotAttempt } from "../services/botActivity.service.js";
import { hashIp } from "../utils/ipHash.js";

dotenv.config();

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
const SESSION_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

// Score max autorisé pour qu'un utilisateur obtienne une session
const MAX_ALLOWED_BOT_SCORE = 60;

export async function verifyTurnstile(req, res) {
  const { token, fingerprint, botSignals } = req.body;
  const ip = req.clientIp || req.ip || req.socket?.remoteAddress || req.realIp || "";

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
    logBotAttempt({
      ipHash: hashIp(ip),
      reason: "bot_score_high",
      botScore,
      userAgent: req.headers["user-agent"] || null,
    }).catch(() => {});
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

// ─── Calcul serveur du score bot (re-vérifie les signaux clients) ────────────
// Calibré pour le Turnstile invisible : le verify peut être déclenché avant
// toute interaction utilisateur (chargement automatique). On NE pénalise PAS
// l'absence d'interaction < 5 secondes après le chargement.
function computeServerSideBotScore(signals) {
  let score = 0;

  // ── Indicateurs définitifs d'automatisation ──
  if (signals.webdriver === true) score += 100;
  if (signals.phantom === true) score += 100;
  if (signals.selenium === true) score += 100;
  if (signals.automationFlags === true) score += 90;
  if (signals.headless === true) score += 80;

  // ── Timing ──
  // Un utilisateur réel peut déclencher le verify en 400–800ms après chargement.
  // On ne pénalise que les cas véritablement impossibles sans script.
  const tsl = Number(signals.timeSinceLoad) || 0;
  if (tsl < 300) score += 50;       // Quasi-impossible humainement
  else if (tsl < 600) score += 20;  // Très rapide mais possible sur machine rapide

  // ── Absence d'interaction : UNIQUEMENT si la page est ouverte depuis > 5s ──
  // Le Turnstile invisible se déclenche avant toute interaction — c'est NORMAL.
  const noInteraction =
    Number(signals.mouseMovements) === 0 &&
    Number(signals.clickCount) === 0 &&
    Number(signals.touchCount) === 0;
  if (noInteraction && tsl > 9000) score += 35;
  else if (noInteraction && tsl > 5000) score += 20;
  // < 5s : aucune pénalité, le Turnstile peut s'exécuter automatiquement

  // ── Environnement navigateur : signaux non-ambigus ──
  const browser = signals.browser || {};
  if (!browser.languages) score += 20;           // Impossible dans un vrai navigateur
  if (!browser.timezone) score += 15;
  if (browser.hardwareConcurrency === 0) score += 15;
  if (browser.osConsistent === false) score += 20; // Incohérence OS détectée côté client

  // SUPPRIMÉ : plugins === 0 — Firefox 94+ expose 0 plugins sur desktop,
  // ce qui causait des faux positifs systématiques pour les utilisateurs Firefox.

  // ── Canvas / WebGL absents (headless ou sandboxé) ──
  if (!signals.canvasFp || signals.canvasFp === "no-canvas") score += 25;
  if (!signals.webglFp || signals.webglFp === "no-webgl") score += 20;

  // ── Biométrie comportementale (nouveaux signaux v2) ──
  // Ces checks ne s'activent que si suffisamment de données sont présentes,
  // ce qui évite les faux positifs lors des vérifications précoces.

  // Vitesse souris suspicieusement uniforme (bots Puppeteer à vitesse constante)
  const mouseCV = Number(signals.mouseVelocityCV);
  if (!isNaN(mouseCV) && mouseCV >= 0 && mouseCV < 0.15 && Number(signals.mouseMovements) >= 15) {
    score += 25;
  }

  // Trajectoire souris trop rectiligne (bots qui simulent le mouvement)
  const straightRatio = Number(signals.mouseStraightRatio);
  if (!isNaN(straightRatio) && straightRatio >= 0 && straightRatio > 0.88 && Number(signals.mouseMovements) >= 20) {
    score += 20;
  }

  // Frappe clavier trop uniforme (bots scriptant la saisie de formulaires)
  const keystrokeCV = Number(signals.keystrokeCV);
  if (!isNaN(keystrokeCV) && keystrokeCV >= 0 && keystrokeCV < 0.10 && Number(signals.keystrokes) >= 7) {
    score += 25;
  }

  return Math.min(score, 200);
}
