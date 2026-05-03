import { isIP } from "node:net";

function readHeaderValue(value) {
  if (Array.isArray(value)) return readHeaderValue(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIpToken(value) {
  let token = readHeaderValue(value).replace(/^"|"$/g, "");
  if (!token || token.toLowerCase() === "unknown" || token.startsWith("_")) return "";

  if (token.startsWith("[")) {
    const end = token.indexOf("]");
    if (end !== -1) token = token.slice(1, end);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(token)) {
    token = token.replace(/:\d+$/, "");
  }

  return token.replace(/^::ffff:/i, "").trim();
}

function firstValidIp(tokens) {
  let fallback = "";

  for (const token of tokens) {
    const clean = normalizeIpToken(token);
    if (!clean) continue;
    if (!fallback) fallback = clean;
    if (isIP(clean)) return clean;
  }

  return fallback;
}

function getForwardedHeaderIp(value) {
  const header = readHeaderValue(value);
  if (!header) return "";

  const tokens = header
    .split(",")
    .map((entry) => {
      const match = entry.match(/for=(?:"([^"]+)"|([^;,\s]+))/i);
      return match?.[1] || match?.[2] || "";
    });

  return firstValidIp(tokens);
}

export function getClientIp(req) {
  return firstValidIp([
    readHeaderValue(req.headers["cf-connecting-ip"]),
    req.ip || "",
    req.socket?.remoteAddress || "",
    ...readHeaderValue(req.headers["x-forwarded-for"]).split(","),
    getForwardedHeaderIp(req.headers.forwarded),
  ]);
}

export function normalizeIpForSubnetLimits(ip) {
  const clean = normalizeIpToken(ip);
  if (!clean || !clean.includes(":") || clean.includes(".")) return clean;

  let parts;
  if (clean.includes("::")) {
    const [leftRaw, rightRaw = ""] = clean.split("::");
    const left = leftRaw ? leftRaw.split(":").filter(Boolean) : [];
    const right = rightRaw ? rightRaw.split(":").filter(Boolean) : [];
    const expanded = Array(8 - left.length - right.length).fill("0000");
    parts = [...left, ...expanded, ...right];
  } else {
    parts = clean.split(":");
  }

  return parts.slice(0, 4).map((group) => group.padStart(4, "0")).join(":") + "::/64";
}
