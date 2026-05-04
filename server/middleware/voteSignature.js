import { createHmac, timingSafeEqual } from "node:crypto";

const SKEW_MS = 30 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const seenNonces = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [n, exp] of seenNonces) {
    if (exp < now) seenNonces.delete(n);
    else break;
  }
}, 60 * 1000).unref();

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function verifyVoteSignature(req, res, next) {
  const { ts, nonce, sig, ...rest } = req.body || {};
  const signingKey = req.voteSession?.signingKey;

  if (!signingKey) {
    return res.status(500).json({ error: "Session non chargée", code: "NO_KEY" });
  }
  if (!ts || !nonce || !sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Signature manquante", code: "MISSING_SIG" });
  }
  const tsNum = Number(ts);
  const drift = Math.abs(Date.now() - tsNum);
  if (!Number.isFinite(drift) || drift > SKEW_MS) {
    return res.status(403).json({ error: "Horloge désynchronisée", code: "BAD_TS" });
  }

  const nonceKey = `${req.voteSession.jti}:${nonce}`;
  if (seenNonces.has(nonceKey)) {
    return res.status(403).json({ error: "Requête déjà soumise", code: "REPLAY" });
  }

  const payloadToSign = { ...rest, ts: tsNum, nonce };
  const expected = createHmac("sha256", Buffer.from(signingKey, "hex"))
    .update(canonical(payloadToSign))
    .digest();

  let provided;
  try {
    provided = Buffer.from(sig, "hex");
  } catch {
    return res.status(400).json({ error: "Signature invalide", code: "BAD_SIG_FORMAT" });
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(403).json({ error: "Signature invalide", code: "BAD_SIG" });
  }

  seenNonces.set(nonceKey, Date.now() + NONCE_TTL_MS);
  next();
}
