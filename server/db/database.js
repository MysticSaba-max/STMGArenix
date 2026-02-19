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

  console.log("Database tables initialized.");
}

export default pool;
