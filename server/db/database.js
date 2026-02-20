import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "stmgarenix",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function initDatabase() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      url VARCHAR(500) NOT NULL,
      logo_path VARCHAR(500) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS votes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      site_id INT NOT NULL,
      fingerprint VARCHAR(255) NOT NULL,
      ip_hash VARCHAR(255) DEFAULT NULL,
      vote_type ENUM('up', 'down') NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS category_votes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      site_id INT NOT NULL,
      category ENUM('pubs', 'facilite', 'liens', 'catalogue', 'qualite_video') NOT NULL,
      fingerprint VARCHAR(255) NOT NULL,
      ip_hash VARCHAR(255) DEFAULT NULL,
      score INT NOT NULL CHECK(score BETWEEN 1 AND 5),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des tentatives suspectes / activité bot
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS bot_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip_hash VARCHAR(255) NOT NULL,
      reason VARCHAR(100) NOT NULL,
      bot_score INT DEFAULT 0,
      user_agent TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ip_hash (ip_hash),
      INDEX idx_created_at (created_at)
    )
  `);

  // Table cache de réputation IP (VPN/proxy)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ip_reputation_cache (
      ip_hash VARCHAR(255) PRIMARY KEY,
      is_proxy TINYINT(1) DEFAULT 0,
      is_vpn TINYINT(1) DEFAULT 0,
      is_tor TINYINT(1) DEFAULT 0,
      country_code VARCHAR(5) DEFAULT NULL,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_checked_at (checked_at)
    )
  `);

  // Add ip_hash column if it doesn't exist (migration for existing tables)
  try {
    await pool.execute("ALTER TABLE votes ADD COLUMN ip_hash VARCHAR(255) DEFAULT NULL");
  } catch { /* column already exists */ }

  try {
    await pool.execute("ALTER TABLE category_votes ADD COLUMN ip_hash VARCHAR(255) DEFAULT NULL");
  } catch { /* column already exists */ }

  // Drop old unique constraints that only used fingerprint
  try {
    await pool.execute("ALTER TABLE votes DROP INDEX unique_vote");
  } catch { /* already dropped */ }

  try {
    await pool.execute("ALTER TABLE category_votes DROP INDEX unique_cat_vote");
  } catch { /* already dropped */ }

  // Table des propositions de sites
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS site_proposals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      url VARCHAR(500) NOT NULL,
      logo_path VARCHAR(500) DEFAULT '',
      ip_hash VARCHAR(64) NOT NULL,
      status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME DEFAULT NULL,
      INDEX idx_proposal_ip (ip_hash),
      INDEX idx_proposal_status (status)
    )
  `);

  // Migrations pour la table site_proposals (ajout type / site_id / modification_note)
  try {
    await pool.execute(
      "ALTER TABLE site_proposals ADD COLUMN type ENUM('new_site','modification') NOT NULL DEFAULT 'new_site'"
    );
  } catch { /* column already exists */ }
  try {
    await pool.execute("ALTER TABLE site_proposals ADD COLUMN site_id INT NULL DEFAULT NULL");
  } catch { /* column already exists */ }
  try {
    await pool.execute(
      "ALTER TABLE site_proposals ADD COLUMN modification_note VARCHAR(500) NULL DEFAULT NULL"
    );
  } catch { /* column already exists */ }

  // Nettoyage des vieilles entrées bot_attempts (> 30 jours)
  try {
    await pool.execute(
      "DELETE FROM bot_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
  } catch { /* ignore */ }

  // Nettoyage du cache IP > 24h
  try {
    await pool.execute(
      "DELETE FROM ip_reputation_cache WHERE checked_at < DATE_SUB(NOW(), INTERVAL 1 DAY)"
    );
  } catch { /* ignore */ }

  console.log("Database tables initialized.");
}

export default pool;
