import { Router } from "express";
import { getGlobalLeaderboard, getAllCategoriesLeaderboard, getCategoryLeaderboard } from "../services/leaderboard.service.js";

const router = Router();

router.get("/", async (_req, res) => {
  const leaderboard = await getGlobalLeaderboard();
  res.json(leaderboard);
});

router.get("/categories", async (_req, res) => {
  const categories = await getAllCategoriesLeaderboard();
  res.json(categories);
});

router.get("/categories/:category", async (req, res) => {
  const validCategories = ["pubs", "facilite", "liens", "catalogue", "qualite_video"];
  if (!validCategories.includes(req.params.category)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const leaderboard = await getCategoryLeaderboard(req.params.category);
  res.json(leaderboard);
});

export default router;
