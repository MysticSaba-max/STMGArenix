import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pool from "../db/database.js";
import { runAnomalyScan } from "../services/voteAnomaly.service.js";

const TEST_SITE_ID = 999_999;

async function reset() {
  await pool.execute("DELETE FROM vote_flags WHERE table_name IN ('votes','category_votes')");
  await pool.execute("DELETE FROM votes WHERE site_id = ?", [TEST_SITE_ID]);
  await pool.execute("DELETE FROM category_votes WHERE site_id = ?", [TEST_SITE_ID]);
  await pool.execute("DELETE FROM sites WHERE id = ?", [TEST_SITE_ID]);
  await pool.execute(
    "INSERT INTO sites (id, name, url, logo_path) VALUES (?, 'test', 'http://t', '/t.png')",
    [TEST_SITE_ID]
  );
}

before(reset);
after(async () => {
  await pool.execute("DELETE FROM vote_flags");
  await pool.execute("DELETE FROM votes WHERE site_id = ?", [TEST_SITE_ID]);
  await pool.execute("DELETE FROM sites WHERE id = ?", [TEST_SITE_ID]);
});

test("H2: fingerprint burst flags >=8 distinct sites in 5min", async () => {
  await pool.execute("DELETE FROM votes WHERE fingerprint = 'burst_fp'");
  await pool.execute("DELETE FROM sites WHERE id BETWEEN 999000 AND 999010");
  for (let i = 0; i < 10; i++) {
    await pool.execute(
      "INSERT INTO sites (id, name, url, logo_path) VALUES (?, ?, 'http://x', '/x.png')",
      [999000 + i, "burst" + i]
    );
    await pool.execute(
      "INSERT INTO votes (site_id, fingerprint, ip_hash, vote_type, created_at) VALUES (?, 'burst_fp', 'iph', 'up', NOW())",
      [999000 + i]
    );
  }

  const result = await runAnomalyScan();
  assert.ok(result.flagged >= 8, `expected at least 8 flagged, got ${result.flagged}`);

  const [flags] = await pool.execute(
    `SELECT COUNT(*) AS n FROM vote_flags f
     JOIN votes v ON f.vote_id = v.id AND f.table_name='votes'
     WHERE v.fingerprint = 'burst_fp' AND f.reason = 'fp_burst'`
  );
  assert.ok(flags[0].n >= 8);

  await pool.execute("DELETE FROM votes WHERE fingerprint = 'burst_fp'");
  await pool.execute("DELETE FROM sites WHERE id BETWEEN 999000 AND 999010");
});

test("H3: subnet saturation flags >=5 distinct fingerprints in 10min", async () => {
  const ipHash = "shared_subnet_hash_xyz";
  await pool.execute("DELETE FROM votes WHERE ip_hash = ?", [ipHash]);
  for (let i = 0; i < 6; i++) {
    await pool.execute(
      "INSERT INTO votes (site_id, fingerprint, ip_hash, vote_type, created_at) VALUES (?, ?, ?, 'up', NOW())",
      [TEST_SITE_ID, "fp_sat_" + i, ipHash]
    );
  }
  const result = await runAnomalyScan();
  const [flags] = await pool.execute(
    `SELECT COUNT(*) AS n FROM vote_flags WHERE reason = 'subnet_saturation'`
  );
  assert.ok(flags[0].n >= 6);
  await pool.execute("DELETE FROM votes WHERE ip_hash = ?", [ipHash]);
});
