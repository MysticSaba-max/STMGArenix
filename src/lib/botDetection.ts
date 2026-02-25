// ─── Détection de bots côté navigateur ───────────────────────────────────────
// Analyse invisible multi-couche : biométrie comportementale, empreintes,
// cohérence navigateur/OS, détection des outils d'automatisation.

// ─── État global de tracking ──────────────────────────────────────────────────
let pageLoadTime = Date.now();

// Souris
let mouseMovements = 0;
let mouseDistance = 0;
let lastMouseX = 0;
let lastMouseY = 0;

interface MouseSample { x: number; y: number; t: number; }
const mouseSamples: MouseSample[] = [];
const MAX_MOUSE_SAMPLES = 200;

// Clavier
let keystrokes = 0;
const keystrokeIntervals: number[] = [];
let lastKeystrokeTime = 0;

// Autres interactions
let scrollCount = 0;
let clickCount = 0;
let touchCount = 0;
let contextMenuCount = 0;
let pasteCount = 0;
let focusCount = 0;

// Délai jusqu'à la première interaction
let hasInteracted = false;
let firstInteractionDelay: number | null = null;

// Protection contre les listeners doublons (React StrictMode)
let initialized = false;

// ─── Handlers d'événements ────────────────────────────────────────────────────
function markInteraction() {
  if (!hasInteracted) {
    hasInteracted = true;
    firstInteractionDelay = Date.now() - pageLoadTime;
  }
}

function onMouseMove(e: MouseEvent) {
  const now = Date.now();
  mouseMovements++;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  mouseDistance += Math.sqrt(dx * dx + dy * dy);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  // Stocker un échantillon toutes les ~16ms (≈ 60 fps)
  if (mouseSamples.length === 0 || now - mouseSamples[mouseSamples.length - 1].t >= 16) {
    mouseSamples.push({ x: e.clientX, y: e.clientY, t: now });
    if (mouseSamples.length > MAX_MOUSE_SAMPLES) mouseSamples.shift();
  }
  markInteraction();
}

function onKeyDown() {
  const now = Date.now();
  keystrokes++;
  if (lastKeystrokeTime > 0) {
    const interval = now - lastKeystrokeTime;
    // Intervalles réalistes : 20ms – 3s
    if (interval >= 20 && interval <= 3000) {
      keystrokeIntervals.push(interval);
      if (keystrokeIntervals.length > 60) keystrokeIntervals.shift();
    }
  }
  lastKeystrokeTime = now;
  markInteraction();
}

function onScroll() { scrollCount++; }
function onClick() { clickCount++; markInteraction(); }
function onTouch() { touchCount++; markInteraction(); }
function onContextMenu() { contextMenuCount++; }
function onPaste() { pasteCount++; }
function onFocusCapture() { focusCount++; }

export function initBotDetection() {
  if (initialized) return;
  initialized = true;
  pageLoadTime = Date.now();

  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("keydown", onKeyDown, { passive: true });
  document.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick, { passive: true });
  document.addEventListener("touchstart", onTouch, { passive: true });
  document.addEventListener("contextmenu", onContextMenu, { passive: true });
  document.addEventListener("paste", onPaste, { passive: true });
  document.addEventListener("focus", onFocusCapture, { passive: true, capture: true });
}

// ─── Détection des outils d'automatisation ────────────────────────────────────
function detectWebDriver(): boolean {
  return navigator.webdriver === true;
}

function detectPhantomJS(): boolean {
  const w = window as any;
  return !!(w.callPhantom || w._phantom || w.__phantomas);
}

function detectSelenium(): boolean {
  const w = window as any;
  const d = document as any;
  return !!(
    w.__selenium_evaluate || w.__selenium_unwrapped ||
    w.__fxdriver_evaluate || w.__driver_evaluate ||
    w.__webdriver_evaluate || w.Selenium || w.selenium ||
    w.callSelenium || w._selenium || w.__nightmarejs ||
    d.__selenium_evaluate || d.__webdriver_evaluate ||
    d.__fxdriver_evaluate || d.__driver_evaluate ||
    d.__driver_unwrapped || d.__webdriver_unwrapped || d.__fxdriver_unwrapped
  );
}

function detectHeadlessChrome(): boolean {
  const ua = navigator.userAgent || "";

  // UA explicitement headless
  if (/HeadlessChrome/i.test(ua)) return true;
  if (/puppeteer|playwright/i.test(ua)) return true;

  // Plugins = 0 UNIQUEMENT pour Chrome réel (pas Firefox, pas Edge, pas Opera)
  // Firefox expose 0 plugins depuis Firefox 94+ pour la vie privée — ce n'est PAS un indicateur de bot.
  const isChrome = /Chrome\//i.test(ua) && !/Firefox|Edg\/|OPR\/|SamsungBrowser/i.test(ua);
  if (isChrome && navigator.plugins.length === 0 && !("ontouchstart" in window)) return true;

  // outerWidth = 0 en mode headless
  if (window.outerWidth === 0 && window.outerHeight === 0) return true;

  return false;
}

function detectAutomationFlags(): boolean {
  const w = window as any;
  return !!(
    w.domAutomation || w.domAutomationController ||
    w.__cdc_asdjflasutopfhvcZLmcfl_ ||
    w.__selenium_unwrapped ||
    document.documentElement.getAttribute("webdriver") !== null
  );
}

// ─── Canvas fingerprint ───────────────────────────────────────────────────────
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220; canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Sécurité 🔒 1Gg", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("Sécurité 🔒 1Gg", 4, 17);

    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgb(255,0,255)";
    ctx.beginPath();
    ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.arc(80, 20, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,255,0.5)";
    ctx.fill();

    return canvas.toDataURL().slice(-100);
  } catch {
    return "canvas-error";
  }
}

// ─── WebGL fingerprint ────────────────────────────────────────────────────────
function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "no-webgl";

    const renderer = gl.getParameter(gl.RENDERER) as string;
    const vendor = gl.getParameter(gl.VENDOR) as string;
    const version = gl.getParameter(gl.VERSION) as string;
    const exts = gl.getSupportedExtensions() || [];

    return `${vendor}|${renderer}|${version.slice(0, 30)}|${exts.length}`;
  } catch {
    return "webgl-error";
  }
}

// ─── Audio fingerprint (métadonnées seulement — pas d'oscillateur) ────────────
// On évite d'appeler oscillator.start() pour ne pas déclencher les restrictions
// d'autoplay du navigateur (ex: Firefox) et les warnings dans la console.
function getAudioFingerprint(): string {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return "no-audio-api";

    const ctx = new AudioCtx();
    const fp = `${ctx.sampleRate}|${ctx.destination.maxChannelCount}|${ctx.destination.channelCount}`;
    ctx.close().catch(() => {});
    return fp;
  } catch {
    return "audio-error";
  }
}

// ─── Biométrie comportementale ────────────────────────────────────────────────

// Coefficient de variation = σ / μ (valeur faible = vitesse trop uniforme = bot)
function coefficientOfVariation(values: number[]): number {
  if (values.length < 4) return -1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean < 0.001) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

// CV des vitesses de déplacement souris (px/ms)
function computeMouseVelocityCV(): number {
  if (mouseSamples.length < 12) return -1;
  const velocities: number[] = [];
  for (let i = 1; i < mouseSamples.length; i++) {
    const dt = mouseSamples[i].t - mouseSamples[i - 1].t;
    if (dt > 0 && dt < 150) {
      const dx = mouseSamples[i].x - mouseSamples[i - 1].x;
      const dy = mouseSamples[i].y - mouseSamples[i - 1].y;
      velocities.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
  }
  return coefficientOfVariation(velocities);
}

// Ratio de segments de souris parfaitement rectilignes (bots = trajectoires droites)
function computeMouseStraightRatio(): number {
  if (mouseSamples.length < 18) return -1;

  const WIN = Math.min(10, Math.floor(mouseSamples.length / 4));
  let segments = 0;
  let straight = 0;

  for (let i = 0; i + WIN < mouseSamples.length; i += Math.max(1, WIN >> 1)) {
    const start = mouseSamples[i];
    const end = mouseSamples[i + WIN];
    const directDist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    if (directDist < 6) continue;

    let pathDist = 0;
    for (let j = i; j < i + WIN; j++) {
      const ddx = mouseSamples[j + 1].x - mouseSamples[j].x;
      const ddy = mouseSamples[j + 1].y - mouseSamples[j].y;
      pathDist += Math.sqrt(ddx * ddx + ddy * ddy);
    }
    segments++;
    if (pathDist > 0 && directDist / pathDist > 0.97) straight++;
  }

  return segments > 0 ? straight / segments : -1;
}

// CV des intervalles de frappe clavier (frappe trop uniforme = bot)
function computeKeystrokeCV(): number {
  return coefficientOfVariation(keystrokeIntervals);
}

// ─── Cohérence OS / navigateur ────────────────────────────────────────────────
function checkOsConsistency(): boolean {
  const ua = navigator.userAgent || "";
  const platform = (navigator as any).platform || "";

  // iPhone UA avec grande résolution desktop et sans touch = incohérent
  if (/iPhone/i.test(ua) && screen.width > 1600 && (navigator.maxTouchPoints || 0) === 0) return false;

  // Platform OS vs UA OS : contradiction grossière
  if (/Win/i.test(platform) && /Macintosh/i.test(ua) && !/Intel Mac/i.test(ua)) return false;
  if (/MacIntel|MacPPC/i.test(platform) && /Windows NT/i.test(ua)) return false;

  // Languages vide = navigateur non-standard ou scripté
  if (!navigator.languages || navigator.languages.length === 0) return false;

  return true;
}

// ─── Environnement navigateur ─────────────────────────────────────────────────
function getBrowserChecks() {
  const nav = navigator as any;
  return {
    plugins: nav.plugins?.length ?? 0,
    languages: nav.languages?.join(",") || nav.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    windowSize: `${window.outerWidth}x${window.outerHeight}`,
    platform: nav.platform || "",
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory || 0,
    touchSupport: "ontouchstart" in window || nav.maxTouchPoints > 0,
    maxTouchPoints: nav.maxTouchPoints || 0,
    cookiesEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack || "unknown",
    pdfViewerEnabled: nav.pdfViewerEnabled ?? false,
    colorDepth: screen.colorDepth || 0,
    colorGamut: (() => {
      try {
        if (window.matchMedia("(color-gamut: p3)").matches) return "p3";
        if (window.matchMedia("(color-gamut: srgb)").matches) return "srgb";
        return "unknown";
      } catch { return "unknown"; }
    })(),
    hasLocalStorage: (() => {
      try { localStorage.setItem("_bdt", "1"); localStorage.removeItem("_bdt"); return true; }
      catch { return false; }
    })(),
    hasIndexedDB: !!(window as any).indexedDB,
    hasWebGL: (() => {
      try { return !!document.createElement("canvas").getContext("webgl"); }
      catch { return false; }
    })(),
    osConsistent: checkOsConsistency(),
  };
}

// ─── Interface des signaux ────────────────────────────────────────────────────
export interface BotSignals {
  // Détection d'automatisation
  webdriver: boolean;
  phantom: boolean;
  selenium: boolean;
  headless: boolean;
  automationFlags: boolean;

  // Empreintes médias
  canvasFp: string;
  webglFp: string;
  audioFp: string;

  // Biométrie comportementale
  mouseMovements: number;
  mouseDistance: number;
  mouseVelocityCV: number;    // CV vitesse souris (-1 = données insuffisantes)
  mouseStraightRatio: number; // Ratio segments rectilignes (-1 = données insuffisantes)
  keystrokes: number;
  keystrokeCV: number;        // CV intervalles frappe (-1 = données insuffisantes)
  scrollCount: number;
  clickCount: number;
  touchCount: number;
  focusCount: number;
  pasteCount: number;
  contextMenuCount: number;

  // Timing
  timeSinceLoad: number;
  firstInteractionDelay: number | null;

  // Environnement navigateur
  browser: ReturnType<typeof getBrowserChecks>;
}

// ─── Collecte de tous les signaux ─────────────────────────────────────────────
export async function collectBotSignals(): Promise<BotSignals> {
  return {
    webdriver: detectWebDriver(),
    phantom: detectPhantomJS(),
    selenium: detectSelenium(),
    headless: detectHeadlessChrome(),
    automationFlags: detectAutomationFlags(),
    canvasFp: getCanvasFingerprint(),
    webglFp: getWebGLFingerprint(),
    audioFp: getAudioFingerprint(),
    mouseMovements,
    mouseDistance: Math.round(mouseDistance),
    mouseVelocityCV: computeMouseVelocityCV(),
    mouseStraightRatio: computeMouseStraightRatio(),
    keystrokes,
    keystrokeCV: computeKeystrokeCV(),
    scrollCount,
    clickCount,
    touchCount,
    focusCount,
    pasteCount,
    contextMenuCount,
    timeSinceLoad: Date.now() - pageLoadTime,
    firstInteractionDelay,
    browser: getBrowserChecks(),
  };
}

