import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import { requireAdmin } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(process.cwd(), "public", "logos");

// Créer le dossier si nécessaire
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
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
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },          // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },     // PNG
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },     // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },    // RIFF (WebP)
];

function checkMagicBytes(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(12);
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);

  for (const { bytes } of MAGIC_BYTES) {
    if (bytes.every((b, i) => buffer[i] === b)) return true;
  }
  return false;
}

const storage = multer.diskStorage({
  destination: LOGOS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
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

    // Double vérification via magic bytes
    const filePath = path.join(LOGOS_DIR, req.file.filename);
    if (!checkMagicBytes(filePath)) {
      fs.unlinkSync(filePath); // Supprimer le fichier malveillant
      return res.status(400).json({ error: "Fichier invalide : ce n'est pas une image." });
    }

    return res.json({ path: `/logos/${req.file.filename}` });
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
