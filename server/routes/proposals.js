import { Router } from "express";
import { createHash } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "../db/database.js";

const LOGOS_DIR = path.join(process.cwd(), "public", "logos");

if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

// ─── Validation fichiers (identique à upload.js) ─────────────────────────────
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const MAGIC_BYTES = [
  { bytes: [0xff, 0xd8, 0xff] }, // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46] }, // WebP (RIFF)
];

function checkMagicBytes(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(12);
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);
    return MAGIC_BYTES.some(({ bytes }) => bytes.every((b, i) => buffer[i] === b));
  } catch {
    return false;
  }
}

function normalizeIp(ip) {
  if (!ip) return "";
  const v4 = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  return v4 ? v4[1] : ip.trim();
}

function hashIp(ip) {
  return createHash("sha256").update(ip || "").digest("hex");
}

// ─── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: LOGOS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      return cb(new Error("Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou GIF."));
    }
    cb(null, true);
  },
});

// ─── Rate limiters ────────────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 5,
  validate: { trustProxy: false },
  message: { error: "Trop d'uploads, réessayez dans 1 heure." },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h (le vrai délai 7j est vérifié en DB)
  max: 3,
  validate: { trustProxy: false },
  message: { error: "Trop de tentatives, réessayez plus tard." },
});

const router = Router();

// ─── POST /api/proposals/upload ─ Upload icône de proposition (public) ────────
router.post("/upload", uploadLimiter, (req, res) => {
  upload.single("logo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Fichier trop volumineux (max 2 MB)." });
      }
      return res.status(400).json({ error: `Erreur upload : ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni." });

    const filePath = path.join(LOGOS_DIR, req.file.filename);
    if (!checkMagicBytes(filePath)) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Fichier invalide : ce n'est pas une image." });
    }

    return res.json({ path: `/logos/${req.file.filename}` });
  });
});

// ─── POST /api/proposals ─ Soumettre une proposition ─────────────────────────
router.post("/", submitLimiter, async (req, res) => {
  const { name, url, logo_path } = req.body;

  // Validation du nom
  if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return res.status(400).json({ error: "Nom invalide (2–100 caractères requis)." });
  }

  // Validation de l'URL
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL requise." });
  }
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: "URL invalide. Elle doit commencer par http:// ou https://." });
  }

  // Validation du logo_path (si fourni, doit être un chemin /logos/ connu)
  if (logo_path && typeof logo_path === "string" && logo_path.trim()) {
    const safeName = path.basename(logo_path.trim());
    const filePath = path.join(LOGOS_DIR, safeName);
    if (!logo_path.trim().startsWith("/logos/") || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: "Logo invalide." });
    }
  }

  const rawIp = req.ip || req.socket?.remoteAddress || "";
  const ipHash = hashIp(normalizeIp(rawIp));

  try {
    // ── Vérification du délai 7 jours par IP ──────────────────────────────────
    const [recent] = await pool.execute(
      "SELECT submitted_at FROM site_proposals WHERE ip_hash = ? AND submitted_at > DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY submitted_at DESC LIMIT 1",
      [ipHash]
    );

    if (recent.length > 0) {
      const nextAllowed = new Date(new Date(recent[0].submitted_at).getTime() + 7 * 24 * 60 * 60 * 1000);
      const diffDays = Math.ceil((nextAllowed - Date.now()) / (1000 * 60 * 60 * 24));
      return res.status(429).json({
        error: `Vous avez déjà soumis une proposition récemment. Réessayez dans ${diffDays} jour${diffDays > 1 ? "s" : ""}.`,
        code: "PROPOSAL_RATE_LIMITED",
        nextAllowed: nextAllowed.toISOString(),
      });
    }

    await pool.execute(
      "INSERT INTO site_proposals (name, url, logo_path, ip_hash) VALUES (?, ?, ?, ?)",
      [name.trim(), url.trim(), (logo_path || "").trim(), ipHash]
    );

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("[proposals] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;
