import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { getAllSites, getSiteById, createSite, updateSite, deleteSite } from "../services/sites.service.js";

const router = Router();

router.get("/", async (_req, res) => {
  const sites = await getAllSites();
  res.json(sites);
});

router.get("/:id", async (req, res) => {
  const site = await getSiteById(Number(req.params.id));
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json(site);
});

router.post("/", requireAdmin, async (req, res) => {
  const { name, url, logo_path } = req.body;
  if (!name || !url || !logo_path) {
    res.status(400).json({ error: "name, url, and logo_path required" });
    return;
  }
  const site = await createSite(name, url, logo_path);
  res.status(201).json(site);
});

router.put("/:id", requireAdmin, async (req, res) => {
  const { name, url, logo_path } = req.body;
  if (!name || !url || !logo_path) {
    res.status(400).json({ error: "name, url, and logo_path required" });
    return;
  }
  const site = await updateSite(Number(req.params.id), name, url, logo_path);
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json(site);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const deleted = await deleteSite(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.status(204).send();
});

export default router;
