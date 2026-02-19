import { createHash } from "crypto";

export function hashFingerprint(fp) {
  return createHash("sha256").update(fp).digest("hex");
}

export function requireFingerprint(req, res, next) {
  const { fingerprint } = req.body;
  if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 5) {
    res.status(400).json({ error: "Valid fingerprint required" });
    return;
  }
  req.body.fingerprintHash = hashFingerprint(fingerprint);
  next();
}
