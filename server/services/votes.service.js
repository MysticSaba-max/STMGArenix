import pool from "../db/database.js";
import { createHash } from "crypto";

function hashIp(ip) {
  return createHash("sha256").update(ip).digest("hex");
}

export async function castVote(siteId, fingerprintHash, ip, voteType) {
  const ipHash = hashIp(ip);

  // Check existing vote by fingerprint
  const [fpRows] = await pool.execute(
    "SELECT id, vote_type FROM votes WHERE site_id = ? AND fingerprint = ?",
    [siteId, fingerprintHash]
  );

  // Check existing vote by IP
  const [ipRows] = await pool.execute(
    "SELECT id, vote_type FROM votes WHERE site_id = ? AND ip_hash = ?",
    [siteId, ipHash]
  );

  const existing = fpRows[0] || ipRows[0];

  if (existing) {
    if (existing.vote_type === voteType) {
      await pool.execute("DELETE FROM votes WHERE id = ?", [existing.id]);
      return { success: true, action: "removed" };
    } else {
      await pool.execute("UPDATE votes SET vote_type = ?, fingerprint = ?, ip_hash = ? WHERE id = ?", [voteType, fingerprintHash, ipHash, existing.id]);
      return { success: true, action: "updated" };
    }
  }

  await pool.execute(
    "INSERT INTO votes (site_id, fingerprint, ip_hash, vote_type) VALUES (?, ?, ?, ?)",
    [siteId, fingerprintHash, ipHash, voteType]
  );
  return { success: true, action: "created" };
}

export async function castCategoryVote(siteId, category, fingerprintHash, ip, score) {
  const ipHash = hashIp(ip);

  // Check existing by fingerprint
  const [fpRows] = await pool.execute(
    "SELECT id FROM category_votes WHERE site_id = ? AND category = ? AND fingerprint = ?",
    [siteId, category, fingerprintHash]
  );

  // Check existing by IP
  const [ipRows] = await pool.execute(
    "SELECT id FROM category_votes WHERE site_id = ? AND category = ? AND ip_hash = ?",
    [siteId, category, ipHash]
  );

  const existing = fpRows[0] || ipRows[0];

  if (existing) {
    await pool.execute("UPDATE category_votes SET score = ?, fingerprint = ?, ip_hash = ? WHERE id = ?", [score, fingerprintHash, ipHash, existing.id]);
  } else {
    await pool.execute(
      "INSERT INTO category_votes (site_id, category, fingerprint, ip_hash, score) VALUES (?, ?, ?, ?, ?)",
      [siteId, category, fingerprintHash, ipHash, score]
    );
  }

  return { success: true };
}

export async function getUserVotes(fingerprintHash, ip) {
  const ipHash = hashIp(ip);

  // Get votes matching fingerprint OR IP
  const [globalVotes] = await pool.execute(
    "SELECT site_id, vote_type FROM votes WHERE fingerprint = ? OR ip_hash = ?",
    [fingerprintHash, ipHash]
  );
  const [categoryVotes] = await pool.execute(
    "SELECT site_id, category, score FROM category_votes WHERE fingerprint = ? OR ip_hash = ?",
    [fingerprintHash, ipHash]
  );
  return { globalVotes, categoryVotes };
}
