import pool, { initDatabase } from "./database.js";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
  await initDatabase();

  const username = process.env.ADMIN_DEFAULT_USER || "admin";
  const password = process.env.ADMIN_DEFAULT_PASS || "admin123";

  const [rows] = await pool.execute("SELECT id FROM admins WHERE username = ?", [username]);
  if (rows.length === 0) {
    const hash = bcrypt.hashSync(password, 10);
    await pool.execute("INSERT INTO admins (username, password_hash) VALUES (?, ?)", [username, hash]);
    console.log(`Admin user '${username}' created.`);
  } else {
    console.log(`Admin user '${username}' already exists.`);
  }

  console.log("Seed complete.");
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
