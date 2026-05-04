import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { logBotAttempt } from "../services/botActivity.service.js";
import { hashIp } from "../utils/ipHash.js";
import { createVoteSession, consumeVoteSession } from "../services/voteSession.service.js";
import { hashFingerprint } from "./fingerprint.js";

dotenv.config();

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
const SESSION_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

// Score max autorisé pour qu'un utilisateur obtienne une session
const MAX_ALLOWED_BOT_SCORE = 60;

export async function verifyTurnstile(req, res) {
  const { token, fingerprint, botSignals } = req.body;
  const ip = req.clientIp || req.ip || req.socket?.remoteAddress || req.realIp || "";

  if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 32) {
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

  const fpHash = hashFingerprint(fingerprint);

  // ─── Mode développement (pas de clé Turnstile) ───────────────────────────
  if (!SECRET_KEY) {
    try {
      const session = await createVoteSession({
        fpHash,
        ipSubnet: req.realIp,
        botScore,
      });
      const sessionToken = jwt.sign(
        { jti: session.jti, fp: fpHash, ip: req.realIp, botScore },
        SESSION_SECRET,
        { expiresIn: "1h" }
      );
      return res.json({ sessionToken, signingKey: session.signingKey });
    } catch (err) {
      console.error("[turnstile dev] createVoteSession failed:", err.message);
      return res.status(503).json({ error: "Service de session indisponible." });
    }
  }

  if (!token) {
    return res.status(403).json({ error: "Captcha manquant" });
  }

  // ─── Vérification Turnstile (réseau Cloudflare) ──────────────────────────
  let turnstileOk = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: SECRET_KEY, response: token, remoteip: ip }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!data.success) {
      return res.status(403).json({ error: "Vérification captcha échouée" });
    }
    turnstileOk = true;
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(503).json({ error: "Timeout de vérification captcha" });
    }
    return res.status(500).json({ error: "Erreur de vérification captcha" });
  }

  if (!turnstileOk) return; // unreachable, but explicit

  // ─── Création de session (DB) — séparée du try/catch Turnstile pour distinguer
  // un échec captcha d'un échec base de données dans les logs et les réponses.
  try {
    const session = await createVoteSession({
      fpHash,
      ipSubnet: req.realIp,
      botScore,
    });
    const sessionToken = jwt.sign(
      { jti: session.jti, fp: fpHash, ip: req.realIp, botScore },
      SESSION_SECRET,
      { expiresIn: "1h" }
    );
    return res.json({ sessionToken, signingKey: session.signingKey });
  } catch (err) {
    console.error("[turnstile] createVoteSession failed:", err.message);
    return res.status(503).json({ error: "Service de session indisponible, réessayez." });
  }
}

export async function requireVerifiedSession(req, res, next) {
  const token = req.headers["x-vote-session"];

  // Dev mode (no Turnstile secret) sans header → passthrough (compat existante).
  // Si un header est fourni en dev, on l'enforce comme en prod.
  if (!SECRET_KEY && !token) return next();

  if (!token) {
    return res.status(403).json({ error: "Session non vérifiée, rechargez la page", code: "NO_SESSION" });
  }

  let payload;
  try {
    payload = jwt.verify(token, SESSION_SECRET);
  } catch {
    return res.status(403).json({ error: "Session expirée, rechargez la page", code: "BAD_SESSION" });
  }

  const fpHash = hashFingerprint(req.body.fingerprint || "");
  const result = await consumeVoteSession({
    jti: payload.jti,
    fpHash,
    ipSubnet: req.realIp,
  });

  if (!result.ok) {
    let userMessage;
    let publicCode = result.code;
    switch (result.code) {
      case "QUOTA_EXCEEDED":
        userMessage = "Quota de votes atteint. Rechargez la page pour en obtenir une nouvelle session.";
        break;
      case "SESSION_EXPIRED":
        userMessage = "Session expirée. Rechargez la page.";
        break;
      case "SESSION_REVOKED":
        userMessage = "Session révoquée. Rechargez la page pour réessayer.";
        break;
      case "FP_MISMATCH":
      case "IP_MISMATCH":
        // Ne PAS révéler au client lequel des deux a échoué : un attaquant
        // qui voit "FP_MISMATCH" sait qu'il doit corriger son fingerprint
        // (et inversement). On collapse vers un code générique côté réponse.
        userMessage = "Session liée à un autre appareil ou réseau.";
        publicCode = "BINDING_MISMATCH";
        break;
      default:
        userMessage = "Session invalide.";
    }
    return res.status(403).json({ error: userMessage, code: publicCode });
  }

  req.voteSession = { jti: payload.jti, signingKey: result.signingKey, botScore: result.botScore };
  next();
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
