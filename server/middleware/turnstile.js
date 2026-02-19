import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import crypto from "crypto";

dotenv.config();

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
const SESSION_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

export async function verifyTurnstile(req, res) {
  const { token, fingerprint } = req.body;
  const ip = req.ip || req.socket.remoteAddress || "";

  if (!fingerprint) {
    res.status(400).json({ error: "Fingerprint requis" });
    return;
  }

  if (!SECRET_KEY) {
    const sessionToken = jwt.sign({ verified: true, fingerprint, ip }, SESSION_SECRET, { expiresIn: "1h" });
    res.json({ sessionToken });
    return;
  }

  if (!token) {
    res.status(403).json({ error: "Captcha manquant" });
    return;
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: SECRET_KEY,
        response: token,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      res.status(403).json({ error: "Vérification captcha échouée" });
      return;
    }

    const sessionToken = jwt.sign({ verified: true, fingerprint, ip }, SESSION_SECRET, { expiresIn: "1h" });
    res.json({ sessionToken });
  } catch {
    res.status(500).json({ error: "Erreur de vérification captcha" });
  }
}

export function requireVerifiedSession(req, res, next) {
  if (!SECRET_KEY) return next();

  const token = req.headers["x-vote-session"];
  if (!token) {
    res.status(403).json({ error: "Session non vérifiée, rechargez la page" });
    return;
  }

  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    const currentIp = req.ip || req.socket.remoteAddress || "";

    if (!payload.verified) {
      res.status(403).json({ error: "Session invalide" });
      return;
    }

    // Verify fingerprint matches
    if (payload.fingerprint && req.body.fingerprint && payload.fingerprint !== req.body.fingerprint) {
      res.status(403).json({ error: "Session invalide pour cet appareil" });
      return;
    }

    // Verify IP matches
    if (payload.ip && payload.ip !== currentIp) {
      res.status(403).json({ error: "Session invalide pour cette connexion" });
      return;
    }

    next();
  } catch {
    res.status(403).json({ error: "Session expirée, rechargez la page" });
  }
}
