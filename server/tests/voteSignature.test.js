import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyVoteSignature } from "../middleware/voteSignature.js";

const KEY_HEX = "a".repeat(64);

// Mirror du canonical() côté serveur (tri récursif des clés à tous les niveaux).
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = sortKeysDeep(value[k]);
      return acc;
    }, {});
  }
  return value;
}
function canonical(obj) {
  return JSON.stringify(sortKeysDeep(obj));
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

test("non-hex sig returns 400 BAD_SIG_FORMAT", () => {
  const ts = Date.now();
  const nonce = "n-fmt";
  const { req, res, getStatus, getJson } = mockReqRes({
    site_id: 1, vote_type: "up", fingerprint: "fp", ts, nonce, sig: "not-hex-junk!!"
  });
  verifyVoteSignature(req, res, () => {});
  assert.equal(getStatus(), 400);
  assert.equal(getJson().code, "BAD_SIG_FORMAT");
});

test("nonce > 128 chars rejected with MISSING_SIG (DoS guard)", () => {
  const ts = Date.now();
  const nonce = "x".repeat(200);
  const payload = { site_id: 1, vote_type: "up", fingerprint: "fp", ts, nonce };
  const sig = makeSig(payload);
  const { req, res, getStatus, getJson } = mockReqRes({ ...payload, sig });
  verifyVoteSignature(req, res, () => {});
  assert.equal(getStatus(), 400);
  assert.equal(getJson().code, "MISSING_SIG");
});

test("email_confirm honeypot field is excluded from signature canonical", () => {
  // Le client signe SANS email_confirm, le serveur le strip avant de comparer.
  const ts = Date.now();
  const nonce = "n-honey";
  const signedPayload = { site_id: 1, vote_type: "up", fingerprint: "fp", ts, nonce };
  const sig = makeSig(signedPayload);
  // Le body envoyé contient email_confirm en plus
  const { req, res, getStatus } = mockReqRes({ ...signedPayload, sig, email_confirm: "" });
  let called = false;
  verifyVoteSignature(req, res, () => { called = true; });
  assert.equal(called, true, "next() should be called when honeypot empty + sig valid");
  assert.equal(getStatus(), 200);
});

test("nested ratings object is signed correctly (deep canonical)", () => {
  // Régression : avec JSON.stringify(obj, sortedKeysArray) les objets imbriqués
  // étaient écrasés en {} car l'array replacer filtre les clés à tous les niveaux.
  const ts = Date.now();
  const nonce = "n-nested";
  const ratings = { facilite: 5, pubs: 4, liens: 3, catalogue: 5, qualite_video: 4 };
  const signedPayload = { site_id: 42, ratings, fingerprint: "fp", ts, nonce };
  const sig = makeSig(signedPayload);
  const { req, res, getStatus } = mockReqRes({ ...signedPayload, sig });
  let called = false;
  verifyVoteSignature(req, res, () => { called = true; });
  assert.equal(called, true, "next() should be called when nested object signed correctly");
  assert.equal(getStatus(), 200);
});

test("modified nested rating invalidates signature (replay protection)", () => {
  // Si un attaquant modifie un score nested après signature, le HMAC doit échouer.
  const ts = Date.now();
  const nonce = "n-tamper";
  const ratings = { facilite: 5, pubs: 4 };
  const signedPayload = { site_id: 1, ratings, fingerprint: "fp", ts, nonce };
  const sig = makeSig(signedPayload);
  // Tampering : on change facilite de 5 à 1
  const tamperedRatings = { facilite: 1, pubs: 4 };
  const { req, res, getStatus, getJson } = mockReqRes({
    ...signedPayload, ratings: tamperedRatings, sig,
  });
  verifyVoteSignature(req, res, () => {});
  assert.equal(getStatus(), 403);
  assert.equal(getJson().code, "BAD_SIG");
});
