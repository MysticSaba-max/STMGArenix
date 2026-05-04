import pool from "../db/database.js";
import {
  computeCategoryTrustScores,
  computeBinaryTrustScores,
} from "../utils/trustScore.js";

// Décroissance temporelle exponentielle, demi-vie = 365 jours
//   poids(âge) = 0.5 ^ (âge / demi_vie) = exp(-ln(2) * âge / demi_vie)
const HALF_LIFE_DAYS = 365;
const LN2 = 0.6931471805599453;

/**
 * Classement global basé sur le STMG TrustScore (votes up/down).
 */
export async function getGlobalLeaderboard() {
  const [rows] = await pool.execute(
    `
    SELECT
      s.id, s.name, s.url, s.logo_path,
      COALESCE(SUM(CASE WHEN v.vote_type = 'up' THEN 1 ELSE 0 END), 0) AS upvotes,
      COALESCE(SUM(CASE WHEN v.vote_type = 'down' THEN 1 ELSE 0 END), 0) AS downvotes,
      COALESCE(SUM(
        CASE WHEN v.vote_type = 'up'
             THEN EXP(-? * GREATEST(0, DATEDIFF(NOW(), v.created_at)) / ?)
             ELSE 0 END
      ), 0) AS weighted_up,
      COALESCE(SUM(
        CASE WHEN v.vote_type = 'down'
             THEN EXP(-? * GREATEST(0, DATEDIFF(NOW(), v.created_at)) / ?)
             ELSE 0 END
      ), 0) AS weighted_down
    FROM sites s
    LEFT JOIN votes v
      ON s.id = v.site_id
      AND NOT EXISTS (
        SELECT 1 FROM vote_flags f
        WHERE f.vote_id = v.id AND f.table_name = 'votes'
      )
    GROUP BY s.id
    `,
    [LN2, HALF_LIFE_DAYS, LN2, HALF_LIFE_DAYS]
  );

  return computeBinaryTrustScores(rows);
}

/**
 * Classement par catégorie basé sur le STMG TrustScore (notes 1-5).
 */
export async function getCategoryLeaderboard(category) {
  const [rows] = await pool.execute(
    `
    SELECT
      s.id, s.name, s.url, s.logo_path,
      COUNT(cv.id) AS raw_count,
      COALESCE(AVG(cv.score), 0) AS raw_avg,
      COALESCE(SUM(cv.score * cv.score), 0) AS sum_sq,
      COALESCE(SUM(
        EXP(-? * GREATEST(0, DATEDIFF(NOW(), cv.created_at)) / ?)
      ), 0) AS weighted_count,
      COALESCE(SUM(
        EXP(-? * GREATEST(0, DATEDIFF(NOW(), cv.created_at)) / ?) * cv.score
      ), 0) AS weighted_sum,
      COALESCE(SUM(CASE WHEN cv.score = 1 THEN 1 ELSE 0 END), 0) AS count_1,
      COALESCE(SUM(CASE WHEN cv.score = 2 THEN 1 ELSE 0 END), 0) AS count_2,
      COALESCE(SUM(CASE WHEN cv.score = 3 THEN 1 ELSE 0 END), 0) AS count_3,
      COALESCE(SUM(CASE WHEN cv.score = 4 THEN 1 ELSE 0 END), 0) AS count_4,
      COALESCE(SUM(CASE WHEN cv.score = 5 THEN 1 ELSE 0 END), 0) AS count_5
    FROM sites s
    LEFT JOIN category_votes cv
      ON s.id = cv.site_id
      AND cv.category = ?
      AND NOT EXISTS (
        SELECT 1 FROM vote_flags f
        WHERE f.vote_id = cv.id AND f.table_name = 'category_votes'
      )
    GROUP BY s.id
    `,
    [LN2, HALF_LIFE_DAYS, LN2, HALF_LIFE_DAYS, category]
  );

  return computeCategoryTrustScores(rows);
}

export async function getAllCategoriesLeaderboard() {
  const categories = ["pubs", "facilite", "liens", "catalogue", "qualite_video"];
  const result = {};
  for (const cat of categories) {
    result[cat] = await getCategoryLeaderboard(cat);
  }
  return result;
}
