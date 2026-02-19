import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import pool from "../db/database.js";

const router = Router();

router.get("/stats", requireAdmin, async (_req, res) => {
  const [sitesRows] = await pool.execute("SELECT COUNT(*) as count FROM sites");
  const [votesRows] = await pool.execute("SELECT COUNT(*) as count FROM votes");
  const [catRows] = await pool.execute("SELECT COUNT(*) as count FROM category_votes");

  const totalSites = Number(sitesRows[0].count);
  const totalVotes = Number(votesRows[0].count);
  const totalCategoryVotes = Number(catRows[0].count);

  const [recentVotes] = await pool.execute(`
    SELECT v.*, s.name as site_name
    FROM votes v
    JOIN sites s ON v.site_id = s.id
    ORDER BY v.created_at DESC
    LIMIT 20
  `);

  res.json({ totalSites, totalVotes, totalCategoryVotes, recentVotes });
});

router.put("/scores/:id", requireAdmin, async (req, res) => {
  const { upvoteAdjust } = req.body;
  const siteId = Number(req.params.id);

  if (upvoteAdjust !== undefined) {
    for (let i = 0; i < Math.abs(upvoteAdjust); i++) {
      const fp = `admin_adjust_${siteId}_${Date.now()}_${i}`;
      const type = upvoteAdjust > 0 ? "up" : "down";
      await pool.execute("INSERT INTO votes (site_id, fingerprint, vote_type) VALUES (?, ?, ?)", [siteId, `admin_${fp}`, type]);
    }
  }

  res.json({ success: true });
});

export default router;
