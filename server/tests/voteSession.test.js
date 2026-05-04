// server/tests/voteSession.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pool from "../db/database.js";
import {
  createVoteSession,
  consumeVoteSession,
  revokeVoteSession,
} from "../services/voteSession.service.js";

const fakeFp = "f".repeat(64);
const fakeIp = "192.0.2.0/24";

async function cleanup() {
  await pool.execute("DELETE FROM vote_sessions WHERE fp_hash = ?", [fakeFp]);
}

test("createVoteSession inserts row, returns jti and signingKey", async () => {
  await cleanup();
  const sess = await createVoteSession({ fpHash: fakeFp, ipSubnet: fakeIp, botScore: 10 });
  assert.equal(sess.jti.length, 32);
  assert.equal(sess.signingKey.length, 64);
  await cleanup();
});

test("consumeVoteSession increments vote_count atomically", async () => {
  await cleanup();
  const { jti, signingKey } = await createVoteSession({ fpHash: fakeFp, ipSubnet: fakeIp, botScore: 0 });
  const r1 = await consumeVoteSession({ jti, fpHash: fakeFp, ipSubnet: fakeIp });
  assert.equal(r1.ok, true);
  assert.equal(r1.signingKey, signingKey);
  const [rows] = await pool.execute("SELECT vote_count FROM vote_sessions WHERE jti = ?", [jti]);
  assert.equal(rows[0].vote_count, 1);
  await cleanup();
});

test("consumeVoteSession refuses when quota reached", async () => {
  await cleanup();
  const { jti } = await createVoteSession({ fpHash: fakeFp, ipSubnet: fakeIp, botScore: 0, maxVotes: 2 });
  await consumeVoteSession({ jti, fpHash: fakeFp, ipSubnet: fakeIp });
  await consumeVoteSession({ jti, fpHash: fakeFp, ipSubnet: fakeIp });
  const r3 = await consumeVoteSession({ jti, fpHash: fakeFp, ipSubnet: fakeIp });
  assert.equal(r3.ok, false);
  assert.equal(r3.code, "QUOTA_EXCEEDED");
  await cleanup();
});

test("consumeVoteSession refuses on fingerprint mismatch", async () => {
  await cleanup();
  const { jti } = await createVoteSession({ fpHash: fakeFp, ipSubnet: fakeIp, botScore: 0 });
  const r = await consumeVoteSession({ jti, fpHash: "x".repeat(64), ipSubnet: fakeIp });
  assert.equal(r.ok, false);
  assert.equal(r.code, "FP_MISMATCH");
  await cleanup();
});

test("consumeVoteSession refuses on IP subnet mismatch", async () => {
  await cleanup();
  const { jti } = await createVoteSession({ fpHash: fakeFp, ipSubnet: fakeIp, botScore: 0 });
  const r = await consumeVoteSession({ jti, fpHash: fakeFp, ipSubnet: "10.0.0.0/24" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "IP_MISMATCH");
  await cleanup();
});

test("revokeVoteSession marks revoked=1 and consume fails", async () => {
  await cleanup();
  const { jti } = await createVoteSession({ fpHash: fakeFp, ipSubnet: fakeIp, botScore: 0 });
  await revokeVoteSession(jti);
  const r = await consumeVoteSession({ jti, fpHash: fakeFp, ipSubnet: fakeIp });
  assert.equal(r.ok, false);
  assert.equal(r.code, "SESSION_EXPIRED");
  await cleanup();
});
