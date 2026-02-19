import pool from "../db/database.js";

export async function castVote(siteId, fingerprintHash, voteType) {
  const [rows] = await pool.execute("SELECT id, vote_type FROM votes WHERE site_id = ? AND fingerprint = ?", [siteId, fingerprintHash]);
  const existing = rows[0];

  if (existing) {
    if (existing.vote_type === voteType) {
      await pool.execute("DELETE FROM votes WHERE id = ?", [existing.id]);
      return { success: true, action: "removed" };
    } else {
      await pool.execute("UPDATE votes SET vote_type = ? WHERE id = ?", [voteType, existing.id]);
      return { success: true, action: "updated" };
    }
  }

  await pool.execute("INSERT INTO votes (site_id, fingerprint, vote_type) VALUES (?, ?, ?)", [siteId, fingerprintHash, voteType]);
  return { success: true, action: "created" };
}

export async function castCategoryVote(siteId, category, fingerprintHash, score) {
  const [rows] = await pool.execute("SELECT id FROM category_votes WHERE site_id = ? AND category = ? AND fingerprint = ?", [siteId, category, fingerprintHash]);
  const existing = rows[0];

  if (existing) {
    await pool.execute("UPDATE category_votes SET score = ? WHERE id = ?", [score, existing.id]);
  } else {
    await pool.execute("INSERT INTO category_votes (site_id, category, fingerprint, score) VALUES (?, ?, ?, ?)", [siteId, category, fingerprintHash, score]);
  }

  return { success: true };
}

export async function getUserVotes(fingerprintHash) {
  const [globalVotes] = await pool.execute("SELECT site_id, vote_type FROM votes WHERE fingerprint = ?", [fingerprintHash]);
  const [categoryVotes] = await pool.execute("SELECT site_id, category, score FROM category_votes WHERE fingerprint = ?", [fingerprintHash]);
  return { globalVotes, categoryVotes };
}
