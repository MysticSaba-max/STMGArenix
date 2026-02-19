import { Router } from "express";
import { loginAdmin } from "../services/auth.service.js";
import { createHash } from "crypto";

const router = Router();

// ─── Tracking des tentatives échouées par IP ──────────────────────────────────
const failedAttempts = new Map(); // ipHash -> { count, firstAt }
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 min

function hashIp(ip) {
  return createHash("sha256").update(ip + (process.env.JWT_SECRET || "salt")).digest("hex");
}

function isLockedOut(ipHash) {
  const entry = failedAttempts.get(ipHash);
  if (!entry) return false;
  if (entry.count < MAX_ATTEMPTS) return false;
  if (Date.now() - entry.firstAt > LOCKOUT_DURATION) {
    failedAttempts.delete(ipHash);
    return false;
  }
  return true;
}

function recordFailure(ipHash) {
  const entry = failedAttempts.get(ipHash) || { count: 0, firstAt: Date.now() };
  entry.count += 1;
  failedAttempts.set(ipHash, entry);
}

function resetFailures(ipHash) {
  failedAttempts.delete(ipHash);
}

// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of failedAttempts.entries()) {
    if (now - val.firstAt > LOCKOUT_DURATION) failedAttempts.delete(key);
  }
}, 10 * 60 * 1000);

// ─── Route login ──────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "";
  const ipHash = hashIp(ip);

  // Honeypot côté serveur : si le champ "website" est rempli → bot
  if (req.body.website) {
    // Simuler un délai pour ne pas révéler la détection
    await new Promise((r) => setTimeout(r, 1000));
    return res.status(401).json({ error: "Identifiants invalides" });
  }

  // Vérifier le blocage temporaire
  if (isLockedOut(ipHash)) {
    return res.status(429).json({
      error: "Trop de tentatives échouées. Réessayez dans 15 minutes.",
      code: "LOCKOUT",
    });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis." });
  }

  // Longueur max pour éviter les DoS via bcrypt avec de très longues chaînes
  if (username.length > 64 || password.length > 128) {
    recordFailure(ipHash);
    return res.status(401).json({ error: "Identifiants invalides" });
  }

  try {
    const token = await loginAdmin(username, password);
    if (!token) {
      recordFailure(ipHash);
      return res.status(401).json({ error: "Identifiants invalides" });
    }
    resetFailures(ipHash);
    return res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
