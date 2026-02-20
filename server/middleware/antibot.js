import { createHash } from "crypto";

// ─── Patterns d'User-Agent de bots connus ───────────────────────────────────
const BOT_UA_PATTERNS = [
  /curl/i,
  /wget/i,
  /python[-\s]?requests/i,
  /python[-\s]?urllib/i,
  /aiohttp/i,
  /httpx/i,
  /java\/\d/i,
  /go-http-client/i,
  /okhttp/i,
  /libwww-perl/i,
  /scrapy/i,
  /mechanize/i,
  /guzzle/i,
  /axios\/\d/i,
  /node-fetch/i,
  /got\//i,
  /undici/i,
  /headlesschrome/i,
  /puppeteer/i,
  /playwright/i,
  /phantomjs/i,
  /slimerjs/i,
  /casperjs/i,
  /selenium/i,
  /webdriver/i,
  /httrack/i,
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /baiduspider/i,
  /twitterbot/i,
  /facebookbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /slackbot/i,
  /discordbot/i,
  /telegrambot/i,
  /applebot/i,
  /petalbot/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /archive\.org_bot/i,
  /ccbot/i,
  /dataprovider/i,
  /nmap/i,
  /masscan/i,
  /nikto/i,
  /sqlmap/i,
  /zgrab/i,
  /censys/i,
  /shodan/i,
];

// ─── En-têtes attendus d'un vrai navigateur ─────────────────────────────────
const REQUIRED_BROWSER_HEADERS = ["accept", "accept-language"];

// ─── En-têtes suspects qui indiquent un script ──────────────────────────────
const SUSPICIOUS_HEADERS = [
  "x-forwarded-for", // peut indiquer rotation de proxies
];

// ─── Historique des tentatives suspectes (en mémoire) ───────────────────────
// ipHash -> [{ timestamp, reason }]
const suspiciousLog = new Map();
// ipHash -> { count, blockedUntil }
const blockedIps = new Map();

const BLOCK_THRESHOLD = 10;  // tentatives avant blocage temporaire
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes

function hashIp(ip) {
  return createHash("sha256").update(ip + (process.env.JWT_SECRET || "salt")).digest("hex");
}

function logSuspicious(ipHash, reason) {
  if (!suspiciousLog.has(ipHash)) suspiciousLog.set(ipHash, []);
  const log = suspiciousLog.get(ipHash);
  log.push({ timestamp: Date.now(), reason });
  if (log.length > 200) log.shift();
}

function isBlocked(ipHash) {
  const entry = blockedIps.get(ipHash);
  if (!entry) return false;
  if (Date.now() > entry.blockedUntil) {
    blockedIps.delete(ipHash);
    return false;
  }
  return true;
}

function maybeBlock(ipHash) {
  const log = suspiciousLog.get(ipHash) || [];
  const recent = log.filter((e) => Date.now() - e.timestamp < 5 * 60 * 1000);
  if (recent.length >= BLOCK_THRESHOLD) {
    blockedIps.set(ipHash, {
      count: recent.length,
      blockedUntil: Date.now() + BLOCK_DURATION,
    });
  }
}

// ─── Middleware principal ─────────────────────────────────────────────────────
export function detectBot(req, res, next) {
  const ip = req.realIp || req.ip || req.socket?.remoteAddress || "";
  const ipHash = hashIp(ip);
  const ua = req.headers["user-agent"] || "";

  // 1. IP temporairement bloquée
  if (isBlocked(ipHash)) {
    return res.status(429).json({
      error: "Trop de tentatives suspectes. Réessayez dans 15 minutes.",
      code: "TEMP_BLOCKED",
    });
  }

  // 2. User-Agent vide ou trop court
  if (!ua || ua.length < 15) {
    logSuspicious(ipHash, "empty_ua");
    maybeBlock(ipHash);
    return res.status(403).json({ error: "Accès refusé", code: "BOT_DETECTED" });
  }

  // 3. User-Agent de bot connu
  for (const pattern of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) {
      logSuspicious(ipHash, `bot_ua:${pattern.source.slice(0, 20)}`);
      maybeBlock(ipHash);
      return res.status(403).json({ error: "Accès refusé", code: "BOT_DETECTED" });
    }
  }

  // 4. En-têtes navigateur requis manquants (seulement sur les routes API sensibles)
  if (req.path !== "/health") {
    for (const header of REQUIRED_BROWSER_HEADERS) {
      if (!req.headers[header]) {
        logSuspicious(ipHash, `missing_header:${header}`);
        maybeBlock(ipHash);
        return res.status(403).json({ error: "Accès refusé", code: "INVALID_REQUEST" });
      }
    }
  }

  // 5. Content-Type invalide sur POST
  if (req.method === "POST") {
    const ct = req.headers["content-type"] || "";
    if (!ct.includes("application/json") && !ct.includes("multipart/form-data")) {
      logSuspicious(ipHash, "invalid_content_type");
      return res.status(400).json({ error: "Content-Type invalide" });
    }
  }

  // 6. Referer check sur les routes de vote (optionnel, désactivé en dev)
  if (process.env.ALLOWED_ORIGIN && req.path.includes("/votes")) {
    const referer = req.headers["referer"] || req.headers["origin"] || "";
    if (referer && !referer.startsWith(process.env.ALLOWED_ORIGIN)) {
      logSuspicious(ipHash, "invalid_referer");
      maybeBlock(ipHash);
      return res.status(403).json({ error: "Accès refusé", code: "INVALID_ORIGIN" });
    }
  }

  next();
}

// ─── Vérification du score bot envoyé par le client ─────────────────────────
export function requireLowBotScore(req, res, next) {
  const botScore = parseInt(req.headers["x-bot-score"] || "0", 10);
  const ip = req.realIp || req.ip || req.socket?.remoteAddress || "";
  const ipHash = hashIp(ip);

  if (isNaN(botScore)) return next();

  // Score >= 85 = probablement un bot (relevé depuis 80 pour absorber les légères variations)
  if (botScore >= 85) {
    logSuspicious(ipHash, `high_bot_score:${botScore}`);
    maybeBlock(ipHash);
    return res.status(403).json({
      error: "Comportement automatisé détecté.",
      code: "BOT_SCORE_HIGH",
    });
  }

  // Score entre 40 et 79 = suspect, on log mais on laisse passer avec avertissement
  if (botScore >= 40) {
    logSuspicious(ipHash, `medium_bot_score:${botScore}`);
  }

  next();
}

// ─── Nettoyage périodique ────────────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, log] of suspiciousLog.entries()) {
    const filtered = log.filter((e) => e.timestamp > cutoff);
    if (filtered.length === 0) suspiciousLog.delete(key);
    else suspiciousLog.set(key, filtered);
  }
}, 30 * 60 * 1000);

// ─── Export pour l'admin ─────────────────────────────────────────────────────
export function getSuspiciousStats() {
  return {
    suspiciousIps: suspiciousLog.size,
    blockedIps: blockedIps.size,
    totalAttempts: [...suspiciousLog.values()].reduce((acc, v) => acc + v.length, 0),
  };
}
