# Renforcement anti-bot du système de vote — Design

**Date** : 2026-05-04
**Statut** : validé pour implémentation
**Auteur** : @VillagersYT (collab. brainstorming)
**Fichiers cibles principaux** : `server/middleware/*`, `server/services/*`, `server/jobs/*`, `server/routes/votes.js`, `server/db/database.js`, `src/lib/voteSigning.ts`

## Contexte et objectif

Le système actuel de vote sur STMG Arenix dispose déjà d'une stack défensive solide : Turnstile invisible, FingerprintJS, détection bot UA / headers (`antibot.js`), détection VPN (`vpn.js`), score comportemental serveur, rate-limit IP, headers HTTP. Malgré cela, l'observation a montré que des votes anormaux passent encore — des sites grimpent trop vite, des ratios up/down sont anormalement nets.

Le diagnostic identifie 10 trous dans la défense actuelle (cf. annexe A). Ce design ferme les 5 trous critiques par un renforcement actif (**option A**) et ajoute un détecteur statistique a posteriori avec invalidation silencieuse (**option C**) comme filet de sécurité.

**Critère de succès** : faire passer le coût d'une attaque de votes coordonnés de quasi-nul à au moins une résolution de Turnstile par tranche de 16 votes, avec détection automatique des coordinations résiduelles.

## Architecture

### Composants ajoutés ou modifiés

```
server/
├── middleware/
│   ├── turnstile.js          [MODIFIÉ] sessionToken stocké en DB, signing key éphémère
│   ├── voteSignature.js      [NOUVEAU] vérifie le HMAC du payload de vote
│   └── voteRateLimit.js      [NOUVEAU] rate-limit 4 buckets (fp / IP / fp×IP / IP×fp)
├── services/
│   ├── voteAnomaly.service.js     [NOUVEAU] détection de coordination (4 heuristiques)
│   └── botActivity.service.js     [NOUVEAU] persiste bot_attempts en SQL
├── jobs/
│   └── anomalyScanner.js     [NOUVEAU] scan toutes les 2 min, flague les votes suspects
├── routes/
│   ├── votes.js              [MODIFIÉ] pipeline : session → signature → rate-limit → cast
│   └── admin.js              [MODIFIÉ] expose les anomalies + bouton purger
├── tests/                    [NOUVEAU]
│   ├── voteSession.test.js
│   ├── voteSignature.test.js
│   ├── voteRateLimit.test.js
│   └── voteAnomaly.test.js
├── scripts/
│   └── simulate-attack.js    [NOUVEAU] 3 scénarios d'attaque
└── db/database.js            [MODIFIÉ] +2 tables : vote_sessions, vote_flags

src/
├── lib/
│   └── voteSigning.ts        [NOUVEAU] signe le payload côté client (Web Crypto API)
└── hooks/
    └── useVerifiedSession.ts [MODIFIÉ] récupère et stocke la signing key
```

### Flux d'un vote complet (post-implémentation)

```
Client                          Serveur                         DB
  │                                │                             │
  │── POST /votes/verify ─────────▶│                             │
  │   {turnstileToken, fp,         │                             │
  │    botSignals}                 │                             │
  │                                │── computeServerSideBotScore │
  │                                │── verifyTurnstile (CF)      │
  │                                │── INSERT vote_sessions ────▶│
  │                                │                             │
  │◀── {sessionToken (JWT+jti),    │                             │
  │     signingKey (32B hex)}      │                             │
  │                                │                             │
  │── POST /votes ────────────────▶│                             │
  │   Headers: x-vote-session=JWT  │                             │
  │   Body: {site_id, vote_type,   │                             │
  │     fingerprint, ts, nonce,    │                             │
  │     sig=HMAC(canonical, key)}  │                             │
  │                                │── requireVerifiedSession    │
  │                                │   (FOR UPDATE atomic)       │
  │                                │── requireFingerprint        │
  │                                │── verifyVoteSignature       │
  │                                │── voteRateLimit (4 buckets) │
  │                                │── castVote                  │
  │                                │                             │
  │◀── {success, action}           │                             │

  Toutes les 2 min :
  anomalyScanner ─────▶ scanne 30 min, INSERT vote_flags
  leaderboard.service ─▶ exclut les votes flagués via NOT EXISTS
```

## Section 1 — Schéma SQL et migration

### Nouvelles tables

```sql
CREATE TABLE vote_sessions (
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
);

CREATE TABLE vote_flags (
  vote_id       INT NOT NULL,
  table_name    ENUM('votes','category_votes') NOT NULL,
  reason        VARCHAR(60) NOT NULL,
  cluster_id    CHAR(16) DEFAULT NULL,
  flagged_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vote_id, table_name),
  INDEX idx_cluster (cluster_id),
  INDEX idx_flagged_at (flagged_at)
);
```

### Migration des tables existantes

S'assurer que `votes.created_at` et `category_votes.created_at` ont bien un index :

```sql
ALTER TABLE votes        ADD INDEX idx_created_at (created_at);
ALTER TABLE category_votes ADD INDEX idx_created_at (created_at);
```

(via `try { ... } catch { /* index existe */ }` dans `initDatabase()` comme les migrations actuelles).

Aucune table existante n'est modifiée de manière destructive.

## Section 2 — Sessions de vote single-use et binding

### Constantes

- `SESSION_TTL_MS = 60 * 60 * 1000` (1 h)
- `SESSION_MAX_VOTES = 16`

### Endpoint `/api/votes/verify` (modifié)

Workflow inchangé pour la partie Turnstile + bot score. Modifications :

1. Génération d'un `jti` (16 octets aléatoires, hex) et d'une `signing_key` (32 octets aléatoires, hex)
2. `INSERT INTO vote_sessions` avec `fp_hash`, `ip_subnet = req.realIp` (déjà /24 ou /64), `bot_score`, `expires_at = NOW + 1h`
3. Le JWT renvoyé contient `{ jti, verified, fp, ip, botScore }`
4. La réponse JSON contient `{ sessionToken, signingKey }` — la `signingKey` n'est renvoyée qu'**une seule fois**, jamais loggée

### Middleware `requireVerifiedSession` (durci)

Logique en transaction MySQL avec `SELECT ... FOR UPDATE` pour empêcher la course condition sur le quota :

1. Vérifie le JWT (signature + non expiré)
2. `SELECT signing_key, vote_count, max_votes, fp_hash, ip_subnet, revoked FROM vote_sessions WHERE jti = ? AND expires_at > NOW() FOR UPDATE`
3. Si pas de ligne ou `revoked = 1` → `403 SESSION_EXPIRED`
4. Si `vote_count >= max_votes` → `403 QUOTA_EXCEEDED`
5. Si `fp_hash != hash(req.body.fingerprint)` → `403 FP_MISMATCH`
6. Si `ip_subnet != req.realIp` → `403 IP_MISMATCH`
7. `UPDATE vote_sessions SET vote_count = vote_count + 1 WHERE jti = ?` **avant** `next()` (pré-incrément pour éviter le bypass parallèle)
8. `req.voteSession = { jti, signingKey, botScore }`
9. `commit()` et `next()`

### Comportement attendu

- Quota épuisé → client doit refaire un Turnstile pour obtenir une nouvelle session. Pour un humain qui vote 16 sites, c'est invisible. Pour un script, chaque tranche de 16 votes coûte une résolution captcha.
- Changement de réseau (ex: WiFi → 4G) → session invalide, refaire Turnstile.

### Côté client

- `signingKey` stockée en `sessionStorage` (disparaît à la fermeture de l'onglet, jamais en `localStorage`)
- `sessionToken` stocké au même endroit
- Sur 403 `QUOTA_EXCEEDED` ou `SESSION_EXPIRED` → reset state + déclenche nouveau Turnstile

## Section 3 — Signature HMAC du payload

### Constantes

- `SKEW_MS = 30 * 1000` (tolérance ±30s entre client et serveur)
- `NONCE_TTL_MS = 5 * 60 * 1000` (un nonce reste réservé 5 min)

### Côté client — `src/lib/voteSigning.ts`

Implémentation Web Crypto API :

- `signVotePayload(signingKeyHex, payload)` retourne `{ ts, nonce, sig }`
- `ts = Date.now()`, `nonce = crypto.randomUUID()`
- Sérialisation canonique : `JSON.stringify(merged, sortedKeys)`
- HMAC-SHA-256 avec la `signing_key` importée comme `CryptoKey`
- `sig` = hex string

### Côté serveur — `server/middleware/voteSignature.js`

Pipeline de vérification :

1. Extraction `{ ts, nonce, sig, ...rest }` du body
2. Récupération `signingKey` depuis `req.voteSession`
3. **Anti-replay temporel** : `|Date.now() - ts| > 30s` → `403 BAD_TS`
4. **Anti-replay nonce** : `seenNonces` Map avec clé `${jti}:${nonce}`. Présent → `403 REPLAY`. Sinon enregistrer avec TTL 5 min.
5. **HMAC** : recompute `HMAC-SHA-256(canonical(rest, ts, nonce), signing_key)` et compare avec `timingSafeEqual()`
6. Si mismatch → `403 BAD_SIG`

`seenNonces` est une `Map` JavaScript en RAM. Les entrées sont insérées en ordre chronologique → un nettoyage périodique (1 min, `unref()`) supprime depuis le début jusqu'à trouver un nonce non-expiré.

### Trade-offs documentés

- **Tolérance ±30s** : assez serré pour bloquer les rejeux différés, assez large pour des machines mal synchronisées (téléphones et desktops modernes <5s par défaut).
- **Nonces en RAM** : 0 latence, 0 charge SQL. Si le serveur redémarre, un attaquant peut rejouer dans la fenêtre — mitigé par le fait que le `jti` peut être révoqué par l'admin et que la session totale dure 1h.
- **JSON canonique avec clés triées** : déterministe, simple à implémenter dans n'importe quel client.

### Branchement

L'ordre du pipeline est critique. `verifyVoteSignature` doit s'exécuter **avant** `requireFingerprint` car ce dernier ajoute `fingerprintHash` au body — un champ qui n'a pas été signé par le client et qui invaliderait la canonicalisation.

```js
router.post("/",
  requireVerifiedSession,    // 1. quota session + binding (hash fp localement)
  verifyVoteSignature,       // 2. HMAC sur body original (avant mutation)
  requireFingerprint,        // 3. ajoute fingerprintHash au body
  voteRateLimit,             // 4. seuils par fp / IP — utilise fingerprintHash
  async (req, res) => { /* castVote */ }
);
router.post("/categories", /* idem */);
```

Note : `requireVerifiedSession` calcule lui-même `hashFingerprint(req.body.fingerprint)` pour la comparaison — il ne dépend donc pas de `requireFingerprint` qui passe ensuite.

## Section 4 — Rate-limit par fingerprint et IP/24

### Constantes (par défaut, ajustables après phase shadow)

- `WINDOW_MS = 60 * 60 * 1000` (1 h)
- `LIMITS = { votesByFp: 12, votesByIp: 60, fpsByIp: 8, ipsByFp: 3 }`

### Les 4 buckets

| Bucket | Stockage | Limite | Code d'erreur |
|---|---|---|---|
| `votesByFp` | `Map<fpHash, ts[]>` | 12 votes / h | `429 FP_RATE_LIMIT` |
| `votesByIp` | `Map<ipSubnet, ts[]>` | 60 votes / h | `429 IP_RATE_LIMIT` |
| `fpsByIp` | `Map<ipSubnet, Map<fpHash, lastTs>>` | 8 fp distincts / h | `429 FP_DIVERSITY_LIMIT` |
| `ipsByFp` | `Map<fpHash, Map<ipSubnet, lastTs>>` | 3 /24 distincts / h | `429 FP_TRAVELING` (+ flag bot_attempts) |

### Logique du middleware

1. Pour chaque bucket : prune des entrées plus vieilles que `WINDOW_MS`
2. Si la limite est atteinte AVANT enregistrement → return 429
3. Si tous les checks passent : ajouter `now` à chaque bucket et `next()`

`FP_TRAVELING` (bucket 4) est le seul qui appelle `botActivity.logBotAttempt()` en plus de bloquer — c'est un signal fort car un humain change rarement de /24 plus de 3 fois en 1h.

### Branchement

Voir l'ordre complet en Section 3. `voteRateLimit` est le 4ᵉ middleware, après que la signature HMAC a validé que la requête vient bien du client légitime. On évite ainsi qu'un attaquant qui spam des requêtes mal signées épuise les quotas d'un utilisateur victime de fingerprint reuse.

### Nettoyage

`setInterval` toutes les 10 min, `unref()`, prune toutes les Maps des entrées vides.

### Note sur le scaling

Tous les compteurs sont en RAM, donc liés à un seul process Node. Si le projet passe en multi-instance (PM2 cluster, K8s, plusieurs replicas), il faudra migrer vers Redis. Pour l'instant : single-process, RAM suffit.

## Section 5 — Détecteur de coordination + invalidation silencieuse

### Job scheduler — `server/jobs/anomalyScanner.js`

- `setInterval(SCAN_INTERVAL_MS = 2 min, runAnomalyScan)`, `unref()`
- Garde-fou `running` pour empêcher les chevauchements
- Démarré dans `server.js` après `initDatabase()`

### Heuristique 1 — Cluster temporel par site (z-score)

Pour chaque site avec ≥10 votes sur 30 jours :
1. Calcul du taux moyen `rate_per_min` et `sigma_daily` sur 30 jours
2. Comptage des votes des 10 dernières min
3. `z = (observed - expected) / max(sigma, expected*0.3, 0.1)`
4. Si `z > 3.0` → flag tous les votes des 10 min avec `reason = "cluster_window"` et un `cluster_id` partagé

### Heuristique 2 — Fingerprint burst

Un fp qui vote ≥8 sites distincts en 5 min → flag tous ses votes avec `reason = "fp_burst"`.

### Heuristique 3 — Saturation /24

Un même `ip_hash` qui voit ≥5 fingerprints distincts voter en 10 min → flag tous les votes avec `reason = "subnet_saturation"`.

### Heuristique 4 — Unanimité suspecte (votes binaires)

Sur les 10 dernières min, si un `(site_id, vote_type)` représente ≥95% des votes du site avec ≥8 votes absolus → flag avec `reason = "unanim_cluster"`.

### Insertion des flags

```sql
INSERT IGNORE INTO vote_flags (vote_id, table_name, reason, cluster_id) VALUES ?
```

`INSERT IGNORE` car la PK `(vote_id, table_name)` peut déjà exister si un flag a été posé par une autre heuristique.

### Invalidation silencieuse au leaderboard

`server/services/leaderboard.service.js` modifie toutes les requêtes d'agrégation pour exclure les votes flagués :

```sql
SELECT site_id, COUNT(*) FROM votes v
WHERE v.vote_type = 'up'
  AND NOT EXISTS (
    SELECT 1 FROM vote_flags f
    WHERE f.vote_id = v.id AND f.table_name = 'votes'
  )
GROUP BY site_id;
```

Idem pour `category_votes` avec `f.table_name = 'category_votes'`.

Les votes flagués **ne sont pas supprimés** de `votes`/`category_votes` — ils restent pour audit et possible levée d'un faux positif.

### Comportement client

Le client ne reçoit aucun signal d'anomalie. Le `castVote` retourne `{success: true}` comme toujours. L'attaquant ne sait pas qu'il a été détecté → ne change pas de tactique.

### Endpoints admin

- `GET /api/admin/anomalies` → liste des clusters récents groupés
- `GET /api/admin/anomalies/:cluster_id` → détail (votes flagués, IPs, fingerprints)
- `DELETE /api/admin/anomalies/:cluster_id` → lève les flags (faux positif → réintégration)
- `DELETE /api/admin/anomalies/:cluster_id/votes` → purge définitive des votes
- `POST /api/admin/sessions/:jti/revoke` → révoque une session active

UI : onglet "Anomalies" dans l'admin, tableau avec colonnes (cluster_id, reason, count, first_seen, last_seen, sample_sites) + 2 boutons (Lever / Purger).

## Section 6 — Durcissements complémentaires

### 6.1 — Persistance des bot_attempts

`antibot.js` conserve son blocage temporaire en RAM, mais log aussi via `botActivity.logBotAttempt()` qui INSERT dans la table SQL `bot_attempts` existante. Branchement aussi dans :
- `verifyTurnstile` (échec captcha, bot score élevé)
- `voteRateLimit` (sur `FP_TRAVELING` uniquement)
- `verifyVoteSignature` (sur `BAD_SIG`, `REPLAY`, `BAD_TS`)
- `vpn.js` (sur `isVpn` / `isProxy` / `isTor` / `isRelay`)

### 6.2 — Honeypot field invisible

Champ `<input name="email_confirm" tabIndex={-1} aria-hidden style={{position:"absolute",left:"-9999px"}} autoComplete="off" />` dans le formulaire de vote.

Côté serveur (middleware `verifyVoteSignature` ou dédié) : si `req.body.email_confirm` truthy → `403 HONEYPOT` + `logBotAttempt`.

### 6.3 — Validation stricte des entrées

Dans `routes/votes.js` :

```js
const siteId = Number.parseInt(req.body.site_id, 10);
if (!Number.isInteger(siteId) || siteId <= 0 || siteId > 1_000_000)
  return res.status(400).json({ error: "site_id invalide" });
```

Ajouter validation : `nonce` au format UUID v4 (regex), `ts` est `Number`, `score` ∈ [1,5] strict integer.

### 6.4 — Rate-limit sur `/api/votes/mine`

```js
const mineLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10,
  keyGenerator: realIpKeyGenerator,
  validate: { trustProxy: false, keyGeneratorIpFallback: false },
});
router.post("/mine", mineLimiter, requireFingerprint, ...);
```

### 6.5 — Headers de sécurité durcis

Dans `server.js` :

```js
res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
app.disable("x-powered-by");
```

CSP : `'unsafe-inline'` reste pour Vite. Migration vers nonces CSP = TODO futur (non-scope).

### 6.6 — Validation Origin stricte

Middleware `requireOrigin` appliqué sur `/api/votes` quand `ALLOWED_ORIGIN` est défini :

```js
function requireOrigin(req, res, next) {
  if (!process.env.ALLOWED_ORIGIN) return next();
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin.startsWith(process.env.ALLOWED_ORIGIN)) {
    logBotAttempt({ ipHash: hashIp(req.realIp), reason: "bad_origin", userAgent: req.headers["user-agent"] });
    return res.status(403).json({ error: "Origine non autorisée", code: "BAD_ORIGIN" });
  }
  next();
}
app.use("/api/votes", requireOrigin);
```

### 6.7 — Body parser strict pour `/api/votes`

```js
app.use("/api/votes", express.json({ limit: "2kb" }), votesRoutes);
```

### 6.8 — Auto-ban progressif 24h

Dans le scanner d'anomalies, pour chaque cluster détecté, récupérer les `ip_hash` distincts des votes flagués et promouvoir leur entrée dans `blockedIps` (Map de `antibot.js`) à un blocage 24h :

```js
blockedIps.set(ip_hash, { count: 99, blockedUntil: Date.now() + 24 * 60 * 60 * 1000 });
```

### 6.9 — Cloudflare WAF (config externe)

Configuration recommandée (à appliquer dans le dashboard Cloudflare gratuit) :

- **Bot Fight Mode** : ON
- **Security Level** : High sur `/api/votes/*` et `/api/auth/*` (Page Rule)
- **WAF Custom Rule** : `(http.request.uri.path contains "/api/votes") and (cf.threat_score > 10)` → Managed Challenge
- **Rate Limiting** (1 règle gratuite) : `/api/votes` → 30 req/min/IP → block 10 min
- **Page Rule** : désactiver le cache pour `/api/*`

## Section 7 — Tests, déploiement et observabilité

### Tests

**Niveau 1** : tests d'intégration via `node:test` (runner natif Node, aucune dépendance ajoutée).

```
server/tests/
├── voteSession.test.js       # création jti, quota, binding fp/IP, FOR UPDATE atomic
├── voteSignature.test.js     # HMAC valide, replay nonce, drift ts, BAD_SIG
├── voteRateLimit.test.js     # 4 buckets, FP_TRAVELING flagué
└── voteAnomaly.test.js       # 4 heuristiques avec données fixtures
```

Run : `node --test server/tests/`. Base MySQL de test via `DB_NAME=stmgarenix_test`.

**Niveau 2** : `server/scripts/simulate-attack.js` — 3 scénarios contre un serveur local :

1. 100 votes / 100 fingerprints / même IP → attendu : `FP_DIVERSITY_LIMIT`
2. Même fingerprint / 20 sites / 30s → attendu : `FP_RATE_LIMIT` + flag `fp_burst`
3. 20 sessions / 20 votes coordonnés sur le site #1 / 5 min → tous passent en temps réel mais flagués `cluster_window` + `unanim_cluster` après le scan

Sortie : rapport texte `expected_blocked / actual_blocked` par scénario.

### Plan de déploiement

**Phase 0 — préparation**
- `mysqldump stmgarenix > backup-pre-hardening.sql`
- Migration DB (création des 2 nouvelles tables, ajout d'index)
- Vérifier `JWT_SECRET` défini en prod

**Phase 1 — shadow mode (1 semaine)**
- `SECURITY_MODE=shadow` : flague + log, ne bloque pas
- Mesure du taux de faux positifs : `flagged_votes / total_votes < 2%`
- Si > 2%, ajustement des seuils avant Phase 2

**Phase 2 — enforce**
- `SECURITY_MODE=enforce` : tous les blocages activés
- Monitoring 48h. Si > 1% des utilisateurs légitimes obtiennent un 403 → rollback immédiat

**Phase 3 — réglage fin**
- Ajustement des seuils selon les données collectées
- Activation Cloudflare WAF en parallèle

### Métriques admin — `GET /api/admin/security/stats`

```json
{
  "sessions_active": 124,
  "sessions_quota_exceeded_24h": 8,
  "flagged_votes_24h": 47,
  "flagged_clusters_24h": 6,
  "bot_attempts_24h": { "honeypot_filled": 3, "bad_sig": 12, "vpn_detected": 89 },
  "rate_limit_hits_24h": { "fp_rate": 2, "ip_rate": 0, "fp_diversity": 4, "fp_traveling": 1 },
  "auto_banned_ips_active": 3
}
```

UI : 4 cartes + une table dans le panneau admin.

### Feature flag global

```js
const ENABLE_HARDENING = process.env.ENABLE_HARDENING !== "false";
if (ENABLE_HARDENING) {
  app.use("/api/votes", verifyVoteSignature, voteRateLimit);
}
```

Rollback : `ENABLE_HARDENING=false` + redémarrage. Aucun impact sur les données existantes (les flags sont en table séparée, le leaderboard tombe automatiquement sur le comptage classique si `vote_flags` est vide).

## Annexe A — Trous identifiés dans la défense actuelle

| # | Faille | Couverte par |
|---|--------|----|
| 1 | Pas de rate-limit par fingerprint | Section 4 |
| 2 | sessionToken réutilisable 1h sans tracking | Section 2 |
| 3 | Pas de single-use sur le token | Sections 2 + 3 (HMAC + nonce) |
| 4 | fingerprintHash non signé | Section 3 |
| 5 | Aucune détection de coordination | Section 5 |
| 6 | botSignals déclaratifs | Pas couverte (option B) — TODO futur |
| 7 | Pas de proof-of-work | Pas couverte (option B) — TODO futur |
| 8 | bot_attempts SQL non utilisée | Section 6.1 |
| 9 | /mine non rate-limité | Section 6.4 |
| 10 | Pas de honeypot | Section 6.2 |

## Annexe B — Limites connues et hors-scope

- **Single-process uniquement** : tous les buckets de rate-limit, le `seenNonces` et le `blockedIps` de `antibot.js` sont en RAM. Pour passer en multi-instance, migrer vers Redis. Hors-scope de ce design.
- **Pas de proof-of-work côté client** : penalité CPU de 200 ms par vote sur mobile bas de gamme jugée disproportionnée par rapport au gain marginal vs. les Sections 1-5. Hors-scope.
- **Pas d'obfuscation des botSignals** : un attaquant qui contrôle le JS peut envoyer des signaux parfaits. Mitigé par le fait que la signature HMAC + le quota par session + le scanner d'anomalies rendent quand même l'attaque coûteuse.
- **CSP avec `'unsafe-inline'`** : conservé pour compatibilité Vite. Migration vers nonces = TODO futur.
- **Faux positifs résiduels** : malgré le seuil `z > 3.0` et la phase shadow, certains événements légitimes (annonce du site sur réseaux sociaux → pic de votes) peuvent déclencher des flags. Mitigé par l'endpoint `DELETE /api/admin/anomalies/:cluster_id` (lever un flag à la main).
