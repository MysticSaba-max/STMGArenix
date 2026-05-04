import { createHmac, timingSafeEqual } from "node:crypto";

const SKEW_MS = 30 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_NONCE_LEN = 128;
const SIG_RE = /^[0-9a-f]{64}$/i; // SHA-256 = 32 bytes = 64 hex chars
const seenNonces = new Map();

// Cleanup invariant: tous les nonces sont insérés avec la même TTL
// (NONCE_TTL_MS), donc l'ordre d'insertion (=ordre d'itération du Map en JS)
// correspond exactement à l'ordre d'expiration. Le premier nonce non-expiré
// rencontré garantit que tous les suivants sont également non-expirés.
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
  if (
    !ts ||
    !nonce ||
    !sig ||
    typeof sig !== "string" ||
    typeof nonce !== "string" ||
    nonce.length > MAX_NONCE_LEN
  ) {
    return res.status(400).json({ error: "Signature manquante", code: "MISSING_SIG" });
  }
  const tsNum = Number(ts);
  const drift = Math.abs(Date.now() - tsNum);
  if (!Number.isFinite(drift) || drift > SKEW_MS) {
    return res.status(403).json({ error: "Horloge désynchronisée", code: "BAD_TS" });
  }

  // Validation explicite du format hex AVANT Buffer.from — note importante :
  // Buffer.from(sig, "hex") ne throw PAS sur du hex invalide (il tronque à
  // la première paire invalide), donc un try/catch ici serait du code mort.
  if (!SIG_RE.test(sig)) {
    return res.status(400).json({ error: "Signature invalide", code: "BAD_SIG_FORMAT" });
  }

  const nonceKey = `${req.voteSession.jti}:${nonce}`;
  if (seenNonces.has(nonceKey)) {
    return res.status(403).json({ error: "Requête déjà soumise", code: "REPLAY" });
  }

  const payloadToSign = { ...rest, ts: tsNum, nonce };
  const expected = createHmac("sha256", Buffer.from(signingKey, "hex"))
    .update(canonical(payloadToSign))
    .digest();
  const provided = Buffer.from(sig, "hex");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(403).json({ error: "Signature invalide", code: "BAD_SIG" });
  }

  seenNonces.set(nonceKey, Date.now() + NONCE_TTL_MS);
  next();
}

// Test helper : utilisé uniquement par les tests pour réinitialiser l'état
// global entre les cas (les tests REPLAY laissent des entrées dans seenNonces).
export function _resetSeenNoncesForTest() {
  seenNonces.clear();
}
