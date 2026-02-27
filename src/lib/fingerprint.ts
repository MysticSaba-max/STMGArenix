import FingerprintJS from "@fingerprintjs/fingerprintjs";

const STORAGE_KEY = "stmg_device_fp";
let cachedFingerprint: string | null = null;

export async function getFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;

  // Réutiliser le fingerprint persisté pour éviter les variations
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length >= 32) {
      cachedFingerprint = stored;
      return stored;
    }
  } catch {
    // localStorage indisponible (navigation privée, etc.)
  }

  const fp = await FingerprintJS.load();
  const result = await fp.get();
  cachedFingerprint = result.visitorId;

  try {
    localStorage.setItem(STORAGE_KEY, cachedFingerprint);
  } catch {
    // Silencieux si localStorage indisponible
  }

  return cachedFingerprint;
}
