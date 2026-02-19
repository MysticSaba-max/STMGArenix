const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

let widgetId: string | null = null;
let containerEl: HTMLDivElement | null = null;
let currentResolve: ((token: string) => void) | null = null;

function ensureWidget() {
  if (containerEl) return;
  containerEl = document.createElement("div");
  containerEl.id = "turnstile-container";
  containerEl.style.display = "none";
  document.body.appendChild(containerEl);
}

function renderWidget(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (typeof window.turnstile !== "undefined") {
        ensureWidget();
        widgetId = window.turnstile.render(containerEl!, {
          sitekey: SITE_KEY,
          size: "invisible",
          callback: (token: string) => {
            if (currentResolve) {
              currentResolve(token);
              currentResolve = null;
            }
          },
        });
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

export async function getTurnstileToken(): Promise<string> {
  if (!SITE_KEY) return "";

  if (widgetId === null) {
    await renderWidget();
  }

  return new Promise((resolve) => {
    currentResolve = resolve;
    window.turnstile.reset(widgetId!);
    window.turnstile.execute(widgetId!);
  });
}

declare global {
  interface Window {
    turnstile: {
      render: (container: HTMLElement, options: any) => string;
      reset: (widgetId: string) => void;
      execute: (widgetId: string) => void;
    };
  }
}
