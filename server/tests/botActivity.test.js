// server/tests/botActivity.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import pool from "../db/database.js";
import { logBotAttempt, countRecentBotAttempts } from "../services/botActivity.service.js";

test("logBotAttempt writes a row and countRecentBotAttempts returns it", async () => {
  const ipHash = "test_" + Math.random().toString(36).slice(2);
  await pool.execute("DELETE FROM bot_attempts WHERE ip_hash = ?", [ipHash]);

  await logBotAttempt({ ipHash, reason: "test_reason", botScore: 42, userAgent: "ua-test" });
  const n = await countRecentBotAttempts(ipHash, 60);

  assert.equal(n, 1);
  await pool.execute("DELETE FROM bot_attempts WHERE ip_hash = ?", [ipHash]);
});

test("logBotAttempt does not throw on DB error (graceful degradation)", async () => {
  // Force a constraint violation by passing too-long fields
  await assert.doesNotReject(async () => {
    await logBotAttempt({ ipHash: "x".repeat(300), reason: "ok", botScore: 0 });
  });
});
