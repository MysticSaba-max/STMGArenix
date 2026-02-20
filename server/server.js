import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "./db/database.js";
import authRoutes from "./routes/auth.js";
import sitesRoutes from "./routes/sites.js";
import votesRoutes from "./routes/votes.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import adminRoutes from "./routes/admin.js";
import uploadRoutes from "./routes/upload.js";
import { detectBot, requireLowBotScore } from "./middleware/antibot.js";
import { blockVpnProxy } from "./middleware/vpn.js";
import proposalsRoutes from "./routes/proposals.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

// ─── Trust proxy (Cloudflare / nginx) ───────────────────────────────────────
app.set("trust proxy", 1);

// ─── Headers de sécurité HTTP ────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';"
  );
  next();
});

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsOptions = ALLOWED_ORIGIN
  ? {
      origin: (origin, callback) => {
        if (!origin || origin === ALLOWED_ORIGIN) {
          callback(null, true);
        } else {
          callback(new Error("CORS non autorisé"));
        }
      },
      credentials: true,
    }
  : { origin: true, credentials: true };

app.use(cors(corsOptions));

// ─── Fichiers statiques (logos uploadés) ─────────────────────────────────────
const PUBLIC_DIR = path.join(process.cwd(), "public");
app.use(express.static(PUBLIC_DIR, {
  maxAge: "7d",
  etag: true,
  dotfiles: "deny", // Interdire les fichiers cachés
}));

// ─── Body parser (limite la taille des requêtes) ─────────────────────────────
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

// ─── Application des middlewares globaux ──────────────────────────────────────
app.use("/api", detectBot);                // Détection bots UA/headers
app.use("/api/votes", requireLowBotScore); // Score comportemental client

// ─── Anti-VPN uniquement sur les routes de vote (async) ──────────────────────
// On enveloppe pour que le middleware async soit appliqué correctement
app.use("/api/votes", (req, res, next) => blockVpnProxy(req, res, next));

// ─── Health check (sans protection pour les monitors) ────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/votes", votesRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/proposals", proposalsRoutes);

// ─── 404 par défaut ──────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route non trouvée" });
});

// ─── Gestionnaire d'erreurs global ───────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Erreur serveur:", err.message || err);
  res.status(500).json({ error: "Erreur serveur interne" });
});

// ─── Démarrage avec retry MySQL ───────────────────────────────────────────────
async function start(retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initDatabase();
      app.listen(PORT, () => {
        console.log(`\n✅ Serveur démarré sur http://localhost:${PORT}`);
        console.log(`   Mode: ${process.env.TURNSTILE_SECRET_KEY ? "Production" : "Développement (Turnstile désactivé)"}`);
        console.log(`   Base de données: ${process.env.DB_NAME || "stmgarenix"} @ ${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || 3306}\n`);
      });
      return;
    } catch (err) {
      if (err.code === "ECONNREFUSED" || err.code === "ER_ACCESS_DENIED_ERROR" || err.errno === -4078) {
        if (attempt < retries) {
          console.error(`⚠️  MySQL non disponible (tentative ${attempt}/${retries}) — nouvelle tentative dans ${delayMs / 1000}s...`);
          console.error(`   Vérifie que MySQL est démarré (XAMPP, WAMP, ou service Windows)`);
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          console.error(`\n❌ Impossible de se connecter à MySQL après ${retries} tentatives.`);
          console.error(`   → Démarre MySQL (XAMPP panel, WAMP, ou "net start MySQL" en admin)`);
          console.error(`   → Vérifie server/.env : DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME`);
          process.exit(1);
        }
      } else {
        console.error("Échec du démarrage:", err.message || err);
        process.exit(1);
      }
    }
  }
}

start();
