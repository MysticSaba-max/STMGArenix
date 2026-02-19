import pool from "../db/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";

export async function loginAdmin(username, password) {
  const [rows] = await pool.execute("SELECT * FROM admins WHERE username = ?", [username]);
  const admin = rows[0];
  if (!admin) return null;

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return null;

  return jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
