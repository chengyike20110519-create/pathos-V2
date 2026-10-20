"use client";

import { useEffect, useRef, type ReactNode } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type PageMotionProps = {
  children: ReactNode;
  className?: string;
  /** Single-screen stages (entry pages) have nothing to scroll, so the
      progress bar and back-to-top affordance would be dead chrome there. */
  chrome?: boolean;
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function animateCounter(element: HTMLElement, reduced: boolean): void {
  const raw = element.dataset.counter;
  if (!raw || element.dataset.motionCounted === "true") return;

  // Auto-detect decimal precision so the same element can host whole numbers
  // (录取率 6, 在校人数 5671) and floats (GPA 2.89, 回收比例 126%) without
  // a separate attribute. parseInt drops the fraction silently, so we now
  // switch to parseFloat and render to the same precision on every frame.
  const decimalDigits = raw.includes(".") ? raw.split(".")[1].length : 0;
  const target =
    decimalDigits > 0 ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
  if (!Number.isFinite(target)) return;
  element.dataset.motionCounted = "true";

  // Large currency figures need thousands separators on every frame, not
  // just at rest, otherwise the number visibly reflows when it settles.
  const useLocale = element.dataset.counterFormat === "locale";
  const factor = Math.pow(10, decimalDigits);
  const render = (value: number) => {
    const rounded = Math.round(value * factor) / factor;
    if (useLocale) {
      return rounded.toLocaleString("en-US", {
        minimumFractionDigits: decimalDigits,
        maximumFractionDigits: decimalDigits,
      });
    }
    return decimalDigits > 0 ? rounded.toFixed(decimalDigits) : String(rounded);
  };
  const settled = render(target);

  if (reduced) {
    element.textContent = settled;
    return;
  }

  const start = performance.now();
  const duration = 800;
  const frame = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    element.textContent = render(target * easeOutCubic(progress));
    if (progress < 1) {
      window.requestAnimationFrame(frame);
      return;
    }
    element.textContent = settled;
    element.classList.add("is-motion-counted");
    window.setTimeout(() => element.classList.remove("is-motion-counted"), 360);
  };
  window.requestAnimationFrame(frame);
}

function splitHeading(element: HTMLElement): void {
  if (element.dataset.motionHeading === "split") return;
  const text = element.textContent?.trim() ?? "";
  if (!text) return;

  const tokens = text.match(/\s+|[^\s]/g) ?? [];
  if (tokens.length < 2) {
    element.dataset.motionHeading = "split";
    return;
  }

  element.textContent = "";
  let index = 0;
  tokens.forEach((token) => {
    const span = document.createElement("span");
    if (/^\s+$/.test(token)) {
      span.className = "page-motion-space";
      span.textContent = token;
    } else {
      span.className = "page-motion-word";
      span.style.setProperty("--motion-index", String(index));
      span.textContent = token;
      index += 1;
    }
    element.appendChild(span);
  });
  element.dataset.motionHeading = "split";
}

export default function PageMotion({ children, className = "", chrome = true }: PageMotionProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = prefersReducedMotion();
    root.classList.add("is-page-motion-ready");

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-motion-visible");
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target as HTMLElement, reduced);
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.45 },
    );

    const headingObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-motion-visible");
          headingObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.2 },
    );

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          (entry.target as HTMLElement).style.setProperty(
            "--motion-section-progress",
            String(Math.max(0, entry.intersectionRatio)),
          );
        });
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    const wire = () => {
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
        if (element.dataset.motionReveal === "wired") return;
        element.dataset.motionReveal = "wired";
        if (reduced) {
          element.classList.add("is-motion-visible", "is-visible");
        } else {
          revealObserver.observe(element);
        }
      });

      root.querySelectorAll<HTMLElement>("[data-counter]").forEach((element) => {
        if (element.dataset.motionCounter === "wired") return;
        element.dataset.motionCounter = "wired";
        if (reduced) animateCounter(element, true);
        else counterObserver.observe(element);
      });

      root.querySelectorAll<HTMLElement>("[data-heading-stagger]").forEach((element) => {
        if (element.dataset.motionHeadingObserver === "wired") return;
        element.dataset.motionHeadingObserver = "wired";
        splitHeading(element);
        // Heading stagger is a one-shot entrance: animate immediately rather
        // than wait for an IntersectionObserver callback that can race with
        // StrictMode double mount or short headings (height < threshold).
        // Reduced-motion users see the final state right away.
        // Apply the final visible class synchronously. We tried a
        // requestAnimationFrame indirection to let freshly split spans
        // start from opacity:0 and fade in, but the rAF callback was
        // being dropped when StrictMode ran cleanup between the two
        // mounts, leaving every word stuck at opacity:0.
        element.classList.add("is-motion-visible");
        headingObserver.unobserve(element);
      });

      root.querySelectorAll<HTMLElement>("[data-section]").forEach((element) => {
        if (element.dataset.motionSection === "wired") return;
        element.dataset.motionSection = "wired";
        sectionObserver.observe(element);
      });
    };

    wire();
    const mutationObserver = new MutationObserver(wire);
    mutationObserver.observe(root, { childList: true, subtree: true });

    // Synchronous first-paint reveal: anything already inside the viewport
    // (or just above it) gets the visible class right away so first-paint
    // snapshots and audit captures don't straddle a stalled IntersectionObserver
    // callback. Without this, the difference between getComputedStyle (which
    // reports the target opacity:1) and the actual rendered paint (still in
    // mid-transition at opacity:0) means a screenshot can show a fully-styled
    // but invisible card grid.
    const syncInViewReveals = () => {
      const win = root.ownerDocument ? root.ownerDocument.defaultView : null;
      const vh = win ? win.innerHeight : window.innerHeight;
      root.querySelectorAll("[data-reveal]").forEach((el) => {
        if (el.classList.contains("is-motion-visible")) return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom >= 0 && rect.top <= vh) {
          el.classList.add("is-motion-visible", "is-visible");
        }
      });
    };
    syncInViewReveals();

    // Belt-and-suspenders fallback: any reveal still hidden 1500 ms after mount
    // (e.g. observer race, audit-tool freeze, dev-mode StrictMode second mount)
    // is force-revealed so SSR HTML can never appear stuck. The observer still
    // drives real scroll-in transitions for elements revealed after t=0.
    const revealFallbackTimer = window.setTimeout(syncInViewReveals, 1500);

    const progressElement = root.querySelector<HTMLElement>("[data-page-progress]");
    const backTopElement = root.querySelector<HTMLElement>("[data-page-back-top]");
    let rafId: number | null = null;
    const updateChrome = () => {
      rafId = null;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      progressElement?.style.setProperty("--page-progress", String(progress));
      if (backTopElement) {
        backTopElement.dataset.visible = window.scrollY > Math.max(320, window.innerHeight * 0.5) ? "true" : "false";
      }
    };
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(updateChrome);
    };

    updateChrome();
    if (!reduced) window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(revealFallbackTimer);
      revealObserver.disconnect();
      counterObserver.disconnect();
      headingObserver.disconnect();
      sectionObserver.disconnect();
      mutationObserver.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      // Clear wire markers so React StrictMode second mount re-wires observers.
      // Without this, dataset.motionReveal === "wired" survives the disconnect,
      // wire() short-circuits, and every [data-reveal] stays at opacity:0.
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach(function (el) { delete el.dataset.motionReveal; });
      root.querySelectorAll<HTMLElement>("[data-counter]").forEach(function (el) {
        delete el.dataset.motionCounter;
        delete el.dataset.motionCounted;
      });
      root.querySelectorAll<HTMLElement>("[data-heading-stagger]").forEach(function (el) { delete el.dataset.motionHeadingObserver; });
      root.querySelectorAll<HTMLElement>("[data-section]").forEach(function (el) { delete el.dataset.motionSection; });
    };
  }, []);

  return (
    <div ref={rootRef} data-page-root className={`page-motion-root ${className}`.trim()}>
      {chrome ? <div className="page-motion-progress" data-page-progress aria-hidden="true" /> : null}
      {children}
      {chrome ? (
        <a
          className="page-motion-back-top"
          data-page-back-top
          href="#main-content"
          aria-label="回到顶部"
          title="回到顶部"
        >
          <span aria-hidden="true">↑</span>
          <span>顶部</span>
        </a>
      ) : null}
    </div>
  );
}
