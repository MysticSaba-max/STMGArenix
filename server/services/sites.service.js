import pool from "../db/database.js";

export async function getAllSites() {
  const [rows] = await pool.execute("SELECT * FROM sites ORDER BY name");
  return rows;
}

export async function getSiteById(id) {
  const [rows] = await pool.execute("SELECT * FROM sites WHERE id = ?", [id]);
  return rows[0];
}

export async function createSite(name, url, logo_path) {
  const [result] = await pool.execute("INSERT INTO sites (name, url, logo_path) VALUES (?, ?, ?)", [name, url, logo_path]);
  return getSiteById(result.insertId);
}

export async function updateSite(id, name, url, logo_path) {
  await pool.execute("UPDATE sites SET name = ?, url = ?, logo_path = ? WHERE id = ?", [name, url, logo_path, id]);
  return getSiteById(id);
}

export async function deleteSite(id) {
  const [result] = await pool.execute("DELETE FROM sites WHERE id = ?", [id]);
  return result.affectedRows > 0;
}
