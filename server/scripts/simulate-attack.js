// Script de simulation d'attaque contre les défenses anti-bot.
//
// Lance 3 scénarios contre un serveur local :
//   1. 100 fingerprints depuis la même IP    → attendu : FP_DIVERSITY_LIMIT
//   2. 1 fingerprint qui vote 20 sites        → attendu : FP_RATE_LIMIT (et flag fp_burst)
//   3. 20 fingerprints coordonnés sur 1 site → attendu : flag cluster_window/unanim
//
// Usage : node server/scripts/simulate-attack.js
// Variables d'env optionnelles :
//   SIM_BASE      = http://localhost:3001 (par défaut)
//   SIM_TARGET_ID = id du site cible (par défaut 1)

import { createHmac, randomUUID } from "node:crypto";

const BASE = process.env.SIM_BASE || "http://localhost:3001";
const TARGET_SITE = Number.parseInt(process.env.SIM_TARGET_ID || "1", 10);

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function sign(payload, keyHex) {
  return createHmac("sha256", Buffer.from(keyHex, "hex")).update(canonical(payload)).digest("hex");
}

async function getSession(fp, ipHeader = null) {
  const headers = { "Content-Type": "application/json" };
  if (ipHeader) headers["X-Forwarded-For"] = ipHeader;
  try {
    const r = await fetch(BASE + "/api/votes/verify", {
      method: "POST",
      headers,
      body: JSON.stringify({ fingerprint: fp, botSignals: { webdriver: false } }),
    });
    if (!r.ok) return { error: r.status };
    return await r.json();
  } catch (err) {
    return { error: err.message };
  }
}

async function castVote(fp, sessionToken, signingKey, siteId, voteType, ipHeader = null) {
  const payload = { site_id: siteId, vote_type: voteType, fingerprint: fp };
  const ts = Date.now();
  const nonce = randomUUID();
  const sig = signingKey ? sign({ ...payload, ts, nonce }, signingKey) : "nokey";
  const headers = { "Content-Type": "application/json" };
  if (sessionToken) headers["x-vote-session"] = sessionToken;
  if (ipHeader) headers["X-Forwarded-For"] = ipHeader;
  const body = signingKey
    ? { ...payload, ts, nonce, sig, email_confirm: "" }
    : { ...payload, email_confirm: "" };
  try {
    const r = await fetch(BASE + "/api/votes", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { status: r.status, body: r.ok ? await r.json() : await r.text() };
  } catch (err) {
    return { status: 0, body: err.message };
  }
}

function fpFor(prefix, i) {
  // Un fingerprint valide doit faire >= 32 chars hex côté requireFingerprint.
  return (prefix + i.toString(16).padStart(2, "0")).padEnd(64, "0").slice(0, 64);
}

async function scenario1_diversityFlood() {
  console.log("\n=== Scénario 1 : 100 fingerprints depuis la même IP ===");
  console.log("Attendu : la majorité bloquée (FP_DIVERSITY_LIMIT après 8 fp distincts)");
  let blocked = 0;
  let sessFails = 0;
  for (let i = 0; i < 100; i++) {
    const fp = fpFor("a", i);
    const sess = await getSession(fp);
    if (!sess.sessionToken) {
      sessFails++;
      blocked++;
      continue;
    }
    const r = await castVote(fp, sess.sessionToken, sess.signingKey, TARGET_SITE, "up");
    if (r.status === 429 || r.status === 403) blocked++;
  }
  console.log(`Bloqués : ${blocked} / 100  (dont ${sessFails} échecs de /verify)`);
}

async function scenario2_fpBurst() {
  console.log("\n=== Scénario 2 : 1 fingerprint vote 20 sites différents ===");
  console.log("Attendu : 16 votes acceptés (quota session) puis QUOTA_EXCEEDED ; flag fp_burst dans le scan suivant");
  const fp = fpFor("b", 0);
  const sess = await getSession(fp);
  if (!sess.sessionToken) {
    console.log("Impossible d'obtenir une session :", sess.error);
    return;
  }
  let accepted = 0;
  let blocked = 0;
  for (let i = 1; i <= 20; i++) {
    const r = await castVote(fp, sess.sessionToken, sess.signingKey, i, "up");
    if (r.status === 200) accepted++;
    else if (r.status === 429 || r.status === 403) blocked++;
  }
  console.log(`Acceptés : ${accepted} / 20  ·  Bloqués : ${blocked} / 20`);
}

async function scenario3_coordinated() {
  console.log("\n=== Scénario 3 : 20 fingerprints coordonnent un boost sur le site #" + TARGET_SITE + " ===");
  console.log("Attendu : tous les votes passent en temps réel, puis sont flagués cluster_window + unanim_cluster sous 2 min");
  let success = 0;
  for (let i = 0; i < 20; i++) {
    const fp = fpFor("c", i);
    const sess = await getSession(fp);
    if (!sess.sessionToken) continue;
    const r = await castVote(fp, sess.sessionToken, sess.signingKey, TARGET_SITE, "up");
    if (r.status === 200) success++;
  }
  console.log(`Votes acceptés : ${success} / 20`);
  console.log("Attendre 2-3 min, puis exécuter la requête SQL :");
  console.log("  SELECT cluster_id, reason, COUNT(*) FROM vote_flags");
  console.log("  WHERE flagged_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)");
  console.log("  GROUP BY cluster_id, reason;");
}

async function main() {
  console.log(`Cible : ${BASE}  ·  site #${TARGET_SITE}`);
  await scenario1_diversityFlood();
  await scenario2_fpBurst();
  await scenario3_coordinated();
  console.log("\nTerminé.");
}

main().catch((err) => {
  console.error("Échec :", err);
  process.exit(1);
});
