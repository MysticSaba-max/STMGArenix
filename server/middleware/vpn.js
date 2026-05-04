import { logBotAttempt } from "../services/botActivity.service.js";
import { hashIp } from "../utils/ipHash.js";

// ─── API keys vpnapi.io — lues depuis la variable d'environnement ─────────────
// Définir VPN_API_KEYS dans server/.env (clés séparées par des virgules) :
//   VPN_API_KEYS=cle1,cle2,cle3
const VPN_API_KEYS = (process.env.VPN_API_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (!VPN_API_KEYS.length && process.env.TURNSTILE_SECRET_KEY) {
  console.warn("⚠️  VPN_API_KEYS non défini — la détection VPN/proxy est désactivée.");
}
let currentKeyIndex = 0;

function getNextApiKey() {
  const key = VPN_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % VPN_API_KEYS.length;
  return key;
}

// ─── Cache in-memory : ipHash -> { result, timestamp } ───────────────────────
const ipCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// ─── Compteur de blocages par IP ──────────────────────────────────────────────
const blockCount = new Map();
const BLOCK_COUNT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours

// ─── Réseaux privés / locaux (IPv4 et IPv6-mapped) ───────────────────────────
// vpnapi.io accepte IPv4 et IPv6 nativement, on envoie l'IP brute sans la normaliser.
// On doit donc détecter les adresses locales dans les deux formats.
const LOCAL_RANGES = [
  /^127\./,
  /^::1$/,
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — formes privées/locales
  /^::ffff:127\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:10\./i,
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./i,
  // IPv6 local / lien-local
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isLocalIp(ip) {
  return LOCAL_RANGES.some((r) => r.test(ip));
}

async function checkIpReputation(ip) {
  const clean = ip.trim();
  if (!clean || isLocalIp(clean) || !VPN_API_KEYS.length) {
    return { isVpn: false, isProxy: false, isTor: false, isRelay: false, isBad: false };
  }

  const ipHash = hashIp(clean);

  // Cache 24h pour ne pas dépasser la limite de 1000 req/jour
  const cached = ipCache.get(ipHash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const apiKey = getNextApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // L'API vpnapi.io accepte IPv4 et IPv6 — on envoie l'IP brute directement.
    const response = await fetch(
      `https://vpnapi.io/api/${encodeURIComponent(clean)}?key=${apiKey}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    // Rate limit sur cette clé → fail-open (on laisse passer)
    if (response.status === 429) {
      const keyIdx = ((currentKeyIndex - 1 + VPN_API_KEYS.length) % VPN_API_KEYS.length) + 1;
      console.warn(`[VPN] Clé API #${keyIdx} rate-limitée (429) → fail-open`);
      return { isVpn: false, isProxy: false, isTor: false, isRelay: false, isBad: false };
    }

    if (!response.ok) {
      return { isVpn: false, isProxy: false, isTor: false, isRelay: false, isBad: false };
    }

    const data = await response.json();
    const sec = data.security || {};

    const result = {
      isVpn: sec.vpn === true,
      isProxy: sec.proxy === true,
      isTor: sec.tor === true,
      isRelay: sec.relay === true,
      isBad: sec.vpn === true || sec.proxy === true || sec.tor === true || sec.relay === true,
      country: data.location?.country_code || null,
      asn: data.network?.autonomous_system_number || null,
    };

    ipCache.set(ipHash, { result, timestamp: Date.now() });
    return result;
  } catch (err) {
    // API indisponible → fail-open
    console.warn(`[VPN] Erreur API pour ${clean}:`, err?.message || err);
    return { isVpn: false, isProxy: false, isTor: false, isRelay: false, isBad: false };
  }
}

export async function blockVpnProxy(req, res, next) {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    return next();
  }

  // ── IP réelle via le middleware realIp (CF-Connecting-IP derrière Cloudflare) ──
  const ip = req.clientIp || (req.headers["cf-connecting-ip"] || "").trim() || (req.ip || req.socket?.remoteAddress || "").trim() || req.realIp || "";

  try {
    const rep = await checkIpReputation(ip);
    const ipHash = hashIp(ip);
    const userAgent = req.headers["user-agent"] || null;

    if (rep.isBad) {
      const entry = blockCount.get(ipHash) || { count: 0, timestamp: Date.now() };
      entry.count += 1;
      entry.timestamp = Date.now();
      blockCount.set(ipHash, entry);
    }

    if (rep.isTor) {
      logBotAttempt({ ipHash, reason: "tor_detected", userAgent }).catch(() => {});
      return res.status(403).json({
        error: "Accès refusé : réseau Tor détecté. Désactivez Tor pour voter.",
        code: "TOR_DETECTED",
      });
    }

    if (rep.isRelay) {
      logBotAttempt({ ipHash, reason: "relay_detected", userAgent }).catch(() => {});
      return res.status(403).json({
        error: "Accès refusé : relay privé détecté (iCloud Private Relay, etc.). Désactivez-le pour voter.",
        code: "RELAY_DETECTED",
      });
    }

    if (rep.isProxy) {
      logBotAttempt({ ipHash, reason: "proxy_detected", userAgent }).catch(() => {});
      return res.status(403).json({
        error: "Accès refusé : proxy détecté. Désactivez votre proxy pour voter.",
        code: "PROXY_DETECTED",
      });
    }

    if (rep.isVpn) {
      logBotAttempt({ ipHash, reason: "vpn_detected", userAgent }).catch(() => {});
      return res.status(403).json({
        error: "Accès refusé : VPN détecté. Désactivez votre VPN pour voter.",
        code: "VPN_DETECTED",
      });
    }

    next();
  } catch {
    next();
  }
}

// ─── Nettoyage périodique du cache (toutes les heures) ────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of ipCache.entries()) {
    if (now - val.timestamp > CACHE_TTL) ipCache.delete(key);
  }
  for (const [key, val] of blockCount.entries()) {
    if (now - val.timestamp > BLOCK_COUNT_TTL) blockCount.delete(key);
  }
}, 60 * 60 * 1000);
