import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cachedFingerprint: string | null = null;

export async function getFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  cachedFingerprint = result.visitorId;
  return cachedFingerprint;
}
