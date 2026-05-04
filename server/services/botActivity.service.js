// server/services/botActivity.service.js
import pool from "../db/database.js";

export async function logBotAttempt({ ipHash, reason, botScore = 0, userAgent = null }) {
  try {
    await pool.execute(
      `INSERT INTO bot_attempts (ip_hash, reason, bot_score, user_agent) VALUES (?, ?, ?, ?)`,
      [ipHash, reason, botScore, userAgent]
    );
  } catch (err) {
    console.warn("[botActivity] log failed:", err.message);
  }
}

export async function countRecentBotAttempts(ipHash, minutes = 60) {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS n FROM bot_attempts
       WHERE ip_hash = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [ipHash, minutes]
    );
    return Number(rows[0].n) || 0;
  } catch (err) {
    console.warn("[botActivity] count failed:", err.message);
    return 0;
  }
}
