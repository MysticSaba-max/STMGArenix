import pool from "../db/database.js";

export async function getGlobalLeaderboard() {
  const [rows] = await pool.execute(`
    SELECT
      s.id, s.name, s.url, s.logo_path,
      COALESCE(SUM(CASE WHEN v.vote_type = 'up' THEN 1 ELSE 0 END), 0) as upvotes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'down' THEN 1 ELSE 0 END), 0) as downvotes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'up' THEN 1 ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN v.vote_type = 'down' THEN 1 ELSE 0 END), 0) as score,
      COUNT(v.id) as total_votes
    FROM sites s
    LEFT JOIN votes v ON s.id = v.site_id
    GROUP BY s.id
    ORDER BY score DESC, upvotes DESC
  `);
  return rows;
}

export async function getCategoryLeaderboard(category) {
  const [rows] = await pool.execute(`
    SELECT
      s.id, s.name, s.url, s.logo_path,
      COALESCE(ROUND(AVG(cv.score), 1), 0) as avg_score,
      COUNT(cv.id) as vote_count
    FROM sites s
    LEFT JOIN category_votes cv ON s.id = cv.site_id AND cv.category = ?
    GROUP BY s.id
    ORDER BY avg_score DESC, vote_count DESC
  `, [category]);
  return rows;
}

export async function getAllCategoriesLeaderboard() {
  const categories = ["pubs", "facilite", "liens", "catalogue", "qualite_video"];
  const result = {};
  for (const cat of categories) {
    result[cat] = await getCategoryLeaderboard(cat);
  }
  return result;
}
