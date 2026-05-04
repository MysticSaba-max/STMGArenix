import { runAnomalyScan } from "../services/voteAnomaly.service.js";

const SCAN_INTERVAL_MS = 2 * 60 * 1000;

let intervalHandle = null;

export function startAnomalyScanner() {
  if (intervalHandle) return;
  let running = false;
  intervalHandle = setInterval(async () => {
    if (running) return; // évite chevauchement si un scan dépasse 2 min
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

export function stopAnomalyScanner() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
