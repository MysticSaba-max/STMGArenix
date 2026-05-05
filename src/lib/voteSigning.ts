// HMAC-SHA-256 signature des payloads de vote.
// La signing key est obtenue à /api/votes/verify et doit être stockée en
// sessionStorage (pas localStorage : disparaît à la fermeture de l'onglet,
// limite l'exposition en cas de XSS).

const enc = new TextEncoder();

// Retourne directement un ArrayBuffer plutôt qu'un Uint8Array pour éviter
// l'incompatibilité TS 5.7+ entre Uint8Array<ArrayBufferLike> et BufferSource
// (ArrayBufferView<ArrayBuffer>) attendue par crypto.subtle.importKey/sign.
function hexToArrayBuffer(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    hexToArrayBuffer(hexKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// Sérialisation canonique : tri RÉCURSIF des clés à tous les niveaux.
// Note : utiliser JSON.stringify(obj, sortedKeysArray) ne marche PAS pour les
// objets imbriqués comme ratings = { pubs: 4, facilite: 5, ... } — l'array
// replacer filtre les clés à TOUS les niveaux, pas seulement au top-level,
// et un objet imbriqué dont aucune clé n'est dans le replacer devient {}.
// Doit MATCHER exactement le canonical() côté serveur (voteSignature.js).
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>(
      (acc, k) => {
        acc[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
        return acc;
      },
      {},
    );
  }
  return value;
}

function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(sortKeysDeep(obj));
}

export async function signVotePayload(
  signingKeyHex: string,
  payload: Record<string, unknown>,
): Promise<{ ts: number; nonce: string; sig: string }> {
  const ts = Date.now();
  const nonce = crypto.randomUUID();
  const merged = { ...payload, ts, nonce };
  const key = await importKey(signingKeyHex);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(canonical(merged)));
  const sig = bytesToHex(new Uint8Array(sigBuf));
  return { ts, nonce, sig };
}
