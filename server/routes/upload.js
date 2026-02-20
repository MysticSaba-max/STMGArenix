import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireAdmin } from "../middleware/auth.js";

const LOGOS_DIR = path.join(process.cwd(), "public", "logos");

// Créer le dossier si nécessaire
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true, mode: 0o755 });
}

// Types MIME autorisés
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Extensions autorisées
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// Magic bytes des formats images
const MAGIC_BYTES = [
  { bytes: [0xff, 0xd8, 0xff] },          // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47] },    // PNG
  { bytes: [0x47, 0x49, 0x46, 0x38] },    // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46] },    // WebP (RIFF)
];

function checkMagicBytes(buffer) {
  return MAGIC_BYTES.some(({ bytes }) => bytes.every((b, i) => buffer[i] === b));
}

// Stockage en mémoire — on écrit le fichier manuellement pour gérer les erreurs EACCES
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      return cb(new Error("Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou GIF."));
    }
    cb(null, true);
  },
});

const router = Router();

// POST /api/upload/logo — upload d'un logo (admin uniquement)
router.post("/logo", requireAdmin, (req, res) => {
  upload.single("logo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Fichier trop volumineux (max 2 MB)." });
      }
      return res.status(400).json({ error: `Erreur upload: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni." });
    }

    // Vérification magic bytes sur le buffer en mémoire
    if (!checkMagicBytes(req.file.buffer)) {
      return res.status(400).json({ error: "Fichier invalide : ce n'est pas une image." });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    const destPath = path.join(LOGOS_DIR, filename);

    try {
      fs.mkdirSync(LOGOS_DIR, { recursive: true, mode: 0o755 });
      fs.writeFileSync(destPath, req.file.buffer, { mode: 0o644 });
    } catch (writeErr) {
      console.error("[upload] Erreur écriture fichier:", writeErr.message);
      return res.status(500).json({ error: "Impossible de sauvegarder le fichier. Vérifiez les permissions du dossier public/logos." });
    }

    return res.json({ path: `/logos/${filename}` });
  });
});

// DELETE /api/upload/logo — supprimer un logo existant (admin uniquement)
router.delete("/logo", requireAdmin, (req, res) => {
  const { filename } = req.body;
  if (!filename || typeof filename !== "string") {
    return res.status(400).json({ error: "Nom de fichier requis." });
  }

  // Sécurité : interdire les path traversal
  const safeName = path.basename(filename);
  if (safeName !== filename || safeName.includes("..")) {
    return res.status(400).json({ error: "Nom de fichier invalide." });
  }

  const filePath = path.join(LOGOS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier introuvable." });
  }

  fs.unlinkSync(filePath);
  return res.json({ success: true });
});

export default router;
