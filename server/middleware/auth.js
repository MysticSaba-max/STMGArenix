import { verifyToken } from "../services/auth.service.js";

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token required" });
    return;
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.admin = payload;
  next();
}
