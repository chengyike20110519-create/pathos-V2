"use client";

// HeroTilt — bestieu.com style mouse-driven 3D tilt on the hero body.
// Captures pointer position relative to the hero frame and writes
// --tilt-x / --tilt-y (degrees) so the CSS can do the perspective
// rotation. Pointer-leave springs back to zero. Disabled when
// prefers-reduced-motion is set.

import { useEffect } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export default function HeroTilt() {
  useEffect(() => {
    const body = document.querySelector<HTMLElement>("[data-hero-tilt]");
    if (!body) return;
    const reduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    if (reduced) return;

    const MAX = 4.5;

    let rect = body.getBoundingClientRect();
    const refreshRect = () => {
      rect = body.getBoundingClientRect();
    };

    const onMove = (e: PointerEvent) => {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const tiltY = Math.max(-1, Math.min(1, dx)) * MAX;
      const tiltX = Math.max(-1, Math.min(1, -dy)) * MAX;
      body.style.setProperty("--tilt-x", tiltX.toFixed(2) + "deg");
      body.style.setProperty("--tilt-y", tiltY.toFixed(2) + "deg");
    };

    const onLeave = () => {
      body.style.setProperty("--tilt-x", "0deg");
      body.style.setProperty("--tilt-y", "0deg");
    };

    body.addEventListener("pointermove", onMove, { passive: true });
    body.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("resize", refreshRect);
    window.addEventListener("scroll", refreshRect, { passive: true });

    return () => {
      body.removeEventListener("pointermove", onMove);
      body.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", refreshRect);
      window.removeEventListener("scroll", refreshRect);
    };
  }, []);

  return null;
}
