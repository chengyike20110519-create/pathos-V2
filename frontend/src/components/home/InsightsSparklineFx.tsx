"use client";

// InsightsSparklineFx — triggers the sparkline draw animation once
// the DataInsightsSection enters view. Scoped to [data-section="insights"]
// so the same selector can be reused elsewhere without colliding.
//
// Without JS / with reduced-motion the static line stays drawn.
// The CSS in home-fx.css handles both states.

import { useEffect } from "react";

export default function InsightsSparklineFx() {
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.querySelector("[data-home-root=\"true\"]");
    const section = root?.querySelector('[data-section="insights"]');
    if (!section) return;
    const lines = Array.from(
      section.querySelectorAll<HTMLElement>("[data-sparkline]"),
    );
    if (lines.length === 0) return;

    if (reduced) {
      lines.forEach((el) => el.setAttribute("data-draw-state", "done"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            target.setAttribute("data-draw-state", "done");
            observer.unobserve(target);
          }
        }
      },
      { threshold: 0.25 },
    );
    lines.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
