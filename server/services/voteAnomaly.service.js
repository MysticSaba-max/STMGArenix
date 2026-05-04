import { createHash } from "node:crypto";
import pool from "../db/database.js";

const Z_THRESHOLD = 3.0;
const ALLOWED_TABLES = new Set(["votes", "category_votes"]);

function assertTable(table) {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
}

function clusterId(parts) {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

async function detectTemporalClusters(table) {
  assertTable(table);
  const [baseline] = await pool.execute(
    `SELECT site_id,
            COUNT(*) / (30 * 24 * 60) AS rate_per_min,
            STDDEV_POP(daily.cnt) AS sigma_daily
     FROM ${table} v
     JOIN (
       SELECT site_id AS sid, DATE(created_at) AS d, COUNT(*) AS cnt
       FROM ${table}
       WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY sid, DATE(created_at)
     ) daily ON daily.sid = v.site_id
     WHERE v.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY site_id
     HAVING COUNT(*) >= 10`
  );

  const flags = [];
  for (const b of baseline) {
    const [recent] = await pool.execute(
      `SELECT id FROM ${table}
       WHERE site_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
      [b.site_id]
    );
    if (recent.length < 5) continue;

    const observed = recent.length / 10;
    const expected = Number(b.rate_per_min);
    const sigma = Math.max(Number(b.sigma_daily) / (24 * 60), expected * 0.3, 0.1);
    const z = (observed - expected) / sigma;

    if (z > Z_THRESHOLD) {
      const cid = clusterId(["temporal", table, b.site_id, Math.floor(Date.now() / 600000)]);
      for (const v of recent) flags.push([v.id, table, "cluster_window", cid]);
    }
  }
  return flags;
}

// Étape 1 : trouver les fingerprints en burst.
// Étape 2 : pour CHAQUE fp, refetch ses votes via SELECT id … WHERE fingerprint = ?
// (au lieu de GROUP_CONCAT, qui tronque silencieusement à 1024 octets ≈ 170 IDs
//  et corrompt la dernière entrée — exactement le scénario où la détection
//  doit être correcte : les attaques massives).
async function detectFingerprintBursts(table) {
  assertTable(table);
  const [bursts] = await pool.execute(
    `SELECT fingerprint, COUNT(DISTINCT site_id) AS n_sites
     FROM ${table}
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     GROUP BY fingerprint
     HAVING n_sites >= 8`
  );
  const flags = [];
  for (const b of bursts) {
    const [rows] = await pool.execute(
      `SELECT id FROM ${table}
       WHERE fingerprint = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
      [b.fingerprint]
    );
    const cid = clusterId(["fp_burst", b.fingerprint]);
    for (const r of rows) flags.push([r.id, table, "fp_burst", cid]);
  }
  return flags;
}

async function detectSubnetSaturation(table) {
  assertTable(table);
  const [sat] = await pool.execute(
    `SELECT ip_hash, COUNT(DISTINCT fingerprint) AS n_fp
     FROM ${table}
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
       AND ip_hash IS NOT NULL
     GROUP BY ip_hash
     HAVING n_fp >= 5`
  );
  const flags = [];
  for (const s of sat) {
    const [rows] = await pool.execute(
      `SELECT id FROM ${table}
       WHERE ip_hash = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
      [s.ip_hash]
    );
    const cid = clusterId(["subnet", s.ip_hash]);
    for (const r of rows) flags.push([r.id, table, "subnet_saturation", cid]);
  }
  return flags;
}

async function detectUnanimousClusters() {
  const [unanim] = await pool.execute(
    `SELECT site_id, vote_type, COUNT(*) AS n
     FROM votes
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
     GROUP BY site_id, vote_type
     HAVING n >= 8`
  );
  const flags = [];
  for (const u of unanim) {
    const [tot] = await pool.execute(
      `SELECT COUNT(*) AS total FROM votes
       WHERE site_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
      [u.site_id]
    );
    if (tot[0].total > 0 && Number(u.n) / Number(tot[0].total) >= 0.95) {
      const [rows] = await pool.execute(
        `SELECT id FROM votes
         WHERE site_id = ? AND vote_type = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
        [u.site_id, u.vote_type]
      );
      const cid = clusterId(["unanim", u.site_id, u.vote_type]);
      for (const r of rows) flags.push([r.id, "votes", "unanim_cluster", cid]);
    }
  }
  return flags;
}

export async function runAnomalyScan() {
  const all = [
    ...await detectTemporalClusters("votes"),
    ...await detectTemporalClusters("category_votes"),
    ...await detectFingerprintBursts("votes"),
    ...await detectFingerprintBursts("category_votes"),
    ...await detectSubnetSaturation("votes"),
    ...await detectSubnetSaturation("category_votes"),
    ...await detectUnanimousClusters(),
  ];

  if (!all.length) return { flagged: 0 };

  // INSERT IGNORE : si un vote est déjà flagué pour une autre raison, le doublon
  // est silencieusement ignoré (PK composite vote_id+table_name). Note : seule
  // la première raison est conservée — les heuristiques étant complémentaires
  // c'est acceptable, l'admin verra la raison la plus tôt détectée.
  await pool.query(
    `INSERT IGNORE INTO vote_flags (vote_id, table_name, reason, cluster_id) VALUES ?`,
    [all]
  );

  // Auto-ban : on collecte les ip_hash distincts des votes ET category_votes
  // nouvellement flagués. Les deux tables exposent ip_hash (cf. db/database.js).
  const votesIds = all.filter(f => f[1] === "votes").map(f => f[0]);
  const catIds = all.filter(f => f[1] === "category_votes").map(f => f[0]);

  try {
    const allIps = new Set();
    if (votesIds.length) {
      const [ips] = await pool.query(
        `SELECT DISTINCT ip_hash FROM votes WHERE id IN (?) AND ip_hash IS NOT NULL`,
        [votesIds]
      );
      for (const { ip_hash } of ips) allIps.add(ip_hash);
    }
    if (catIds.length) {
      const [ips] = await pool.query(
        `SELECT DISTINCT ip_hash FROM category_votes WHERE id IN (?) AND ip_hash IS NOT NULL`,
        [catIds]
      );
      for (const { ip_hash } of ips) allIps.add(ip_hash);
    }
    if (allIps.size) {
      const { promoteToLongBlock } = await import("../middleware/antibot.js");
      for (const ipHash of allIps) promoteToLongBlock(ipHash);
    }
  } catch (err) {
    console.warn("[anomaly] auto-ban failed:", err?.message || err);
  }

  return { flagged: all.length };
}
