import { Router } from "express";
import { requireFingerprint } from "../middleware/fingerprint.js";
import { verifyTurnstile, requireVerifiedSession } from "../middleware/turnstile.js";
import { castVote, castCategoryVote, getUserVotes } from "../services/votes.service.js";

const VALID_CATEGORIES = ["pubs", "facilite", "liens", "catalogue", "qualite_video"];

// Cloudflare injecte CF-Connecting-IP avec la vraie IP cliente.
// Sans ça, req.ip serait l'IP d'un nœud Cloudflare, faussant les déduplications.
function getRealIp(req) {
  const cf = (req.headers["cf-connecting-ip"] || "").trim();
  return cf || (req.ip || req.socket?.remoteAddress || "").trim();
}

const router = Router();

// One-time Turnstile verification -> returns a session token
router.post("/verify", verifyTurnstile);

router.post("/", requireVerifiedSession, requireFingerprint, async (req, res) => {
  const { site_id, vote_type, fingerprintHash } = req.body;
  const ip = getRealIp(req);
  if (!site_id || !["up", "down"].includes(vote_type)) {
    res.status(400).json({ error: "site_id and vote_type (up/down) required" });
    return;
  }
  const result = await castVote(site_id, fingerprintHash, ip, vote_type);
  res.json(result);
});

router.post("/categories", requireVerifiedSession, requireFingerprint, async (req, res) => {
  const { site_id, ratings, fingerprintHash } = req.body;
  const ip = getRealIp(req);

  if (!site_id || !ratings || typeof ratings !== "object") {
    res.status(400).json({ error: "site_id and ratings required" });
    return;
  }

  for (const [category, score] of Object.entries(ratings)) {
    if (!VALID_CATEGORIES.includes(category) || !score || score < 1 || score > 5) {
      res.status(400).json({ error: `Invalid category or score: ${category}=${score}` });
      return;
    }
  }

  for (const [category, score] of Object.entries(ratings)) {
    await castCategoryVote(site_id, category, fingerprintHash, ip, score);
  }

  res.json({ success: true });
});

router.post("/mine", requireFingerprint, async (req, res) => {
  const { fingerprintHash } = req.body;
  const ip = getRealIp(req);
  const result = await getUserVotes(fingerprintHash, ip);
  res.json(result);
});

export default router;
