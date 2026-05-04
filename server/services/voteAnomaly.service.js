import { createHash } from "node:crypto";
import pool from "../db/database.js";

const Z_THRESHOLD = 3.0;

function clusterId(parts) {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

async function detectTemporalClusters(table) {
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

async function detectFingerprintBursts(table) {
  const [bursts] = await pool.execute(
    `SELECT fingerprint, GROUP_CONCAT(id) AS ids, COUNT(DISTINCT site_id) AS n_sites
     FROM ${table}
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
     GROUP BY fingerprint
     HAVING n_sites >= 8`
  );
  const flags = [];
  for (const b of bursts) {
    const cid = clusterId(["fp_burst", b.fingerprint]);
    for (const id of String(b.ids).split(",")) flags.push([Number(id), table, "fp_burst", cid]);
  }
  return flags;
}

async function detectSubnetSaturation(table) {
  const [sat] = await pool.execute(
    `SELECT ip_hash, COUNT(DISTINCT fingerprint) AS n_fp, GROUP_CONCAT(id) AS ids
     FROM ${table}
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
       AND ip_hash IS NOT NULL
     GROUP BY ip_hash
     HAVING n_fp >= 5`
  );
  const flags = [];
  for (const s of sat) {
    const cid = clusterId(["subnet", s.ip_hash]);
    for (const id of String(s.ids).split(",")) flags.push([Number(id), table, "subnet_saturation", cid]);
  }
  return flags;
}

async function detectUnanimousClusters() {
  const [unanim] = await pool.execute(
    `SELECT site_id, vote_type, GROUP_CONCAT(id) AS ids, COUNT(*) AS n
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
      const cid = clusterId(["unanim", u.site_id, u.vote_type]);
      for (const id of String(u.ids).split(",")) flags.push([Number(id), "votes", "unanim_cluster", cid]);
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

  await pool.query(
    `INSERT IGNORE INTO vote_flags (vote_id, table_name, reason, cluster_id) VALUES ?`,
    [all]
  );

  const voteIds = all.filter(f => f[1] === "votes").map(f => f[0]);
  if (voteIds.length) {
    try {
      const [ips] = await pool.query(
        `SELECT DISTINCT ip_hash FROM votes WHERE id IN (?) AND ip_hash IS NOT NULL`,
        [voteIds]
      );
      const { promoteToLongBlock } = await import("../middleware/antibot.js");
      for (const { ip_hash } of ips) promoteToLongBlock(ip_hash);
    } catch { /* non-fatal */ }
  }

  return { flagged: all.length };
}
