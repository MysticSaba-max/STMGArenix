import { Router } from "express";
import { requireFingerprint } from "../middleware/fingerprint.js";
import { castVote, castCategoryVote, getUserVotes } from "../services/votes.service.js";

const VALID_CATEGORIES = ["pubs", "facilite", "liens", "catalogue", "qualite_video"];

const router = Router();

router.post("/", requireFingerprint, async (req, res) => {
  const { site_id, vote_type, fingerprintHash } = req.body;
  if (!site_id || !["up", "down"].includes(vote_type)) {
    res.status(400).json({ error: "site_id and vote_type (up/down) required" });
    return;
  }
  const result = await castVote(site_id, fingerprintHash, vote_type);
  res.json(result);
});

router.post("/category", requireFingerprint, async (req, res) => {
  const { site_id, category, score, fingerprintHash } = req.body;
  if (!site_id || !VALID_CATEGORIES.includes(category) || !score || score < 1 || score > 5) {
    res.status(400).json({ error: "site_id, category, and score (1-5) required" });
    return;
  }
  const result = await castCategoryVote(site_id, category, fingerprintHash, score);
  res.json(result);
});

router.post("/mine", requireFingerprint, async (req, res) => {
  const { fingerprintHash } = req.body;
  const result = await getUserVotes(fingerprintHash);
  res.json(result);
});

export default router;
