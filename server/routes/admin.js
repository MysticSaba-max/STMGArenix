import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import pool from "../db/database.js";
import {
  listAdmins,
  createAdmin,
  deleteAdmin,
  changeAdminPassword,
} from "../services/auth.service.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiter strict pour la gestion des comptes
const adminMgmtLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  validate: { trustProxy: false },
  message: { error: "Trop de requêtes de gestion admin." },
});

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin, async (_req, res) => {
  const [sitesRows] = await pool.execute("SELECT COUNT(*) as count FROM sites");
  const [votesRows] = await pool.execute("SELECT COUNT(*) as count FROM votes");
  const [catRows] = await pool.execute("SELECT COUNT(*) as count FROM category_votes");

  const [recentVotes] = await pool.execute(`
    SELECT v.*, s.name as site_name
    FROM votes v
    JOIN sites s ON v.site_id = s.id
    ORDER BY v.created_at DESC
    LIMIT 20
  `);

  res.json({
    totalSites: Number(sitesRows[0].count),
    totalVotes: Number(votesRows[0].count),
    totalCategoryVotes: Number(catRows[0].count),
    recentVotes,
  });
});

// ─── Ajustement des scores ────────────────────────────────────────────────────
router.put("/scores/:id", requireAdmin, async (req, res) => {
  const { upvoteAdjust } = req.body;
  const siteId = Number(req.params.id);

  if (upvoteAdjust !== undefined) {
    const count = Math.min(Math.abs(upvoteAdjust), 1000); // Limite à 1000
    const type = upvoteAdjust > 0 ? "up" : "down";
    for (let i = 0; i < count; i++) {
      const fp = `admin_adjust_${siteId}_${Date.now()}_${i}`;
      await pool.execute(
        "INSERT INTO votes (site_id, fingerprint, vote_type) VALUES (?, ?, ?)",
        [siteId, `admin_${fp}`, type]
      );
    }
  }
  res.json({ success: true });
});

// ─── Gestion des comptes admins ───────────────────────────────────────────────

// GET /api/admin/admins — lister tous les admins
router.get("/admins", requireAdmin, async (_req, res) => {
  try {
    const admins = await listAdmins();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// POST /api/admin/admins — créer un nouveau compte admin
router.post("/admins", requireAdmin, adminMgmtLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis." });
  }
  try {
    const newAdmin = await createAdmin(username, password);
    res.status(201).json(newAdmin);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/admin/admins/:id — supprimer un compte admin
router.delete("/admins/:id", requireAdmin, adminMgmtLimiter, async (req, res) => {
  const targetId = Number(req.params.id);
  const requestingId = req.admin?.id;
  try {
    const deleted = await deleteAdmin(targetId, requestingId);
    if (!deleted) return res.status(404).json({ error: "Admin introuvable." });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/admins/:id/password — changer le mot de passe d'un admin
router.put("/admins/:id/password", requireAdmin, adminMgmtLimiter, async (req, res) => {
  const targetId = Number(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ error: "Nouveau mot de passe requis." });
  }
  try {
    const changed = await changeAdminPassword(targetId, newPassword);
    if (!changed) return res.status(404).json({ error: "Admin introuvable." });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
