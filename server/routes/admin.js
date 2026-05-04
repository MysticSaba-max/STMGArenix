import { Router } from "express";
import path from "path";
import fs from "fs";
import { requireAdmin } from "../middleware/auth.js";
import pool from "../db/database.js";
import {
  listAdmins,
  createAdmin,
  deleteAdmin,
  changeAdminPassword,
} from "../services/auth.service.js";
import { revokeVoteSession } from "../services/voteSession.service.js";
import rateLimit from "express-rate-limit";

const LOGOS_DIR = path.join(process.cwd(), "public", "logos");

const router = Router();

// Rate limiter strict pour la gestion des comptes
// Clé basée sur l'IP réelle (CF-Connecting-IP derrière Cloudflare)
const adminMgmtLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.realIp,
  validate: { trustProxy: false, keyGeneratorIpFallback: false },
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
  if (!siteId || isNaN(siteId) || siteId <= 0) {
    return res.status(400).json({ error: "ID de site invalide." });
  }

  if (upvoteAdjust !== undefined) {
    const adj = Number(upvoteAdjust);
    if (isNaN(adj) || adj === 0) return res.status(400).json({ error: "Valeur d'ajustement invalide." });
    const count = Math.min(Math.abs(adj), 1000);
    const type = adj > 0 ? "up" : "down";
    // Transaction atomique : soit tout passe, soit rien
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const base = Date.now();
      for (let i = 0; i < count; i++) {
        await conn.execute(
          "INSERT INTO votes (site_id, fingerprint, vote_type) VALUES (?, ?, ?)",
          [siteId, `admin_${siteId}_${base}_${i}`, type]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
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

// ─── Réinitialisation des votes d'un site ─────────────────────────────────────
router.delete("/sites/:id/votes", requireAdmin, async (req, res) => {
  const siteId = Number(req.params.id);
  if (!siteId || isNaN(siteId) || siteId <= 0) {
    return res.status(400).json({ error: "ID de site invalide." });
  }
  try {
    const [siteRows] = await pool.execute("SELECT id, name FROM sites WHERE id = ?", [siteId]);
    if (!siteRows.length) return res.status(404).json({ error: "Site introuvable." });

    await pool.execute("DELETE FROM votes WHERE site_id = ?", [siteId]);
    await pool.execute("DELETE FROM category_votes WHERE site_id = ?", [siteId]);

    res.json({ success: true, siteName: siteRows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// ─── Propositions de sites ────────────────────────────────────────────────────

// GET /api/admin/proposals — lister les propositions (filtrables par status)
router.get("/proposals", requireAdmin, async (req, res) => {
  const status = req.query.status;
  const allowed = ["pending", "accepted", "rejected"];
  try {
    let rows;
    if (status && allowed.includes(status)) {
      [rows] = await pool.execute(
        "SELECT * FROM site_proposals WHERE status = ? ORDER BY submitted_at DESC",
        [status]
      );
    } else {
      [rows] = await pool.execute(
        "SELECT * FROM site_proposals ORDER BY submitted_at DESC"
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// PUT /api/admin/proposals/:id/accept — accepter une proposition (crée le site)
router.put("/proposals/:id/accept", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID invalide." });
  try {
    const [rows] = await pool.execute("SELECT * FROM site_proposals WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "Proposition introuvable." });

    const proposal = rows[0];
    if (proposal.status !== "pending") {
      return res.status(400).json({ error: "Cette proposition a déjà été traitée." });
    }

    if (proposal.type === "modification") {
      // Mettre à jour le site existant
      if (!proposal.site_id) {
        return res.status(400).json({ error: "Signalement sans site associé." });
      }
      const setClauses = [];
      const values = [];
      if (proposal.url && proposal.url.trim()) {
        setClauses.push("url = ?");
        values.push(proposal.url.trim());
      }
      if (setClauses.length > 0) {
        values.push(proposal.site_id);
        await pool.execute(`UPDATE sites SET ${setClauses.join(", ")} WHERE id = ?`, values);
      }
    } else {
      // Créer le site depuis la proposition
      await pool.execute(
        "INSERT INTO sites (name, url, logo_path) VALUES (?, ?, ?)",
        [proposal.name, proposal.url, proposal.logo_path]
      );
    }

    // Marquer comme acceptée
    await pool.execute(
      "UPDATE site_proposals SET status = 'accepted', reviewed_at = NOW() WHERE id = ?",
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// PUT /api/admin/proposals/:id/reject — rejeter une proposition
router.put("/proposals/:id/reject", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID invalide." });
  try {
    const [rows] = await pool.execute("SELECT * FROM site_proposals WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "Proposition introuvable." });

    const proposal = rows[0];
    if (proposal.status !== "pending") {
      return res.status(400).json({ error: "Cette proposition a déjà été traitée." });
    }

    await pool.execute(
      "UPDATE site_proposals SET status = 'rejected', reviewed_at = NOW() WHERE id = ?",
      [id]
    );

    // Supprimer le logo uploadé pour libérer l'espace
    if (proposal.logo_path && proposal.logo_path.startsWith("/logos/")) {
      const filename = path.basename(proposal.logo_path);
      const filePath = path.join(LOGOS_DIR, filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// ─── Anomalies (votes flagués par le scanner) ────────────────────────────────

router.get("/anomalies", requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT cluster_id, reason, COUNT(*) AS count,
              MIN(flagged_at) AS first_seen, MAX(flagged_at) AS last_seen,
              GROUP_CONCAT(DISTINCT table_name) AS tables
       FROM vote_flags
       WHERE flagged_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY cluster_id, reason
       ORDER BY last_seen DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

router.get("/anomalies/:cluster_id", requireAdmin, async (req, res) => {
  try {
    const cid = req.params.cluster_id;
    const [rows] = await pool.execute(
      `SELECT f.vote_id, f.table_name, f.reason, f.flagged_at,
              CASE WHEN f.table_name='votes' THEN v.fingerprint ELSE cv.fingerprint END AS fingerprint,
              CASE WHEN f.table_name='votes' THEN v.ip_hash ELSE cv.ip_hash END AS ip_hash,
              CASE WHEN f.table_name='votes' THEN v.site_id ELSE cv.site_id END AS site_id
       FROM vote_flags f
       LEFT JOIN votes v ON f.table_name='votes' AND v.id = f.vote_id
       LEFT JOIN category_votes cv ON f.table_name='category_votes' AND cv.id = f.vote_id
       WHERE f.cluster_id = ?
       LIMIT 500`,
      [cid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// Lever les flags (faux positif → réintégration au leaderboard)
router.delete("/anomalies/:cluster_id", requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute(
      "DELETE FROM vote_flags WHERE cluster_id = ?",
      [req.params.cluster_id]
    );
    res.json({ removed: r.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// Purge définitive des votes du cluster (suppression de la table votes)
router.delete("/anomalies/:cluster_id/votes", requireAdmin, async (req, res) => {
  try {
    const [flags] = await pool.execute(
      "SELECT vote_id, table_name FROM vote_flags WHERE cluster_id = ?",
      [req.params.cluster_id]
    );
    const voteIds = flags.filter(f => f.table_name === "votes").map(f => f.vote_id);
    const catIds = flags.filter(f => f.table_name === "category_votes").map(f => f.vote_id);

    if (voteIds.length) {
      await pool.query("DELETE FROM votes WHERE id IN (?)", [voteIds]);
    }
    if (catIds.length) {
      await pool.query("DELETE FROM category_votes WHERE id IN (?)", [catIds]);
    }
    await pool.execute("DELETE FROM vote_flags WHERE cluster_id = ?", [req.params.cluster_id]);

    res.json({ deleted_votes: voteIds.length, deleted_category_votes: catIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

router.post("/sessions/:jti/revoke", requireAdmin, async (req, res) => {
  try {
    await revokeVoteSession(req.params.jti);
    res.json({ revoked: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// ─── Stats sécurité agrégées ─────────────────────────────────────────────────
router.get("/security/stats", requireAdmin, async (_req, res) => {
  try {
    const since24h = "DATE_SUB(NOW(), INTERVAL 24 HOUR)";
    const [[sessActive]] = await pool.execute(
      "SELECT COUNT(*) AS n FROM vote_sessions WHERE expires_at > NOW() AND revoked = 0"
    );
    const [[sessQuota]] = await pool.execute(
      `SELECT COUNT(*) AS n FROM vote_sessions
       WHERE created_at > ${since24h} AND vote_count >= max_votes`
    );
    const [[flagged]] = await pool.execute(
      `SELECT COUNT(*) AS n FROM vote_flags WHERE flagged_at > ${since24h}`
    );
    const [[clusters]] = await pool.execute(
      `SELECT COUNT(DISTINCT cluster_id) AS n FROM vote_flags WHERE flagged_at > ${since24h}`
    );
    const [byReason] = await pool.execute(
      `SELECT reason, COUNT(*) AS n FROM bot_attempts
       WHERE created_at > ${since24h} GROUP BY reason`
    );
    const bot_attempts_24h = Object.fromEntries(byReason.map(r => [r.reason, Number(r.n)]));

    res.json({
      sessions_active: Number(sessActive.n),
      sessions_quota_exceeded_24h: Number(sessQuota.n),
      flagged_votes_24h: Number(flagged.n),
      flagged_clusters_24h: Number(clusters.n),
      bot_attempts_24h,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

export default router;
