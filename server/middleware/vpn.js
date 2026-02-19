import { createHash } from "crypto";

// In-memory cache : ipHash -> { result, timestamp }
const ipCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// IPs locales / réseaux privés à ignorer
const LOCAL_RANGES = [
  /^127\./,
  /^::1$/,
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::ffff:127\./,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isLocalIp(ip) {
  return LOCAL_RANGES.some((r) => r.test(ip));
}

function hashIp(ip) {
  return createHash("sha256").update(ip).digest("hex");
}

async function checkIpReputation(ip) {
  if (isLocalIp(ip)) {
    return { isProxy: false, isVpn: false, isTor: false, isBad: false };
  }

  const ipHash = hashIp(ip);
  const cached = ipCache.get(ipHash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,proxy,hosting,tor,mobile,countryCode`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      return { isProxy: false, isVpn: false, isTor: false, isBad: false };
    }

    const data = await response.json();

    if (data.status !== "success") {
      return { isProxy: false, isVpn: false, isTor: false, isBad: false };
    }

    const result = {
      isProxy: data.proxy === true,
      isVpn: data.hosting === true,
      isTor: data.tor === true,
      isBad: data.proxy === true || data.tor === true,
      country: data.countryCode || null,
    };

    ipCache.set(ipHash, { result, timestamp: Date.now() });
    return result;
  } catch {
    // Si l'API est indisponible, on laisse passer
    return { isProxy: false, isVpn: false, isTor: false, isBad: false };
  }
}

export async function blockVpnProxy(req, res, next) {
  // Désactivé en dev local (pas de clé Turnstile configurée)
  if (!process.env.TURNSTILE_SECRET_KEY) {
    return next();
  }

  const ip = req.ip || req.socket?.remoteAddress || "";

  try {
    const rep = await checkIpReputation(ip);

    if (rep.isTor) {
      return res.status(403).json({
        error: "Accès refusé : réseau Tor détecté.",
        code: "TOR_DETECTED",
      });
    }

    if (rep.isProxy) {
      return res.status(403).json({
        error: "Accès refusé : proxy/VPN détecté. Désactivez votre VPN pour voter.",
        code: "VPN_PROXY_DETECTED",
      });
    }

    // Hosting / datacenter = probablement un bot en cloud
    if (rep.isVpn) {
      return res.status(403).json({
        error: "Accès refusé : IP de datacenter détectée.",
        code: "DATACENTER_IP",
      });
    }

    next();
  } catch {
    next();
  }
}

// Nettoyage périodique du cache (toutes les heures)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of ipCache.entries()) {
    if (now - val.timestamp > CACHE_TTL) {
      ipCache.delete(key);
    }
  }
}, 60 * 60 * 1000);
