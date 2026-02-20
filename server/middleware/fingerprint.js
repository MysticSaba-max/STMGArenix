import { createHash } from "crypto";

export function hashFingerprint(fp) {
  return createHash("sha256").update(fp).digest("hex");
}

export function requireFingerprint(req, res, next) {
  const { fingerprint } = req.body;
  // Min 32 chars : un fingerprint légitime est toujours un hash hex (64 chars minimum).
  // Bloquer les chaînes trop courtes qui permettraient des collisions volontaires.
  if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 32 || fingerprint.length > 512) {
    res.status(400).json({ error: "Valid fingerprint required" });
    return;
  }
  req.body.fingerprintHash = hashFingerprint(fingerprint);
  next();
}
