import pool from "../db/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// ─── JWT Secret — JAMAIS de fallback statique connu ───────────────────────────
// Si JWT_SECRET est absent/par défaut, on génère un secret aléatoire éphémère :
// non forgeable, mais les tokens deviennent invalides au redémarrage (dev only).
const _envSecret = process.env.JWT_SECRET;
const _defaultValue = "change-me-in-production-use-random-string";
if (!_envSecret || _envSecret === _defaultValue) {
  console.warn("⚠️  JWT_SECRET manquant ou valeur par défaut — secret aléatoire éphémère utilisé (tokens invalidés au redémarrage).");
}
const JWT_SECRET = (_envSecret && _envSecret !== _defaultValue)
  ? _envSecret
  : crypto.randomBytes(32).toString("hex");
const SALT_ROUNDS = 12;

// ─── Validation ───────────────────────────────────────────────────────────────
function validateUsername(username) {
  if (typeof username !== "string") return false;
  const t = username.trim();
  return t.length >= 3 && t.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(t);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

// ─── Authentification ─────────────────────────────────────────────────────────
export async function loginAdmin(username, password) {
  if (!validateUsername(username) || !validatePassword(password)) return null;

  const [rows] = await pool.execute(
    "SELECT * FROM admins WHERE username = ?",
    [username.trim()]
  );
  const admin = rows[0];
  if (!admin) {
    // Timing-safe : toujours lancer bcrypt même si l'admin n'existe pas
    await bcrypt.compare(password, "$2b$12$invalidhashforsecurityxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    return null;
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return null;

  return jwt.sign(
    { id: admin.id, username: admin.username },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ─── Gestion multi-admins ─────────────────────────────────────────────────────
export async function listAdmins() {
  const [rows] = await pool.execute(
    "SELECT id, username, created_at FROM admins ORDER BY created_at ASC"
  );
  return rows;
}

export async function createAdmin(username, password) {
  if (!validateUsername(username)) {
    throw new Error("Nom d'utilisateur invalide (3-32 caractères, lettres/chiffres/_/-).");
  }
  if (!validatePassword(password)) {
    throw new Error("Mot de passe invalide (minimum 8 caractères).");
  }

  const [existing] = await pool.execute(
    "SELECT id FROM admins WHERE username = ?",
    [username.trim()]
  );
  if (existing.length > 0) {
    throw new Error("Ce nom d'utilisateur est déjà utilisé.");
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await pool.execute(
    "INSERT INTO admins (username, password_hash) VALUES (?, ?)",
    [username.trim(), hash]
  );
  const [rows] = await pool.execute(
    "SELECT id, username, created_at FROM admins WHERE username = ?",
    [username.trim()]
  );
  return rows[0];
}

export async function deleteAdmin(targetId, requestingAdminId) {
  if (Number(targetId) === Number(requestingAdminId)) {
    throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
  }
  const [countRows] = await pool.execute("SELECT COUNT(*) as cnt FROM admins");
  if (Number(countRows[0].cnt) <= 1) {
    throw new Error("Impossible de supprimer le dernier compte admin.");
  }
  const [result] = await pool.execute("DELETE FROM admins WHERE id = ?", [targetId]);
  return result.affectedRows > 0;
}

export async function changeAdminPassword(targetId, newPassword) {
  if (!validatePassword(newPassword)) {
    throw new Error("Nouveau mot de passe invalide (minimum 8 caractères).");
  }
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const [result] = await pool.execute(
    "UPDATE admins SET password_hash = ? WHERE id = ?",
    [hash, targetId]
  );
  return result.affectedRows > 0;
}
