import { Router } from "express";
import { requireFingerprint } from "../middleware/fingerprint.js";
import { verifyTurnstile, requireVerifiedSession } from "../middleware/turnstile.js";
import { castVote, castCategoryVote, getUserVotes } from "../services/votes.service.js";
import { verifyVoteSignature } from "../middleware/voteSignature.js";
import { voteRateLimit } from "../middleware/voteRateLimit.js";
import { logBotAttempt } from "../services/botActivity.service.js";
import { hashIp } from "../utils/ipHash.js";
import rateLimit from "express-rate-limit";

const VALID_CATEGORIES = ["pubs", "facilite", "liens", "catalogue", "qualite_video"];

// Cloudflare injecte CF-Connecting-IP avec la vraie IP cliente.
// Sans ça, req.ip serait l'IP d'un nœud Cloudflare, faussant les déduplications.
function getRealIp(req) {
  return req.clientIp || req.ip || req.socket?.remoteAddress || req.realIp || "";
}

function honeypotGuard(req, res, next) {
  if (req.body && typeof req.body.email_confirm === "string" && req.body.email_confirm.length > 0) {
    logBotAttempt({
      ipHash: hashIp(req.realIp || ""),
      reason: "honeypot_filled",
      userAgent: req.headers["user-agent"] || null,
    }).catch(() => {});
    return res.status(403).json({ error: "Accès refusé", code: "HONEYPOT" });
  }
  next();
}

const mineLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.realIp,
  validate: { trustProxy: false, keyGeneratorIpFallback: false },
  message: { error: "Trop de requêtes." },
});

const router = Router();

// One-time Turnstile verification -> returns a session token
router.post("/verify", verifyTurnstile);

router.post("/",
  honeypotGuard,
  requireVerifiedSession,
  verifyVoteSignature,
  requireFingerprint,
  voteRateLimit,
  async (req, res) => {
    const { vote_type, fingerprintHash } = req.body;
    const siteId = Number.parseInt(req.body.site_id, 10);
    const ip = getRealIp(req);
    if (!Number.isInteger(siteId) || siteId <= 0 || siteId > 1_000_000) {
      return res.status(400).json({ error: "site_id invalide" });
    }
    if (!["up", "down"].includes(vote_type)) {
      return res.status(400).json({ error: "vote_type doit être up ou down" });
    }
    const result = await castVote(siteId, fingerprintHash, ip, vote_type);
    res.json(result);
  }
);

router.post("/categories",
  honeypotGuard,
  requireVerifiedSession,
  verifyVoteSignature,
  requireFingerprint,
  voteRateLimit,
  async (req, res) => {
    const { ratings, fingerprintHash } = req.body;
    const siteId = Number.parseInt(req.body.site_id, 10);
    const ip = getRealIp(req);
    if (!Number.isInteger(siteId) || siteId <= 0 || siteId > 1_000_000) {
      return res.status(400).json({ error: "site_id invalide" });
    }
    if (!ratings || typeof ratings !== "object") {
      return res.status(400).json({ error: "ratings requis" });
    }
    for (const [category, score] of Object.entries(ratings)) {
      const sNum = Number.parseInt(score, 10);
      if (!VALID_CATEGORIES.includes(category) || !Number.isInteger(sNum) || sNum < 1 || sNum > 5) {
        return res.status(400).json({ error: `Invalid category or score: ${category}=${score}` });
      }
    }
    for (const [category, score] of Object.entries(ratings)) {
      await castCategoryVote(siteId, category, fingerprintHash, ip, Number.parseInt(score, 10));
    }
    res.json({ success: true });
  }
);

router.post("/mine", mineLimiter, requireFingerprint, async (req, res) => {
  const { fingerprintHash } = req.body;
  const ip = getRealIp(req);
  const result = await getUserVotes(fingerprintHash, ip);
  res.json(result);
});

export default router;
