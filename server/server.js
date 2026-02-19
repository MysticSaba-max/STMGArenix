import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { initDatabase } from "./db/database.js";
import authRoutes from "./routes/auth.js";
import sitesRoutes from "./routes/sites.js";
import votesRoutes from "./routes/votes.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/votes", voteLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/votes", votesRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/admin", adminRoutes);

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
