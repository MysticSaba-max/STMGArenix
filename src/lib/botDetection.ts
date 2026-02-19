// ─── Détection de bots côté navigateur ───────────────────────────────────────
// Analyse multi-couche : webdriver, canvas, WebGL, audio, comportement souris/clavier

let pageLoadTime = Date.now();
let mouseMovements = 0;
let mouseDistance = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let keystrokes = 0;
let scrollCount = 0;
let hasInteracted = false;
let firstInteractionDelay: number | null = null;
let clickCount = 0;
let touchCount = 0;

// ─── Tracking comportemental ─────────────────────────────────────────────────
function onMouseMove(e: MouseEvent) {
  mouseMovements++;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  mouseDistance += Math.sqrt(dx * dx + dy * dy);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (!hasInteracted) {
    hasInteracted = true;
    firstInteractionDelay = Date.now() - pageLoadTime;
  }
}

function onKeyDown() {
  keystrokes++;
  if (!hasInteracted) {
    hasInteracted = true;
    firstInteractionDelay = Date.now() - pageLoadTime;
  }
}

function onScroll() {
  scrollCount++;
}

function onClick() {
  clickCount++;
  if (!hasInteracted) {
    hasInteracted = true;
    firstInteractionDelay = Date.now() - pageLoadTime;
  }
}

function onTouch() {
  touchCount++;
  if (!hasInteracted) {
    hasInteracted = true;
    firstInteractionDelay = Date.now() - pageLoadTime;
  }
}

export function initBotDetection() {
  pageLoadTime = Date.now();
  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("keydown", onKeyDown, { passive: true });
  document.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick, { passive: true });
  document.addEventListener("touchstart", onTouch, { passive: true });
}

// ─── Détection webdriver / Selenium / Phantom ────────────────────────────────
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
    w.__selenium_evaluate ||
    w.__selenium_unwrapped ||
    w.__fxdriver_evaluate ||
    w.__driver_evaluate ||
    w.__webdriver_evaluate ||
    w.Selenium ||
    w.selenium ||
    w.callSelenium ||
    w._selenium ||
    w.__nightmarejs ||
    d.__selenium_evaluate ||
    d.__webdriver_evaluate ||
    d.__fxdriver_evaluate ||
    d.__driver_evaluate ||
    d.__driver_unwrapped ||
    d.__webdriver_unwrapped ||
    d.__fxdriver_unwrapped
  );
}

function detectHeadlessChrome(): boolean {
  const ua = navigator.userAgent || "";
  if (/HeadlessChrome/i.test(ua)) return true;

  // Chrome sans plugins = suspect (sauf mobile)
  if (
    /Chrome/i.test(ua) &&
    !("ontouchstart" in window) &&
    navigator.plugins.length === 0
  ) {
    return true;
  }

  // Vérification des propriétés manquantes en headless
  if (typeof (window as any).outerWidth === "undefined") return true;
  if (window.outerWidth === 0 && window.outerHeight === 0) return true;

  return false;
}

function detectAutomationFlags(): boolean {
  const w = window as any;
  return !!(
    w.domAutomation ||
    w.domAutomationController ||
    w.__cdc_asdjflasutopfhvcZLmcfl_ || // old Chrome flag
    w.__selenium_unwrapped ||
    document.documentElement.getAttribute("webdriver") !== null
  );
}

// ─── Canvas fingerprint ───────────────────────────────────────────────────────
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Sécurité 🔒", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Sécurité 🔒", 4, 17);

    // Opérations graphiques supplémentaires
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgb(255,0,255)";
    ctx.beginPath();
    ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    const data = canvas.toDataURL();
    // Utiliser les derniers 80 caractères comme empreinte
    return data.slice(-80);
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

    // Extensions disponibles
    const exts = gl.getSupportedExtensions() || [];
    const extCount = exts.length;

    return `${vendor}|${renderer}|${version.slice(0, 30)}|${extCount}`;
  } catch {
    return "webgl-error";
  }
}

// ─── Audio fingerprint ────────────────────────────────────────────────────────
async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioCtx =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return "no-audio-api";

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();

    analyser.fftSize = 512;
    gain.gain.value = 0; // Silencieux

    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;

    oscillator.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(0);

    return await new Promise<string>((resolve) => {
      const buffer = new Float32Array(analyser.frequencyBinCount);
      const timeout = setTimeout(() => {
        try {
          oscillator.stop();
          ctx.close();
        } catch {}
        resolve("audio-timeout");
      }, 1500);

      requestAnimationFrame(() => {
        analyser.getFloatFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += Math.abs(buffer[i]);
        }
        clearTimeout(timeout);
        try {
          oscillator.stop();
          ctx.close();
        } catch {}
        resolve(sum.toFixed(6));
      });
    });
  } catch {
    return "audio-error";
  }
}

// ─── Vérifications navigateur supplémentaires ────────────────────────────────
function getBrowserChecks() {
  const nav = navigator as any;
  return {
    plugins: nav.plugins?.length ?? 0,
    languages: nav.languages?.join(",") || nav.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    platform: nav.platform || "",
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: nav.deviceMemory || 0,
    touchSupport: "ontouchstart" in window || nav.maxTouchPoints > 0,
    cookiesEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack || "unknown",
    pdfViewerEnabled: nav.pdfViewerEnabled ?? false,
    hasLocalStorage: (() => {
      try {
        localStorage.setItem("_t", "1");
        localStorage.removeItem("_t");
        return true;
      } catch {
        return false;
      }
    })(),
    hasIndexedDB: !!(window as any).indexedDB,
    hasWebGL: (() => {
      try {
        return !!document.createElement("canvas").getContext("webgl");
      } catch {
        return false;
      }
    })(),
  };
}

// ─── Interface des signaux ────────────────────────────────────────────────────
export interface BotSignals {
  webdriver: boolean;
  phantom: boolean;
  selenium: boolean;
  headless: boolean;
  automationFlags: boolean;
  canvasFp: string;
  webglFp: string;
  audioFp: string;
  mouseMovements: number;
  mouseDistance: number;
  keystrokes: number;
  scrollCount: number;
  clickCount: number;
  touchCount: number;
  timeSinceLoad: number;
  firstInteractionDelay: number | null;
  browser: ReturnType<typeof getBrowserChecks>;
}

// ─── Collecte de tous les signaux ────────────────────────────────────────────
export async function collectBotSignals(): Promise<BotSignals> {
  const [audioFp] = await Promise.all([getAudioFingerprint()]);

  return {
    webdriver: detectWebDriver(),
    phantom: detectPhantomJS(),
    selenium: detectSelenium(),
    headless: detectHeadlessChrome(),
    automationFlags: detectAutomationFlags(),
    canvasFp: getCanvasFingerprint(),
    webglFp: getWebGLFingerprint(),
    audioFp,
    mouseMovements,
    mouseDistance: Math.round(mouseDistance),
    keystrokes,
    scrollCount,
    clickCount,
    touchCount,
    timeSinceLoad: Date.now() - pageLoadTime,
    firstInteractionDelay,
    browser: getBrowserChecks(),
  };
}

// ─── Calcul du score de bot (0 = humain, 100+ = bot certain) ─────────────────
export function computeBotScore(s: BotSignals): number {
  let score = 0;

  // Indicateurs définitifs de bot
  if (s.webdriver) score += 100;
  if (s.phantom) score += 100;
  if (s.selenium) score += 100;
  if (s.automationFlags) score += 90;
  if (s.headless) score += 80;

  // Comportement : aucune interaction souris/clavier/scroll
  if (s.mouseMovements === 0 && s.clickCount === 0 && s.touchCount === 0) score += 35;
  if (s.mouseDistance < 10 && !s.browser.touchSupport) score += 15;
  if (s.keystrokes === 0) score += 10;
  if (s.scrollCount === 0) score += 5;

  // Trop rapide
  if (s.timeSinceLoad < 500) score += 40;
  else if (s.timeSinceLoad < 1500) score += 20;

  // Pas d'interaction immédiate sur vote (< 200ms = scripted)
  if (s.firstInteractionDelay !== null && s.firstInteractionDelay < 200) score += 25;

  // Navigateur suspect
  if (s.browser.plugins === 0 && !s.browser.touchSupport) score += 15;
  if (!s.browser.languages) score += 20;
  if (!s.browser.timezone) score += 15;
  if (s.browser.hardwareConcurrency === 0) score += 15;

  // Canvas/WebGL absents (headless ou sandboxé)
  if (s.canvasFp === "no-canvas" || s.canvasFp === "canvas-error") score += 25;
  if (s.webglFp === "no-webgl") score += 20;
  if (s.audioFp === "no-audio-api" || s.audioFp === "audio-error") score += 10;

  // Pas de localStorage / indexedDB (environnement restreint)
  if (!s.browser.hasLocalStorage) score += 15;

  return Math.min(score, 200); // Plafonner à 200
}
