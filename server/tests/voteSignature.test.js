import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyVoteSignature } from "../middleware/voteSignature.js";

const KEY_HEX = "a".repeat(64);

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function makeSig(body, key = KEY_HEX) {
  return createHmac("sha256", Buffer.from(key, "hex")).update(canonical(body)).digest("hex");
}

function mockReqRes(body) {
  const req = { body, voteSession: { jti: "j".repeat(32), signingKey: KEY_HEX } };
  let status = 200, json = null;
  const res = {
    status(s) { status = s; return res; },
    json(j) { json = j; return res; },
  };
  return { req, res, getStatus: () => status, getJson: () => json };
}

test("valid signature passes", () => {
  const ts = Date.now();
  const nonce = "n1";
  const payload = { site_id: 1, vote_type: "up", fingerprint: "fp", ts, nonce };
  const sig = makeSig(payload);
  const { req, res, getStatus } = mockReqRes({ ...payload, sig });
  let called = false;
  verifyVoteSignature(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(getStatus(), 200);
});

test("missing signature returns 400 MISSING_SIG", () => {
  const { req, res, getStatus, getJson } = mockReqRes({ site_id: 1, vote_type: "up", fingerprint: "fp", ts: Date.now(), nonce: "n2" });
  verifyVoteSignature(req, res, () => {});
  assert.equal(getStatus(), 400);
  assert.equal(getJson().code, "MISSING_SIG");
});

test("clock drift > 30s returns 403 BAD_TS", () => {
  const ts = Date.now() - 60_000;
  const nonce = "n3";
  const payload = { site_id: 1, vote_type: "up", fingerprint: "fp", ts, nonce };
  const sig = makeSig(payload);
  const { req, res, getStatus, getJson } = mockReqRes({ ...payload, sig });
  verifyVoteSignature(req, res, () => {});
  assert.equal(getStatus(), 403);
  assert.equal(getJson().code, "BAD_TS");
});

test("wrong signature returns 403 BAD_SIG", () => {
  const ts = Date.now();
  const nonce = "n4";
  const payload = { site_id: 1, vote_type: "up", fingerprint: "fp", ts, nonce };
  const sig = makeSig(payload, "b".repeat(64));
  const { req, res, getStatus, getJson } = mockReqRes({ ...payload, sig });
  verifyVoteSignature(req, res, () => {});
  assert.equal(getStatus(), 403);
  assert.equal(getJson().code, "BAD_SIG");
});

test("replay (same nonce) returns 403 REPLAY", () => {
  const ts = Date.now();
  const nonce = "replay-test-nonce";
  const payload = { site_id: 1, vote_type: "up", fingerprint: "fp", ts, nonce };
  const sig = makeSig(payload);
  const m1 = mockReqRes({ ...payload, sig });
  verifyVoteSignature(m1.req, m1.res, () => {});
  const m2 = mockReqRes({ ...payload, sig });
  verifyVoteSignature(m2.req, m2.res, () => {});
  assert.equal(m2.getStatus(), 403);
  assert.equal(m2.getJson().code, "REPLAY");
});
