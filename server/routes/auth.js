import { Router } from "express";
import { loginAdmin } from "../services/auth.service.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const token = await loginAdmin(username, password);
  if (!token) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json({ token });
});

export default router;
