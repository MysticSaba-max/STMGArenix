// HMAC-SHA-256 signature des payloads de vote.
// La signing key est obtenue à /api/votes/verify et doit être stockée en
// sessionStorage (pas localStorage : disparaît à la fermeture de l'onglet,
// limite l'exposition en cas de XSS).

const enc = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    hexToBytes(hexKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// Sérialisation canonique : JSON.stringify avec clés triées au top-level.
// Doit MATCHER exactement le canonical() côté serveur (voteSignature.js).
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
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
