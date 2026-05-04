// server/middleware/voteRateLimit.js
import { logBotAttempt } from "../services/botActivity.service.js";
import { hashIp } from "../utils/ipHash.js";

const WINDOW_MS = 60 * 60 * 1000;
const LIMITS = { votesByFp: 12, votesByIp: 60, fpsByIp: 8, ipsByFp: 3 };

let votesByFp = new Map();
let votesByIp = new Map();
let fpsByIp = new Map();
let ipsByFp = new Map();

export function _resetForTest() {
  votesByFp = new Map();
  votesByIp = new Map();
  fpsByIp = new Map();
  ipsByFp = new Map();
}

function pruneArr(arr, cutoff) {
  while (arr.length && arr[0] < cutoff) arr.shift();
}
function pruneMap(map, cutoff) {
  for (const [k, v] of map) if (v < cutoff) map.delete(k);
}

export function voteRateLimit(req, res, next) {
  const fp = req.body?.fingerprintHash;
  const ip = req.realIp;
  if (!fp || !ip) {
    return res.status(400).json({ error: "Requête invalide", code: "BAD_RATELIMIT_INPUT" });
  }

  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let arr = votesByFp.get(fp) || [];
  pruneArr(arr, cutoff);
  if (arr.length >= LIMITS.votesByFp) {
    return res.status(429).json({
      error: "Trop de votes depuis cet appareil. Réessaye dans 1 h.",
      code: "FP_RATE_LIMIT",
    });
  }

  let ipArr = votesByIp.get(ip) || [];
  pruneArr(ipArr, cutoff);
  if (ipArr.length >= LIMITS.votesByIp) {
    return res.status(429).json({
      error: "Trop de votes depuis ce réseau. Réessaye dans 1 h.",
      code: "IP_RATE_LIMIT",
    });
  }

  let fpSet = fpsByIp.get(ip) || new Map();
  pruneMap(fpSet, cutoff);
  if (!fpSet.has(fp) && fpSet.size >= LIMITS.fpsByIp) {
    return res.status(429).json({
      error: "Trop d'appareils depuis ce réseau. Réessaye dans 1 h.",
      code: "FP_DIVERSITY_LIMIT",
    });
  }

  let ipSet = ipsByFp.get(fp) || new Map();
  pruneMap(ipSet, cutoff);
  if (!ipSet.has(ip) && ipSet.size >= LIMITS.ipsByFp) {
    logBotAttempt({
      ipHash: hashIp(ip),
      reason: "fp_traveling",
      userAgent: req.headers?.["user-agent"] || null,
    }).catch(() => {});
    return res.status(429).json({
      error: "Empreinte d'appareil incohérente. Vérifications supplémentaires requises.",
      code: "FP_TRAVELING",
    });
  }

  arr.push(now); votesByFp.set(fp, arr);
  ipArr.push(now); votesByIp.set(ip, ipArr);
  fpSet.set(fp, now); fpsByIp.set(ip, fpSet);
  ipSet.set(ip, now); ipsByFp.set(fp, ipSet);

  next();
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, v] of votesByFp) { pruneArr(v, cutoff); if (!v.length) votesByFp.delete(k); }
  for (const [k, v] of votesByIp) { pruneArr(v, cutoff); if (!v.length) votesByIp.delete(k); }
  for (const [k, v] of fpsByIp)   { pruneMap(v, cutoff); if (!v.size) fpsByIp.delete(k); }
  for (const [k, v] of ipsByFp)   { pruneMap(v, cutoff); if (!v.size) ipsByFp.delete(k); }
}, 10 * 60 * 1000).unref();
