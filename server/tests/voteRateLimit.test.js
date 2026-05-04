// server/tests/voteRateLimit.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { voteRateLimit, _resetForTest } from "../middleware/voteRateLimit.js";

function mockReqRes(fp, ip) {
  const req = { body: { fingerprintHash: fp }, realIp: ip, headers: {} };
  let status = 200, json = null;
  const res = {
    status(s) { status = s; return res; },
    json(j) { json = j; return res; },
  };
  return { req, res, getStatus: () => status, getJson: () => json };
}

test.beforeEach(() => _resetForTest());

test("12 votes from same fp passes; 13th fails FP_RATE_LIMIT", () => {
  for (let i = 0; i < 12; i++) {
    const m = mockReqRes("fp1", "ip1");
    voteRateLimit(m.req, m.res, () => {});
    assert.equal(m.getStatus(), 200);
  }
  const m = mockReqRes("fp1", "ip1");
  voteRateLimit(m.req, m.res, () => {});
  assert.equal(m.getStatus(), 429);
  assert.equal(m.getJson().code, "FP_RATE_LIMIT");
});

test("8 distinct fps from same ip pass; 9th fails FP_DIVERSITY_LIMIT", () => {
  for (let i = 0; i < 8; i++) {
    const m = mockReqRes("fp" + i, "ipA");
    voteRateLimit(m.req, m.res, () => {});
    assert.equal(m.getStatus(), 200);
  }
  const m = mockReqRes("fp99", "ipA");
  voteRateLimit(m.req, m.res, () => {});
  assert.equal(m.getStatus(), 429);
  assert.equal(m.getJson().code, "FP_DIVERSITY_LIMIT");
});

test("3 distinct ips from same fp pass; 4th fails FP_TRAVELING", () => {
  for (let i = 0; i < 3; i++) {
    const m = mockReqRes("fpT", "ipT" + i);
    voteRateLimit(m.req, m.res, () => {});
    assert.equal(m.getStatus(), 200);
  }
  const m = mockReqRes("fpT", "ipT99");
  voteRateLimit(m.req, m.res, () => {});
  assert.equal(m.getStatus(), 429);
  assert.equal(m.getJson().code, "FP_TRAVELING");
});

test("60 votes from same ip with rotated fps; 61st fails IP_RATE_LIMIT", () => {
  // Reuse 8 fps to stay under the FP_DIVERSITY_LIMIT (8) while filling the IP bucket.
  const fps = ["a","b","c","d","e","f","g","h"];
  for (let i = 0; i < 60; i++) {
    const m = mockReqRes(fps[i % fps.length], "ipR");
    voteRateLimit(m.req, m.res, () => {});
  }
  const m = mockReqRes("a", "ipR");
  voteRateLimit(m.req, m.res, () => {});
  assert.equal(m.getStatus(), 429);
  assert.equal(m.getJson().code, "IP_RATE_LIMIT");
});

test("missing fp/ip returns 400", () => {
  const req = { body: {}, realIp: undefined, headers: {} };
  let status = 200, json = null;
  const res = { status(s) { status = s; return res; }, json(j) { json = j; return res; } };
  voteRateLimit(req, res, () => {});
  assert.equal(status, 400);
});
