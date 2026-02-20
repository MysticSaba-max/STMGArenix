import { useEffect, useRef } from "react";

// ── Mouse spotlight ────────────────────────────────────────────────────────
function MouseSpotlight() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    let rafId: number;
    let x = -200;
    let y = -200;

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--mouse-x", `${x}px`);
        document.documentElement.style.setProperty("--mouse-y", `${y}px`);
      });
    };

    const onLeave = () => {
      document.documentElement.style.setProperty("--mouse-x", "-200%");
      document.documentElement.style.setProperty("--mouse-y", "-200%");
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <div ref={layerRef} className="spotlight-layer" aria-hidden="true" />;
}

// ── Scroll reveal ──────────────────────────────────────────────────────────
function ScrollRevealObserver() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target); // animate once
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    // Observe all .scroll-reveal elements already in the DOM
    const observe = () => {
      document.querySelectorAll(".scroll-reveal").forEach((el) => {
        observer.observe(el);
      });
    };

    observe();

    // Also watch for new elements added dynamically (route changes)
    const mutationObserver = new MutationObserver(observe);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return null;
}

// ── Combined export ────────────────────────────────────────────────────────
export function GlobalEffects() {
  return (
    <>
      <MouseSpotlight />
      <ScrollRevealObserver />
    </>
  );
}
