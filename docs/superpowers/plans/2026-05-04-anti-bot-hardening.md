# Anti-Bot Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-layered anti-bot defense for the vote system: single-use scoped sessions, HMAC-signed payloads, fingerprint+IP rate limits, and silent post-hoc anomaly invalidation.

**Architecture:** All vote requests pass through a 4-stage middleware pipeline (`session → signature → fingerprint hash → rate limit → cast`). A scheduled scanner flags coordinated votes every 2 min; the leaderboard excludes flagged votes via `NOT EXISTS`. All defenses gated by `ENABLE_HARDENING` env flag with a `SECURITY_MODE=shadow|enforce` rollout.

**Tech Stack:** Node 18+ (native `node:test`), Express 5, MySQL 8, JWT, Web Crypto API (HMAC-SHA-256), React 19, FingerprintJS.

**Reference design:** [docs/superpowers/specs/2026-05-04-anti-bot-hardening-design.md](../specs/2026-05-04-anti-bot-hardening-design.md)

---

## Phase 1 — Database migrations

### Task 1.1 — Add `vote_sessions` table

**Files:**
- Modify: `server/db/database.js` (function `initDatabase`, after the `bot_attempts` block around line 75)

- [ ] **Step 1: Add the CREATE TABLE for vote_sessions**

In `server/db/database.js`, inside `initDatabase()`, add after the `ip_reputation_cache` table block:

```js
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS vote_sessions (
      jti           CHAR(32) PRIMARY KEY,
      fp_hash       CHAR(64) NOT NULL,
      ip_subnet     VARCHAR(64) NOT NULL,
      signing_key   CHAR(64) NOT NULL,
      bot_score     SMALLINT UNSIGNED NOT NULL,
      vote_count    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      max_votes     SMALLINT UNSIGNED NOT NULL DEFAULT 16,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at    DATETIME NOT NULL,
      revoked       TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_fp_hash (fp_hash),
      INDEX idx_ip_subnet (ip_subnet),
      INDEX idx_expires_at (expires_at)
    )
  `);
```

- [ ] **Step 2: Add periodic cleanup of expired sessions**

In the same function, add inside the cleanup block (where `bot_attempts > 30 DAY` is deleted):

```js
  try {
    await pool.execute(
      "DELETE FROM vote_sessions WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)"
    );
  } catch { /* ignore */ }
```

- [ ] **Step 3: Restart server, verify table created**

Run: `cd server && npm start`
Expected: server boots without error.

In MySQL: `DESCRIBE vote_sessions;` — verify all 11 columns + 3 indexes exist.

- [ ] **Step 4: Commit**

```bash
git add server/db/database.js
git commit -m "feat(db): add vote_sessions table for hardened vote auth"
```

---

### Task 1.2 — Add `vote_flags` table + indexes on vote tables

**Files:**
- Modify: `server/db/database.js`

- [ ] **Step 1: Add the CREATE TABLE for vote_flags**

After the `vote_sessions` block:

```js
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS vote_flags (
      vote_id       INT NOT NULL,
      table_name    ENUM('votes','category_votes') NOT NULL,
      reason        VARCHAR(60) NOT NULL,
      cluster_id    CHAR(16) DEFAULT NULL,
      flagged_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (vote_id, table_name),
      INDEX idx_cluster (cluster_id),
      INDEX idx_flagged_at (flagged_at)
    )
  `);
```

- [ ] **Step 2: Add indexes on existing vote tables**

After the migration `try` blocks for `votes.ip_hash`:

```js
  try {
    await pool.execute("ALTER TABLE votes ADD INDEX idx_created_at (created_at)");
  } catch { /* index exists */ }
  try {
    await pool.execute("ALTER TABLE category_votes ADD INDEX idx_created_at (created_at)");
  } catch { /* index exists */ }
```

- [ ] **Step 3: Restart and verify**

Run: `cd server && npm start` → restart cleanly.
In MySQL: `DESCRIBE vote_flags; SHOW INDEX FROM votes;` → verify `idx_created_at` is listed.

- [ ] **Step 4: Commit**

```bash
git add server/db/database.js
git commit -m "feat(db): add vote_flags table and created_at indexes"
```

---

## Phase 2 — Persistent bot activity service

### Task 2.1 — Create `botActivity.service.js`

**Files:**
- Create: `server/services/botActivity.service.js`
- Test: `server/tests/botActivity.test.js`

- [ ] **Step 1: Create the test file**

```js
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd server && node --test tests/botActivity.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create the service**

```js
// server/services/botActivity.service.js
import pool from "../db/database.js";

export async function logBotAttempt({ ipHash, reason, botScore = 0, userAgent = null }) {
  try {
    await pool.execute(
      `INSERT INTO bot_attempts (ip_hash, reason, bot_score, user_agent) VALUES (?, ?, ?, ?)`,
      [ipHash, reason, botScore, userAgent]
    );
  } catch (err) {
    console.warn("[botActivity] log failed:", err.message);
  }
}

export async function countRecentBotAttempts(ipHash, minutes = 60) {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS n FROM bot_attempts
       WHERE ip_hash = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [ipHash, minutes]
    );
    return Number(rows[0].n) || 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd server && node --test tests/botActivity.test.js`
Expected: 2/2 passing.

- [ ] **Step 5: Commit**

```bash
git add server/services/botActivity.service.js server/tests/botActivity.test.js
git commit -m "feat(security): add persistent botActivity service"
```

---

### Task 2.2 — Wire `logBotAttempt` into existing middlewares

**Files:**
- Modify: `server/middleware/antibot.js`
- Modify: `server/middleware/vpn.js`
- Modify: `server/middleware/turnstile.js`

- [ ] **Step 1: In `antibot.js`, replace `logSuspicious`**

Find:
```js
function logSuspicious(ipHash, reason) {
  if (!suspiciousLog.has(ipHash)) suspiciousLog.set(ipHash, []);
  const log = suspiciousLog.get(ipHash);
  log.push({ timestamp: Date.now(), reason });
  if (log.length > 200) log.shift();
}
```

Replace with:
```js
import { logBotAttempt } from "../services/botActivity.service.js";

function logSuspicious(ipHash, reason, userAgent = null) {
  if (!suspiciousLog.has(ipHash)) suspiciousLog.set(ipHash, []);
  const log = suspiciousLog.get(ipHash);
  log.push({ timestamp: Date.now(), reason });
  if (log.length > 200) log.shift();
  logBotAttempt({ ipHash, reason, userAgent }).catch(() => {});
}
```

Update each `logSuspicious(ipHash, "...")` call inside `detectBot` to pass the UA: `logSuspicious(ipHash, "empty_ua", ua)`, etc.

- [ ] **Step 2: In `vpn.js`, log on each detection**

In `blockVpnProxy`, replace each `if (rep.isXxx)` block to log before returning. Example:

```js
import { logBotAttempt } from "../services/botActivity.service.js";
import { createHash } from "crypto";

function hashIpForLog(ip) {
  return createHash("sha256").update(ip).digest("hex");
}

// Before each return res.status(403).json(...) in blockVpnProxy:
if (rep.isTor) {
  logBotAttempt({
    ipHash: hashIpForLog(ip),
    reason: "tor_detected",
    userAgent: req.headers["user-agent"] || null,
  }).catch(() => {});
  return res.status(403).json({ error: "...", code: "TOR_DETECTED" });
}
```

Apply the same pattern for `isRelay → "relay_detected"`, `isProxy → "proxy_detected"`, `isVpn → "vpn_detected"`.

- [ ] **Step 3: In `turnstile.js`, log when bot score exceeds threshold**

In `verifyTurnstile`, after the `if (botScore >= MAX_ALLOWED_BOT_SCORE)` block:

```js
import { logBotAttempt } from "../services/botActivity.service.js";
import { createHash } from "crypto";

if (botScore >= MAX_ALLOWED_BOT_SCORE) {
  const ipHash = createHash("sha256").update(ip).digest("hex");
  logBotAttempt({ ipHash, reason: "bot_score_high", botScore, userAgent: req.headers["user-agent"] || null }).catch(() => {});
  console.warn(`Bot détecté (score: ${botScore}) depuis IP: ${ip}`);
  return res.status(403).json({ error: "...", code: "BOT_DETECTED" });
}
```

- [ ] **Step 4: Manual smoke test**

Run: `cd server && npm start`. Make a curl request that triggers `BOT_DETECTED` (e.g., `curl -A "curl/8" http://localhost:3001/api/sites`).
In MySQL: `SELECT * FROM bot_attempts ORDER BY id DESC LIMIT 5;` → should see new rows.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/antibot.js server/middleware/vpn.js server/middleware/turnstile.js
git commit -m "feat(security): persist bot detections to bot_attempts table"
```

---

## Phase 3 — Vote sessions

### Task 3.1 — Create `voteSession.service.js`

**Files:**
- Create: `server/services/voteSession.service.js`
- Test: `server/tests/voteSession.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run, expect failure**

Run: `cd server && node --test tests/voteSession.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the service**

```js
// server/services/voteSession.service.js
import crypto from "node:crypto";
import pool from "../db/database.js";

const SESSION_TTL_MS = 60 * 60 * 1000;
export const SESSION_MAX_VOTES = 16;

export async function createVoteSession({ fpHash, ipSubnet, botScore, maxVotes = SESSION_MAX_VOTES }) {
  const jti = crypto.randomBytes(16).toString("hex");
  const signingKey = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.execute(
    `INSERT INTO vote_sessions
     (jti, fp_hash, ip_subnet, signing_key, bot_score, max_votes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [jti, fpHash, ipSubnet, signingKey, botScore, maxVotes, expiresAt]
  );
  return { jti, signingKey, expiresAt };
}

export async function consumeVoteSession({ jti, fpHash, ipSubnet }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT signing_key, vote_count, max_votes, fp_hash, ip_subnet, revoked, bot_score
       FROM vote_sessions WHERE jti = ? AND expires_at > NOW() FOR UPDATE`,
      [jti]
    );
    const sess = rows[0];
    if (!sess || sess.revoked) {
      await conn.rollback();
      return { ok: false, code: "SESSION_EXPIRED" };
    }
    if (sess.vote_count >= sess.max_votes) {
      await conn.rollback();
      return { ok: false, code: "QUOTA_EXCEEDED" };
    }
    if (sess.fp_hash !== fpHash) {
      await conn.rollback();
      return { ok: false, code: "FP_MISMATCH" };
    }
    if (sess.ip_subnet !== ipSubnet) {
      await conn.rollback();
      return { ok: false, code: "IP_MISMATCH" };
    }
    await conn.execute(
      "UPDATE vote_sessions SET vote_count = vote_count + 1 WHERE jti = ?",
      [jti]
    );
    await conn.commit();
    return { ok: true, signingKey: sess.signing_key, botScore: sess.bot_score };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function revokeVoteSession(jti) {
  await pool.execute("UPDATE vote_sessions SET revoked = 1 WHERE jti = ?", [jti]);
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd server && node --test tests/voteSession.test.js`
Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add server/services/voteSession.service.js server/tests/voteSession.test.js
git commit -m "feat(security): add voteSession service with atomic quota"
```

---

### Task 3.2 — Modify `turnstile.js` to use the session service

**Files:**
- Modify: `server/middleware/turnstile.js`

- [ ] **Step 1: Replace `verifyTurnstile` to persist session and return signingKey**

In `server/middleware/turnstile.js`, find the existing `verifyTurnstile` function. Replace the JWT signing parts (both branches: dev mode and prod mode) to use `createVoteSession`:

```js
import { createVoteSession } from "../services/voteSession.service.js";
import { hashFingerprint } from "./fingerprint.js";

// ... keep imports and constants ...

export async function verifyTurnstile(req, res) {
  const { token, fingerprint, botSignals } = req.body;
  const ip = req.clientIp || req.ip || req.socket?.remoteAddress || req.realIp || "";

  if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 32) {
    return res.status(400).json({ error: "Fingerprint requis" });
  }

  let botScore = 0;
  if (botSignals && typeof botSignals === "object") {
    botScore = computeServerSideBotScore(botSignals);
  }

  if (botScore >= MAX_ALLOWED_BOT_SCORE) {
    const ipHash = (await import("crypto")).createHash("sha256").update(ip).digest("hex");
    (await import("../services/botActivity.service.js")).logBotAttempt({
      ipHash, reason: "bot_score_high", botScore, userAgent: req.headers["user-agent"] || null,
    }).catch(() => {});
    return res.status(403).json({
      error: "Comportement automatisé détecté. Vérification échouée.",
      code: "BOT_DETECTED",
    });
  }

  // Dev mode: skip Turnstile call but still create session
  if (!SECRET_KEY) {
    const session = await createVoteSession({
      fpHash: hashFingerprint(fingerprint),
      ipSubnet: req.realIp,
      botScore,
    });
    const sessionToken = jwt.sign(
      { jti: session.jti, verified: true, fp: hashFingerprint(fingerprint), ip: req.realIp, botScore },
      SESSION_SECRET,
      { expiresIn: "1h" }
    );
    return res.json({ sessionToken, signingKey: session.signingKey });
  }

  if (!token) {
    return res.status(403).json({ error: "Captcha manquant" });
  }

  // Cloudflare Turnstile verification (unchanged)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: SECRET_KEY, response: token, remoteip: ip }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!data.success) {
      return res.status(403).json({ error: "Vérification captcha échouée" });
    }

    const session = await createVoteSession({
      fpHash: hashFingerprint(fingerprint),
      ipSubnet: req.realIp,
      botScore,
    });
    const sessionToken = jwt.sign(
      { jti: session.jti, verified: true, fp: hashFingerprint(fingerprint), ip: req.realIp, botScore },
      SESSION_SECRET,
      { expiresIn: "1h" }
    );
    return res.json({ sessionToken, signingKey: session.signingKey });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(503).json({ error: "Timeout de vérification captcha" });
    }
    return res.status(500).json({ error: "Erreur de vérification captcha" });
  }
}
```

- [ ] **Step 2: Replace `requireVerifiedSession` to use `consumeVoteSession`**

```js
import { consumeVoteSession } from "../services/voteSession.service.js";

export async function requireVerifiedSession(req, res, next) {
  if (!SECRET_KEY) {
    // dev mode: still try to consume the session if a token is provided
    const token = req.headers["x-vote-session"];
    if (!token) return next();
  }

  const token = req.headers["x-vote-session"];
  if (!token) {
    return res.status(403).json({ error: "Session non vérifiée, rechargez la page", code: "NO_SESSION" });
  }

  let payload;
  try {
    payload = jwt.verify(token, SESSION_SECRET);
  } catch {
    return res.status(403).json({ error: "Session expirée, rechargez la page", code: "BAD_SESSION" });
  }

  const fpHash = hashFingerprint(req.body.fingerprint || "");
  const result = await consumeVoteSession({
    jti: payload.jti,
    fpHash,
    ipSubnet: req.realIp,
  });

  if (!result.ok) {
    return res.status(403).json({
      error: result.code === "QUOTA_EXCEEDED"
        ? "Quota de votes atteint. Rechargez la page pour en obtenir une nouvelle."
        : "Session invalide pour cet appareil ou ce réseau.",
      code: result.code,
    });
  }

  req.voteSession = { jti: payload.jti, signingKey: result.signingKey, botScore: result.botScore };
  next();
}
```

- [ ] **Step 3: Manual integration test**

Run: `cd server && npm start`, then in another terminal:

```bash
curl -X POST http://localhost:3001/api/votes/verify \
  -H "Content-Type: application/json" \
  -d '{"fingerprint":"a".repeat(64),"botSignals":{"webdriver":false}}'
```

Expected: 200 with `{ sessionToken: "...", signingKey: "..." }`. In MySQL: `SELECT jti, vote_count FROM vote_sessions ORDER BY created_at DESC LIMIT 1;` → should show row with `vote_count=0`.

- [ ] **Step 4: Commit**

```bash
git add server/middleware/turnstile.js
git commit -m "feat(security): persist vote sessions with signing key"
```

---

## Phase 4 — HMAC payload signature

### Task 4.1 — Create `voteSignature.js` middleware

**Files:**
- Create: `server/middleware/voteSignature.js`
- Test: `server/tests/voteSignature.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/tests/voteSignature.test.js
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
```

- [ ] **Step 2: Run, expect failure**

Run: `cd server && node --test tests/voteSignature.test.js`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the middleware**

```js
// server/middleware/voteSignature.js
import { createHmac, timingSafeEqual } from "node:crypto";

const SKEW_MS = 30 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const seenNonces = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [n, exp] of seenNonces) {
    if (exp < now) seenNonces.delete(n);
    else break;
  }
}, 60 * 1000).unref();

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function verifyVoteSignature(req, res, next) {
  const { ts, nonce, sig, ...rest } = req.body || {};
  const signingKey = req.voteSession?.signingKey;

  if (!signingKey) {
    return res.status(500).json({ error: "Session non chargée", code: "NO_KEY" });
  }
  if (!ts || !nonce || !sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Signature manquante", code: "MISSING_SIG" });
  }
  const tsNum = Number(ts);
  const drift = Math.abs(Date.now() - tsNum);
  if (!Number.isFinite(drift) || drift > SKEW_MS) {
    return res.status(403).json({ error: "Horloge désynchronisée", code: "BAD_TS" });
  }

  const nonceKey = `${req.voteSession.jti}:${nonce}`;
  if (seenNonces.has(nonceKey)) {
    return res.status(403).json({ error: "Requête déjà soumise", code: "REPLAY" });
  }

  const payloadToSign = { ...rest, ts: tsNum, nonce };
  const expected = createHmac("sha256", Buffer.from(signingKey, "hex"))
    .update(canonical(payloadToSign))
    .digest();

  let provided;
  try {
    provided = Buffer.from(sig, "hex");
  } catch {
    return res.status(400).json({ error: "Signature invalide", code: "BAD_SIG_FORMAT" });
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(403).json({ error: "Signature invalide", code: "BAD_SIG" });
  }

  seenNonces.set(nonceKey, Date.now() + NONCE_TTL_MS);
  next();
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd server && node --test tests/voteSignature.test.js`
Expected: 5/5 passing.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/voteSignature.js server/tests/voteSignature.test.js
git commit -m "feat(security): add HMAC payload signature middleware"
```

---

## Phase 5 — Rate-limit by fingerprint and IP/24

### Task 5.1 — Create `voteRateLimit.js`

**Files:**
- Create: `server/middleware/voteRateLimit.js`
- Test: `server/tests/voteRateLimit.test.js`

- [ ] **Step 1: Write failing test**

```js
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

test("60 votes from same ip passes; 61st fails IP_RATE_LIMIT", () => {
  for (let i = 0; i < 60; i++) {
    const m = mockReqRes("fpip" + i, "ipS");
    voteRateLimit(m.req, m.res, () => {});
  }
  // Note: this hits FP_DIVERSITY_LIMIT (8 fp) before IP_RATE_LIMIT (60 votes).
  // To isolate IP_RATE_LIMIT, reuse the same 5 fps to stay under diversity:
  _resetForTest();
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
```

- [ ] **Step 2: Run, expect failure**

Run: `cd server && node --test tests/voteRateLimit.test.js`
Expected: module not found.

- [ ] **Step 3: Implement**

```js
// server/middleware/voteRateLimit.js
import { logBotAttempt } from "../services/botActivity.service.js";
import { createHash } from "node:crypto";

const WINDOW_MS = 60 * 60 * 1000;
const LIMITS = { votesByFp: 12, votesByIp: 60, fpsByIp: 8, ipsByFp: 3 };

let votesByFp = new Map();
let votesByIp = new Map();
let fpsByIp = new Map();
let ipsByFp = new Map();

export function _resetForTest() {
  votesByFp = new Map();
  votesByIp = new Map();
  fpsByIp = new Map();
  ipsByFp = new Map();
}

function pruneArr(arr, cutoff) {
  while (arr.length && arr[0] < cutoff) arr.shift();
}
function pruneMap(map, cutoff) {
  for (const [k, v] of map) if (v < cutoff) map.delete(k);
}

export function voteRateLimit(req, res, next) {
  const fp = req.body?.fingerprintHash;
  const ip = req.realIp;
  if (!fp || !ip) {
    return res.status(400).json({ error: "Requête invalide", code: "BAD_RATELIMIT_INPUT" });
  }

  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let arr = votesByFp.get(fp) || [];
  pruneArr(arr, cutoff);
  if (arr.length >= LIMITS.votesByFp) {
    return res.status(429).json({
      error: "Trop de votes depuis cet appareil. Réessaye dans 1 h.",
      code: "FP_RATE_LIMIT",
    });
  }

  let ipArr = votesByIp.get(ip) || [];
  pruneArr(ipArr, cutoff);
  if (ipArr.length >= LIMITS.votesByIp) {
    return res.status(429).json({
      error: "Trop de votes depuis ce réseau. Réessaye dans 1 h.",
      code: "IP_RATE_LIMIT",
    });
  }

  let fpSet = fpsByIp.get(ip) || new Map();
  pruneMap(fpSet, cutoff);
  if (!fpSet.has(fp) && fpSet.size >= LIMITS.fpsByIp) {
    return res.status(429).json({
      error: "Trop d'appareils depuis ce réseau. Réessaye dans 1 h.",
      code: "FP_DIVERSITY_LIMIT",
    });
  }

  let ipSet = ipsByFp.get(fp) || new Map();
  pruneMap(ipSet, cutoff);
  if (!ipSet.has(ip) && ipSet.size >= LIMITS.ipsByFp) {
    const ipHash = createHash("sha256").update(ip).digest("hex");
    logBotAttempt({ ipHash, reason: "fp_traveling", userAgent: req.headers?.["user-agent"] || null }).catch(() => {});
    return res.status(429).json({
      error: "Empreinte d'appareil incohérente. Vérifications supplémentaires requises.",
      code: "FP_TRAVELING",
    });
  }

  arr.push(now); votesByFp.set(fp, arr);
  ipArr.push(now); votesByIp.set(ip, ipArr);
  fpSet.set(fp, now); fpsByIp.set(ip, fpSet);
  ipSet.set(ip, now); ipsByFp.set(fp, ipSet);

  next();
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, v] of votesByFp) { pruneArr(v, cutoff); if (!v.length) votesByFp.delete(k); }
  for (const [k, v] of votesByIp) { pruneArr(v, cutoff); if (!v.length) votesByIp.delete(k); }
  for (const [k, v] of fpsByIp)   { pruneMap(v, cutoff); if (!v.size) fpsByIp.delete(k); }
  for (const [k, v] of ipsByFp)   { pruneMap(v, cutoff); if (!v.size) ipsByFp.delete(k); }
}, 10 * 60 * 1000).unref();
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd server && node --test tests/voteRateLimit.test.js`
Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add server/middleware/voteRateLimit.js server/tests/voteRateLimit.test.js
git commit -m "feat(security): add 4-bucket rate limit middleware"
```

---

## Phase 6 — Wire pipeline into vote routes

### Task 6.1 — Honeypot middleware + body limit + pipeline

**Files:**
- Modify: `server/routes/votes.js`
- Modify: `server/server.js`

- [ ] **Step 1: Add honeypot check inline in votes.js**

Add at the top of `server/routes/votes.js`:

```js
import { verifyVoteSignature } from "../middleware/voteSignature.js";
import { voteRateLimit } from "../middleware/voteRateLimit.js";
import { logBotAttempt } from "../services/botActivity.service.js";
import { createHash } from "node:crypto";

function honeypotGuard(req, res, next) {
  if (req.body && typeof req.body.email_confirm === "string" && req.body.email_confirm.length > 0) {
    const ipHash = createHash("sha256").update(req.realIp || "").digest("hex");
    logBotAttempt({ ipHash, reason: "honeypot_filled", userAgent: req.headers["user-agent"] || null }).catch(() => {});
    return res.status(403).json({ error: "Accès refusé", code: "HONEYPOT" });
  }
  next();
}
```

- [ ] **Step 2: Replace the two POST handlers with the full pipeline**

```js
router.post("/",
  honeypotGuard,
  requireVerifiedSession,
  verifyVoteSignature,
  requireFingerprint,
  voteRateLimit,
  async (req, res) => {
    const { vote_type, fingerprintHash } = req.body;
    const siteId = Number.parseInt(req.body.site_id, 10);
    const ip = getRealIp(req);
    if (!Number.isInteger(siteId) || siteId <= 0 || siteId > 1_000_000) {
      return res.status(400).json({ error: "site_id invalide" });
    }
    if (!["up", "down"].includes(vote_type)) {
      return res.status(400).json({ error: "vote_type doit être up ou down" });
    }
    const result = await castVote(siteId, fingerprintHash, ip, vote_type);
    res.json(result);
  }
);

router.post("/categories",
  honeypotGuard,
  requireVerifiedSession,
  verifyVoteSignature,
  requireFingerprint,
  voteRateLimit,
  async (req, res) => {
    const { ratings, fingerprintHash } = req.body;
    const siteId = Number.parseInt(req.body.site_id, 10);
    const ip = getRealIp(req);
    if (!Number.isInteger(siteId) || siteId <= 0 || siteId > 1_000_000) {
      return res.status(400).json({ error: "site_id invalide" });
    }
    if (!ratings || typeof ratings !== "object") {
      return res.status(400).json({ error: "ratings requis" });
    }
    for (const [category, score] of Object.entries(ratings)) {
      const sNum = Number.parseInt(score, 10);
      if (!VALID_CATEGORIES.includes(category) || !Number.isInteger(sNum) || sNum < 1 || sNum > 5) {
        return res.status(400).json({ error: `Invalid category or score: ${category}=${score}` });
      }
    }
    for (const [category, score] of Object.entries(ratings)) {
      await castCategoryVote(siteId, category, fingerprintHash, ip, Number.parseInt(score, 10));
    }
    res.json({ success: true });
  }
);
```

Add `mineLimiter`:

```js
import rateLimit from "express-rate-limit";
const mineLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.realIp,
  validate: { trustProxy: false, keyGeneratorIpFallback: false },
  message: { error: "Trop de requêtes." },
});
```

Update the `/mine` route:
```js
router.post("/mine", mineLimiter, requireFingerprint, async (req, res) => {
  // ... unchanged
});
```

- [ ] **Step 3: In `server.js`, tighten body limit on /api/votes**

Find:
```js
app.use("/api/votes", voteLimiter);
```

Add **before** that line:
```js
app.use("/api/votes", express.json({ limit: "2kb" }));
```

(express handles multiple json parsers gracefully — the inner stricter one wins for /api/votes.)

- [ ] **Step 4: Manual end-to-end smoke test**

Run: `cd server && npm start`. Use the simulate-attack script (created in Task 11) or curl with valid HMAC. For now, verify that:

```bash
# Without session: should fail
curl -X POST http://localhost:3001/api/votes \
  -H "Content-Type: application/json" \
  -d '{"site_id":1,"vote_type":"up","fingerprint":"a".repeat(64)}'
```

Expected: 403 NO_SESSION.

- [ ] **Step 5: Commit**

```bash
git add server/routes/votes.js server/server.js
git commit -m "feat(security): wire honeypot+signature+ratelimit pipeline on /votes"
```

---

## Phase 7 — Anomaly scanner

### Task 7.1 — Create `voteAnomaly.service.js` with all 4 heuristics

**Files:**
- Create: `server/services/voteAnomaly.service.js`
- Test: `server/tests/voteAnomaly.test.js`

- [ ] **Step 1: Write integration test with fixture data**

```js
// server/tests/voteAnomaly.test.js
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

test("H2: fingerprint burst flags ≥8 distinct sites in 5min", async () => {
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

test("H3: subnet saturation flags ≥5 distinct fingerprints in 10min", async () => {
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
```

(H1 + H4 are slower/harder to test deterministically due to needing 30-day baselines — covered by manual tests in `simulate-attack.js`.)

- [ ] **Step 2: Run, expect failure**

Run: `cd server && node --test tests/voteAnomaly.test.js`
Expected: module not found.

- [ ] **Step 3: Implement the service**

```js
// server/services/voteAnomaly.service.js
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

  // Auto-ban: collect IPs of newly flagged votes
  const voteIds = all.filter(f => f[1] === "votes").map(f => f[0]);
  if (voteIds.length) {
    try {
      const [ips] = await pool.query(
        `SELECT DISTINCT ip_hash FROM votes WHERE id IN (?) AND ip_hash IS NOT NULL`,
        [voteIds]
      );
      // Promote to long block via antibot's blockedIps map (imported lazily to avoid cycle)
      const { promoteToLongBlock } = await import("../middleware/antibot.js");
      for (const { ip_hash } of ips) promoteToLongBlock(ip_hash);
    } catch { /* non-fatal */ }
  }

  return { flagged: all.length };
}
```

- [ ] **Step 4: Add `promoteToLongBlock` export to `antibot.js`**

In `server/middleware/antibot.js`, after `getSuspiciousStats`:

```js
export function promoteToLongBlock(ipHash, durationMs = 24 * 60 * 60 * 1000) {
  blockedIps.set(ipHash, { count: 99, blockedUntil: Date.now() + durationMs });
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd server && node --test tests/voteAnomaly.test.js`
Expected: 2/2 passing.

- [ ] **Step 6: Commit**

```bash
git add server/services/voteAnomaly.service.js server/tests/voteAnomaly.test.js server/middleware/antibot.js
git commit -m "feat(security): add anomaly scanner with 4 heuristics + auto-ban"
```

---

### Task 7.2 — Job scheduler

**Files:**
- Create: `server/jobs/anomalyScanner.js`
- Modify: `server/server.js`

- [ ] **Step 1: Create the scheduler**

```js
// server/jobs/anomalyScanner.js
import { runAnomalyScan } from "../services/voteAnomaly.service.js";

const SCAN_INTERVAL_MS = 2 * 60 * 1000;

let intervalHandle = null;

export function startAnomalyScanner() {
  if (intervalHandle) return;
  let running = false;
  intervalHandle = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const r = await runAnomalyScan();
      if (r.flagged > 0) console.log(`[anomaly] ${r.flagged} votes flagués`);
    } catch (err) {
      console.error("[anomaly] scan failed:", err.message);
    } finally {
      running = false;
    }
  }, SCAN_INTERVAL_MS);
  intervalHandle.unref();
}
```

- [ ] **Step 2: Wire it in `server.js`**

In `server.js`, after `await initDatabase();`:

```js
import { startAnomalyScanner } from "./jobs/anomalyScanner.js";

// inside async function start(), after await initDatabase():
startAnomalyScanner();
```

- [ ] **Step 3: Smoke test**

Run: `cd server && npm start`. Within 2 min, look for `[anomaly] X votes flagués` in console (or absence of error).

- [ ] **Step 4: Commit**

```bash
git add server/jobs/anomalyScanner.js server/server.js
git commit -m "feat(security): start anomaly scanner job every 2 min"
```

---

## Phase 8 — Silent invalidation in leaderboard

### Task 8.1 — Modify leaderboard queries

**Files:**
- Modify: `server/services/leaderboard.service.js`

- [ ] **Step 1: Read existing service**

Run: `cat server/services/leaderboard.service.js`. Identify every SQL query that aggregates `votes` or `category_votes`.

- [ ] **Step 2: Wrap each `FROM votes` with NOT EXISTS**

For each occurrence of `FROM votes` (or alias), add a `WHERE NOT EXISTS (SELECT 1 FROM vote_flags f WHERE f.vote_id = votes.id AND f.table_name = 'votes')`. Same for `category_votes`.

Example transformation:

Before:
```sql
SELECT site_id, COUNT(CASE WHEN vote_type='up' THEN 1 END) AS upvotes
FROM votes
WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY site_id;
```

After:
```sql
SELECT site_id, COUNT(CASE WHEN vote_type='up' THEN 1 END) AS upvotes
FROM votes v
WHERE v.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND NOT EXISTS (
    SELECT 1 FROM vote_flags f
    WHERE f.vote_id = v.id AND f.table_name = 'votes'
  )
GROUP BY site_id;
```

Apply consistently across **all** queries in this file.

- [ ] **Step 3: Manual verification**

Run: `cd server && npm start`. Hit `GET /api/leaderboard` — verify response structure unchanged.

In MySQL, manually flag a vote and refresh:
```sql
INSERT INTO vote_flags (vote_id, table_name, reason) VALUES (1, 'votes', 'manual_test');
```
Refresh leaderboard — vote count for that site_id should drop by 1.

```sql
DELETE FROM vote_flags WHERE reason = 'manual_test';
```

- [ ] **Step 4: Commit**

```bash
git add server/services/leaderboard.service.js
git commit -m "feat(security): exclude flagged votes from leaderboard"
```

---

## Phase 9 — Admin endpoints for anomalies

### Task 9.1 — Anomaly admin routes

**Files:**
- Modify: `server/routes/admin.js`

- [ ] **Step 1: Add the 5 endpoints**

In `server/routes/admin.js`, after the existing routes (assuming there's `requireAdmin` middleware already):

```js
import { revokeVoteSession } from "../services/voteSession.service.js";
import pool from "../db/database.js";

// GET /api/admin/anomalies — clusters récents
router.get("/anomalies", requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT cluster_id, reason, COUNT(*) AS count,
            MIN(flagged_at) AS first_seen, MAX(flagged_at) AS last_seen,
            GROUP_CONCAT(DISTINCT table_name) AS tables
     FROM vote_flags
     WHERE flagged_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY cluster_id, reason
     ORDER BY last_seen DESC
     LIMIT 200`
  );
  res.json(rows);
});

// GET /api/admin/anomalies/:cluster_id — détail
router.get("/anomalies/:cluster_id", requireAdmin, async (req, res) => {
  const cid = req.params.cluster_id;
  const [rows] = await pool.execute(
    `SELECT f.vote_id, f.table_name, f.reason, f.flagged_at,
            CASE WHEN f.table_name='votes' THEN v.fingerprint ELSE cv.fingerprint END AS fingerprint,
            CASE WHEN f.table_name='votes' THEN v.ip_hash ELSE cv.ip_hash END AS ip_hash,
            CASE WHEN f.table_name='votes' THEN v.site_id ELSE cv.site_id END AS site_id
     FROM vote_flags f
     LEFT JOIN votes v ON f.table_name='votes' AND v.id = f.vote_id
     LEFT JOIN category_votes cv ON f.table_name='category_votes' AND cv.id = f.vote_id
     WHERE f.cluster_id = ?
     LIMIT 500`,
    [cid]
  );
  res.json(rows);
});

// DELETE /api/admin/anomalies/:cluster_id — lever les flags (faux positif)
router.delete("/anomalies/:cluster_id", requireAdmin, async (req, res) => {
  const [r] = await pool.execute(
    "DELETE FROM vote_flags WHERE cluster_id = ?",
    [req.params.cluster_id]
  );
  res.json({ removed: r.affectedRows });
});

// DELETE /api/admin/anomalies/:cluster_id/votes — purge définitive
router.delete("/anomalies/:cluster_id/votes", requireAdmin, async (req, res) => {
  const [flags] = await pool.execute(
    "SELECT vote_id, table_name FROM vote_flags WHERE cluster_id = ?",
    [req.params.cluster_id]
  );
  const voteIds = flags.filter(f => f.table_name === "votes").map(f => f.vote_id);
  const catIds = flags.filter(f => f.table_name === "category_votes").map(f => f.vote_id);

  if (voteIds.length) {
    await pool.query("DELETE FROM votes WHERE id IN (?)", [voteIds]);
  }
  if (catIds.length) {
    await pool.query("DELETE FROM category_votes WHERE id IN (?)", [catIds]);
  }
  await pool.execute("DELETE FROM vote_flags WHERE cluster_id = ?", [req.params.cluster_id]);

  res.json({ deleted_votes: voteIds.length, deleted_category_votes: catIds.length });
});

// POST /api/admin/sessions/:jti/revoke — révoque une session
router.post("/sessions/:jti/revoke", requireAdmin, async (req, res) => {
  await revokeVoteSession(req.params.jti);
  res.json({ revoked: true });
});
```

- [ ] **Step 2: Smoke test**

Run: `cd server && npm start`. With an admin auth token:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/admin/anomalies
```

Expected: `[]` if no flags yet, or array of cluster summaries.

- [ ] **Step 3: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat(admin): add anomaly review and session revoke endpoints"
```

---

### Task 9.2 — Security stats endpoint

**Files:**
- Modify: `server/routes/admin.js`

- [ ] **Step 1: Add `/api/admin/security/stats`**

```js
router.get("/security/stats", requireAdmin, async (_req, res) => {
  const since24h = "DATE_SUB(NOW(), INTERVAL 24 HOUR)";
  const [[sessActive]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM vote_sessions WHERE expires_at > NOW() AND revoked = 0"
  );
  const [[sessQuota]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM vote_sessions
     WHERE created_at > ${since24h} AND vote_count >= max_votes`
  );
  const [[flagged]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM vote_flags WHERE flagged_at > ${since24h}`
  );
  const [[clusters]] = await pool.execute(
    `SELECT COUNT(DISTINCT cluster_id) AS n FROM vote_flags WHERE flagged_at > ${since24h}`
  );
  const [byReason] = await pool.execute(
    `SELECT reason, COUNT(*) AS n FROM bot_attempts
     WHERE created_at > ${since24h} GROUP BY reason`
  );
  const bot_attempts_24h = Object.fromEntries(byReason.map(r => [r.reason, Number(r.n)]));

  res.json({
    sessions_active: Number(sessActive.n),
    sessions_quota_exceeded_24h: Number(sessQuota.n),
    flagged_votes_24h: Number(flagged.n),
    flagged_clusters_24h: Number(clusters.n),
    bot_attempts_24h,
  });
});
```

- [ ] **Step 2: Test manually**

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/admin/security/stats
```

Expected: JSON with all fields, `bot_attempts_24h` may be `{}` if no detections yet.

- [ ] **Step 3: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat(admin): expose security stats endpoint"
```

---

## Phase 10 — Hardening pass on existing infrastructure

### Task 10.1 — HTTP security headers

**Files:**
- Modify: `server/server.js`

- [ ] **Step 1: Add headers and disable x-powered-by**

In `server.js`, find the existing security headers block (lines 58-69). Replace with:

```js
app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';"
  );
  next();
});
```

- [ ] **Step 2: Verify with curl**

Run: `cd server && npm start`. In another terminal:
```bash
curl -I http://localhost:3001/api/health
```

Expected: response headers include `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`, no `X-Powered-By`.

- [ ] **Step 3: Commit**

```bash
git add server/server.js
git commit -m "feat(security): tighten HTTP security headers (HSTS, COOP, CORP)"
```

---

### Task 10.2 — Origin enforcement on /api/votes

**Files:**
- Modify: `server/server.js`

- [ ] **Step 1: Add `requireOrigin` middleware before `/api/votes` routes**

In `server.js`, before `app.use("/api/votes", voteLimiter)`:

```js
import { logBotAttempt } from "./services/botActivity.service.js";
import { createHash } from "node:crypto";

function requireOrigin(req, res, next) {
  if (!process.env.ALLOWED_ORIGIN) return next();
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin.startsWith(process.env.ALLOWED_ORIGIN)) {
    const ipHash = createHash("sha256").update(req.realIp || "").digest("hex");
    logBotAttempt({
      ipHash, reason: "bad_origin",
      userAgent: req.headers["user-agent"] || null,
    }).catch(() => {});
    return res.status(403).json({ error: "Origine non autorisée", code: "BAD_ORIGIN" });
  }
  next();
}

app.use("/api/votes", requireOrigin);
```

- [ ] **Step 2: Smoke test (only if ALLOWED_ORIGIN is set)**

```bash
ALLOWED_ORIGIN=https://example.com npm start
# in another shell
curl -X POST -H "Origin: https://evil.com" http://localhost:3001/api/votes/verify -d '{}'
```

Expected: 403 BAD_ORIGIN.

- [ ] **Step 3: Commit**

```bash
git add server/server.js
git commit -m "feat(security): enforce Origin header on /api/votes in production"
```

---

## Phase 11 — Client-side: signing key storage and HMAC

### Task 11.1 — Create `voteSigning.ts`

**Files:**
- Create: `src/lib/voteSigning.ts`

- [ ] **Step 1: Implement Web Crypto HMAC**

```ts
// src/lib/voteSigning.ts
const enc = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    hexToBytes(hexKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export async function signVotePayload(
  signingKeyHex: string,
  payload: Record<string, unknown>
): Promise<{ ts: number; nonce: string; sig: string }> {
  const ts = Date.now();
  const nonce = crypto.randomUUID();
  const merged = { ...payload, ts, nonce };
  const key = await importKey(signingKeyHex);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(canonical(merged)));
  const sig = bytesToHex(new Uint8Array(sigBuf));
  return { ts, nonce, sig };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build` (from project root)
Expected: clean build, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/voteSigning.ts
git commit -m "feat(client): add Web Crypto HMAC payload signing"
```

---

### Task 11.2 — Wire signing key into vote flow

**Files:**
- Modify: `src/hooks/useVerifiedSession.ts` (or whichever hook handles Turnstile)
- Modify: vote-submission code (pages/components) — **identify exact files first**

- [ ] **Step 1: Locate the Turnstile verify call**

Run: `grep -r "votes/verify" src/`. Identify the file that POSTs to `/api/votes/verify`. Likely `src/hooks/useVerifiedSession.ts` or similar.

- [ ] **Step 2: Store `signingKey` in sessionStorage**

In the verify call success handler:

```ts
const data = await response.json();
sessionStorage.setItem("vote_session_token", data.sessionToken);
sessionStorage.setItem("vote_signing_key", data.signingKey);
```

- [ ] **Step 3: Sign every vote/category vote payload before POST**

Identify the file(s) that POST to `/api/votes` and `/api/votes/categories`. For each:

```ts
import { signVotePayload } from "@/lib/voteSigning";

async function submitVote(siteId: number, voteType: "up" | "down", fingerprint: string) {
  const signingKey = sessionStorage.getItem("vote_signing_key");
  const sessionToken = sessionStorage.getItem("vote_session_token");
  if (!signingKey || !sessionToken) throw new Error("No session");

  const payload = { site_id: siteId, vote_type: voteType, fingerprint };
  const { ts, nonce, sig } = await signVotePayload(signingKey, payload);

  const res = await fetch("/api/votes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vote-session": sessionToken,
    },
    body: JSON.stringify({ ...payload, ts, nonce, sig, email_confirm: "" }),
  });

  if (res.status === 403) {
    const body = await res.json();
    if (body.code === "QUOTA_EXCEEDED" || body.code === "SESSION_EXPIRED") {
      sessionStorage.removeItem("vote_session_token");
      sessionStorage.removeItem("vote_signing_key");
      // trigger re-verification (call site-specific)
    }
  }
  return res.json();
}
```

Apply same pattern for `/api/votes/categories` with the `ratings` payload.

- [ ] **Step 4: Add honeypot input to vote forms**

Find the vote button/form components. Add a hidden input at form level (not visible, not focusable):

```tsx
<input
  type="text"
  name="email_confirm"
  tabIndex={-1}
  autoComplete="off"
  aria-hidden="true"
  style={{ position: "absolute", left: "-9999px", width: 0, height: 0, opacity: 0 }}
  defaultValue=""
/>
```

(Alternatively, since vote submissions are programmatic, just ensure `email_confirm: ""` is always sent — already done in Step 3. The visible honeypot field protects against form-fillers that scrape the DOM.)

- [ ] **Step 5: Manual end-to-end test in browser**

Run: `npm run dev` (from project root) and open the site. Vote on a site. Verify in MySQL:
```sql
SELECT vote_count FROM vote_sessions ORDER BY created_at DESC LIMIT 1;
SELECT * FROM votes ORDER BY created_at DESC LIMIT 1;
```

Expected: vote_count incremented, vote inserted.

In browser DevTools → Network → check the POST request body contains `ts`, `nonce`, `sig`.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat(client): sign vote payloads with HMAC + honeypot field"
```

---

## Phase 12 — Attack simulation script

### Task 12.1 — Create `simulate-attack.js`

**Files:**
- Create: `server/scripts/simulate-attack.js`

- [ ] **Step 1: Implement 3 scenarios**

```js
// server/scripts/simulate-attack.js
// Run with: node server/scripts/simulate-attack.js
// Server must be running locally on PORT (default 3001).
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const BASE = process.env.SIM_BASE || "http://localhost:3001";

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function sign(payload, keyHex) {
  return createHmac("sha256", Buffer.from(keyHex, "hex")).update(canonical(payload)).digest("hex");
}

async function getSession(fp, ipHeader = null) {
  const headers = { "Content-Type": "application/json" };
  if (ipHeader) headers["X-Forwarded-For"] = ipHeader;
  const r = await fetch(BASE + "/api/votes/verify", {
    method: "POST",
    headers,
    body: JSON.stringify({ fingerprint: fp, botSignals: { webdriver: false } }),
  });
  return r.ok ? r.json() : { error: r.status };
}

async function castVote(fp, sessionToken, signingKey, siteId, voteType, ipHeader = null) {
  const payload = { site_id: siteId, vote_type: voteType, fingerprint: fp };
  const ts = Date.now(), nonce = randomUUID();
  const sig = sign({ ...payload, ts, nonce }, signingKey);
  const headers = {
    "Content-Type": "application/json",
    "x-vote-session": sessionToken,
  };
  if (ipHeader) headers["X-Forwarded-For"] = ipHeader;
  const r = await fetch(BASE + "/api/votes", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, ts, nonce, sig, email_confirm: "" }),
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

async function scenario1_diversityFlood() {
  console.log("\n=== Scenario 1: 100 fps from same IP — expect FP_DIVERSITY_LIMIT ===");
  let blocked = 0;
  for (let i = 0; i < 100; i++) {
    const fp = "f".repeat(63) + i.toString(16).padStart(2, "0").slice(-1);
    const sess = await getSession(fp);
    if (!sess.sessionToken) { blocked++; continue; }
    const r = await castVote(fp, sess.sessionToken, sess.signingKey, 1, "up");
    if (r.status === 429) blocked++;
  }
  console.log(`Blocked: ${blocked} / 100 (expected ≥ 90)`);
}

async function scenario2_fpBurst() {
  console.log("\n=== Scenario 2: same fp, 20 sites in 30s — expect FP_RATE_LIMIT ===");
  const fp = "b".repeat(64);
  const sess = await getSession(fp);
  if (!sess.sessionToken) { console.log("could not get session"); return; }
  let blocked = 0;
  for (let i = 1; i <= 20; i++) {
    const r = await castVote(fp, sess.sessionToken, sess.signingKey, i, "up");
    if (r.status === 429 || r.status === 403) blocked++;
  }
  console.log(`Blocked: ${blocked} / 20 (expected ≥ 4 — quota 16 + rate-limit 12)`);
}

async function scenario3_coordinated() {
  console.log("\n=== Scenario 3: 20 fps coordinate boost site #1 — expect cluster flag ===");
  for (let i = 0; i < 20; i++) {
    const fp = "c".repeat(63) + i.toString(16).padStart(2, "0").slice(-1);
    const sess = await getSession(fp);
    if (!sess.sessionToken) continue;
    await castVote(fp, sess.sessionToken, sess.signingKey, 1, "up");
  }
  console.log("Wait 2-3 minutes for the anomaly scanner, then query:");
  console.log("  SELECT * FROM vote_flags WHERE reason IN ('cluster_window','unanim_cluster') ORDER BY flagged_at DESC LIMIT 30;");
}

await scenario1_diversityFlood();
await scenario2_fpBurst();
await scenario3_coordinated();
console.log("\nDone.");
```

- [ ] **Step 2: Run against local server**

Run: `cd server && node scripts/simulate-attack.js`
Expected: Scenario 1 reports ≥90 blocked, Scenario 2 reports ≥4 blocked, Scenario 3 prints next steps.

- [ ] **Step 3: Verify scenario 3 in DB after 3 min wait**

```sql
SELECT cluster_id, reason, COUNT(*) FROM vote_flags
WHERE flagged_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
GROUP BY cluster_id, reason;
```

Expected: at least one row with `reason = cluster_window` or `unanim_cluster`.

- [ ] **Step 4: Commit**

```bash
git add server/scripts/simulate-attack.js
git commit -m "test(security): add attack simulation script with 3 scenarios"
```

---

## Phase 13 — Feature flag rollout

### Task 13.1 — Wire `ENABLE_HARDENING` and `SECURITY_MODE`

**Files:**
- Modify: `server/server.js`
- Modify: `server/routes/votes.js`

- [ ] **Step 1: Add env reading at top of `server.js`**

```js
const ENABLE_HARDENING = process.env.ENABLE_HARDENING !== "false"; // default ON
const SECURITY_MODE = process.env.SECURITY_MODE || "enforce";       // shadow | enforce
console.log(`[security] hardening=${ENABLE_HARDENING ? "on" : "off"} mode=${SECURITY_MODE}`);
```

- [ ] **Step 2: Make hardening middlewares respect the flags**

In `server/routes/votes.js`, wrap the new middlewares so they no-op when disabled:

```js
const HARDENING_ON = process.env.ENABLE_HARDENING !== "false";
const SHADOW = process.env.SECURITY_MODE === "shadow";

function maybe(mw) {
  return (req, res, next) => {
    if (!HARDENING_ON) return next();
    if (!SHADOW) return mw(req, res, next);
    // shadow mode: log the would-be block, then continue
    const fakeRes = {
      status(s) { return { json: (j) => {
        console.log(`[shadow] would block: status=${s} code=${j?.code}`);
        return fakeRes;
      } }; },
    };
    let blocked = false;
    mw(req, { ...res, status: (s) => {
      blocked = true;
      console.log(`[shadow] would block at status=${s}`);
      return { json: (j) => console.log(`[shadow] would block code=${j?.code}`) };
    } }, () => {});
    if (!blocked) return next();
    return next();  // shadow always passes through
  };
}

router.post("/",
  honeypotGuard,                  // honeypot is cheap and zero-FP, always on
  maybe(requireVerifiedSession),
  maybe(verifyVoteSignature),
  requireFingerprint,
  maybe(voteRateLimit),
  async (req, res) => { /* ... */ }
);
```

(Apply same `maybe()` wrapping to `/categories`.)

- [ ] **Step 3: Test shadow mode**

Run: `SECURITY_MODE=shadow npm start`. Send a request that would normally fail (e.g., bad signature). Verify console shows `[shadow] would block ...` but the request still gets through.

- [ ] **Step 4: Document in `.env.example`**

Add to `server/.env.example`:
```
# Security hardening (Phase 1: shadow → Phase 2: enforce)
ENABLE_HARDENING=true
SECURITY_MODE=shadow
```

- [ ] **Step 5: Commit**

```bash
git add server/server.js server/routes/votes.js server/.env.example
git commit -m "feat(security): add ENABLE_HARDENING + SECURITY_MODE flags"
```

---

## Phase 14 — Final validation

### Task 14.1 — Run all tests

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && node --test tests/`
Expected: all tests passing across the 5 test files.

- [ ] **Step 2: Run simulate-attack.js again**

Run: `cd server && node scripts/simulate-attack.js`
Expected: same behavior as Task 12.1 step 2.

- [ ] **Step 3: Manual smoke test on the UI**

Run: `npm run dev`. Vote on 2-3 sites in the browser. Verify:
- Votes succeed
- `vote_sessions.vote_count` increments
- After 16 votes, the next attempt triggers re-verification

- [ ] **Step 4: Backup DB**

```bash
mysqldump stmgarenix > backup-pre-hardening.sql
```

(Document this in deployment notes.)

- [ ] **Step 5: Final commit + tag**

```bash
git tag -a v-hardening-1.0 -m "Anti-bot hardening complete"
```

---

## Rollback procedure

To disable all hardening at runtime:

```bash
# In server/.env:
ENABLE_HARDENING=false
```

Then restart the server. The new middlewares no-op, the leaderboard still excludes flagged votes (cosmetic), and the existing defenses (Turnstile, antibot.js, vpn.js, rate-limit) continue to operate unchanged.

To revert in code:
```bash
git revert v-hardening-1.0..HEAD
```

The DB schema additions (`vote_sessions`, `vote_flags`, indexes) are backward-compatible and do not need to be rolled back.

---

## Notes for the implementer

- **Run tests after each task** before moving to the next. The plan assumes green tests as preconditions.
- **`node:test` runner**: by default, all tests in `server/tests/*.test.js` run with `node --test tests/`. The runner picks up `.test.js` files automatically.
- **Test DB**: tests use the same DB as dev. They clean up after themselves (every test that writes data has a cleanup at the end). If a test fails mid-run, manually clear stale fixture rows before re-running.
- **Order matters in this plan**: Task 2 (`logBotAttempt`) is depended on by Tasks 5, 6, 7, 10. Task 3 (`voteSession`) by 3.2 and 6. Don't reorder.
- **Idempotency**: `INSERT IGNORE INTO vote_flags` handles concurrent scans. `seenNonces` is in-RAM only — that's intentional (Section 3 of the spec).
- **No new dependencies**: everything uses existing packages (`mysql2`, `jsonwebtoken`, `express-rate-limit`, native `crypto`, `node:test`). No `npm install` needed.
