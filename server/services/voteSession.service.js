// server/services/voteSession.service.js
import crypto from "node:crypto";
import pool from "../db/database.js";

const SESSION_TTL_MS = 60 * 60 * 1000;
export const SESSION_MAX_VOTES = 16;

export async function createVoteSession({ fpHash, ipSubnet, botScore, maxVotes = SESSION_MAX_VOTES }) {
  const jti = crypto.randomBytes(16).toString("hex");
  const signingKey = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.execute(
    `INSERT INTO vote_sessions
     (jti, fp_hash, ip_subnet, signing_key, bot_score, max_votes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [jti, fpHash, ipSubnet, signingKey, botScore, maxVotes, expiresAt]
  );
  return { jti, signingKey, expiresAt };
}

export async function consumeVoteSession({ jti, fpHash, ipSubnet }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT signing_key, vote_count, max_votes, fp_hash, ip_subnet, revoked, bot_score
       FROM vote_sessions WHERE jti = ? AND expires_at > NOW() FOR UPDATE`,
      [jti]
    );
    const sess = rows[0];
    if (!sess || sess.revoked) {
      await conn.rollback();
      return { ok: false, code: "SESSION_EXPIRED" };
    }
    if (sess.vote_count >= sess.max_votes) {
      await conn.rollback();
      return { ok: false, code: "QUOTA_EXCEEDED" };
    }
    if (sess.fp_hash !== fpHash) {
      await conn.rollback();
      return { ok: false, code: "FP_MISMATCH" };
    }
    if (sess.ip_subnet !== ipSubnet) {
      await conn.rollback();
      return { ok: false, code: "IP_MISMATCH" };
    }
    await conn.execute(
      "UPDATE vote_sessions SET vote_count = vote_count + 1 WHERE jti = ?",
      [jti]
    );
    await conn.commit();
    return { ok: true, signingKey: sess.signing_key, botScore: sess.bot_score };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function revokeVoteSession(jti) {
  await pool.execute("UPDATE vote_sessions SET revoked = 1 WHERE jti = ?", [jti]);
}
