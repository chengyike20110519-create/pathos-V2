"use client";

// HomeScrollFx 鈥?additive scroll-driven effects for the home page.
//
// What it adds on top of the existing /src/app/page.tsx layout:
//   1. Scroll-triggered fade-up reveals for elements marked with
//      `[data-reveal]`. Each element gets `data-reveal-delay` (ms)
//      which becomes the transition-delay, producing the staggered
//      cascade bestieu.com uses (60-80ms steps).
//   2. Counter-up animation for numbers marked with `[data-counter]`.
//      Animates from 0 to the integer in `data-counter` over ~900ms
//      using an ease-out cubic, then adds a small scale punch so the
//      number "lands" rather than just stopping.
//   3. A 2px scroll-progress bar at the top of the viewport that fills
//      as the user scrolls (driven by a `--progress` CSS variable).
//   4. A back-to-top button that fades in once the user scrolls past
//      ~0.8 viewport heights. Renders as a circular icon button.
//   5. Hero parallax 鈥?the earth background layer scrolls at 0.4脳
//      page speed, giving depth without distracting from the content.
//   6. Section divider draw 鈥?every <section> gets a top divider line
//      that draws from 0鈫?00% width as the section enters view.
//   7. Word stagger on h2 headings 鈥?once on first reveal, splits
//      inner text into word spans and applies a left-to-right stagger.
//   8. Active chapter marker 鈥?the right-margin `[data-chapter-pin]`
//      (if present) reflects which section is currently in view.
//
// Why a MutationObserver matters:
//   The home page composes server sections (hero / boundary / modules)
//   with client components (FeaturedSchools, LatestUpdates) that only
//   render their cards after their data hook resolves. Those cards
//   mount AFTER this controller's initial useEffect, so a single
//   `querySelectorAll` pass would miss them and leave them invisible.
//   The MutationObserver below picks up any new `[data-reveal]` /
//   `[data-counter]` / `[data-section]` nodes appended under
//   [data-home-root] and wires them into the existing observers.
//
// Safety:
//   - All reveals are JS-gated. If JS is disabled or this client island
//     never mounts, the static layout is fully visible at rest 鈥?no
//     `opacity: 0` baseline is ever applied via CSS alone.
//   - `prefers-reduced-motion: reduce` skips animations entirely and
//     snaps reveals/counters/parallax to their final state.
//   - Observers and listeners are torn down on unmount.

import { useEffect } from "react";

const REVEAL_SELECTOR = "[data-reveal]";
const COUNTER_SELECTOR = "[data-counter]";
const SECTION_SELECTOR = "[data-section]";
const HEADING_STAGGER_SELECTOR = "[data-heading-stagger]";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// Cubic ease-out: the number lands on the target rather than counting
// past it. Same shape used by bestieu.com's animate.css classes.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Spring-ish ease-out-back for the counter punch 鈥?slightly overshoots
// so the number feels like it "snaps" into place.
function easeOutBack(t: number, s = 1.4): number {
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}

function animateCount(el: HTMLElement, reduced: boolean): void {
  const raw = el.getAttribute("data-counter");
  if (!raw) return;
  const target = Number.parseInt(raw, 10);
  if (!Number.isFinite(target)) return;

  if (reduced) {
    el.textContent = raw;
    return;
  }

  const duration = 900;
  const start = performance.now();
  const step = (now: number) => {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / duration);
    const value = Math.round(target * easeOutCubic(progress));
    el.textContent = String(value);
    if (progress < 1) {
      requestAnimationFrame(step);
      return;
    }
    // Pin to the exact source value to avoid rounding drift, then
    // trigger a small scale punch so the number feels like it lands.
    el.textContent = raw;
    el.classList.add("is-counter-punched");
    window.setTimeout(() => el.classList.remove("is-counter-punched"), 380);
  };
  requestAnimationFrame(step);
}

// Split the inner text of an element into per-word spans so we can
// stagger their reveal. Preserves a single leading space. Returns true
// if a split actually happened.
function splitHeadingWords(el: HTMLElement): boolean {
  if (el.dataset.headingSplit === "done") return false;
  const original = el.textContent ?? "";
  if (!original.trim()) return false;

  // Tokens = runs of whitespace OR runs of non-whitespace. For CJK
  // headings (no ASCII spaces between words) the non-whitespace runs
  // collapse to single characters, so each character fades in on its
  // own delay 鈥?closer to the bestieu.com per-word cascade while
  // staying legible for Chinese strings.
  const tokens = original.match(/\s+|[^\s]/g) ?? [];
  if (tokens.length <= 1) return false;

  el.textContent = "";
  let wordIndex = 0;
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      const spaceSpan = document.createElement("span");
      spaceSpan.className = "home-heading-space";
      spaceSpan.textContent = tok;
      el.appendChild(spaceSpan);
      continue;
    }
    const span = document.createElement("span");
    span.className = "home-heading-word";
    span.style.setProperty("--word-index", String(wordIndex));
    span.textContent = tok;
    el.appendChild(span);
    wordIndex += 1;
  }
  el.dataset.headingSplit = "done";
  return true;
}

export default function HomeScrollFx() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-home-root]");
    if (!root) return;

    const reduced = prefersReducedMotion();
    // Tag the root so the CSS reveal rules engage. This is the single
    // opt-in signal 鈥?without it the static layout stays at full opacity.
    root.classList.add("js-home-scroll-fx");

    // 1. Reveals: observe each [data-reveal] and add `.is-revealed`
    //    when the element crosses 12% into the viewport.
    const revealTargets = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    // Script-gated: if reduced motion or a debug query is set, always reveal immediately.
    if (reduced) {
      revealTargets.forEach((el) => el.classList.add("is-revealed"));
    } else {
      revealTargets.forEach((el) => revealObserver.observe(el));
    }

    // 2. Counters: animate from 0 to the target value the first time
    //    the element is at least 40% in view.
    const counterTargets = Array.from(root.querySelectorAll<HTMLElement>(COUNTER_SELECTOR));
    const counterObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            animateCount(entry.target as HTMLElement, reduced);
            counterObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.4 },
    );
    counterTargets.forEach((el) => counterObserver.observe(el));

    // 3. Section divider draw: each <section data-section> grows a
    //    `--section-progress` custom property from 0 to 1 as the
    //    section scrolls into view. CSS uses that to animate the
    //    top border's width.
    const sectionTargets = Array.from(root.querySelectorAll<HTMLElement>(SECTION_SELECTOR));
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          el.style.setProperty("--section-progress", String(Math.max(0, entry.intersectionRatio)));
          if (entry.isIntersecting) {
            const targetId = el.getAttribute("data-chapter-target");
            if (targetId) {
              for (const btn of chapterPinButtons) {
                btn.dataset.active = btn.getAttribute("data-chapter-target") === targetId ? "true" : "false";
              }
            }
          }
        }
      },
      { threshold: [0, 0.15, 0.4, 0.7, 1] },
    );
    sectionTargets.forEach((el) => sectionObserver.observe(el));

    // Debug/screenshot helper: ?reveal=all forces every reveal to its final
    // state immediately so headless browsers can capture the full page
    // without IntersectionObserver firing.
    const forceReveal = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reveal") === "all";
    if (forceReveal) {
      revealTargets.forEach((el) => el.classList.add("is-revealed"));
      counterTargets.forEach((el) => {
        const final = Number(el.dataset.counter || "0");
        if (Number.isFinite(final) && final > 0) el.textContent = String(Math.round(final));
      });
      sectionTargets.forEach((el) => el.style.setProperty("--section-progress", "1"));
    }

    // 3b. Chapter-pin wiring (bestieu-style right-margin pin list).
    const chapterPin = root.querySelector<HTMLElement>("[data-chapter-pin]");
    const chapterPinButtons = chapterPin ? Array.from(chapterPin.querySelectorAll<HTMLButtonElement>("[data-chapter-pin-item]")) : [];
    for (const btn of chapterPinButtons) {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-chapter-target");
        if (!targetId) return;
        const targetEl = root.querySelector<HTMLElement>(`[data-chapter-target="${targetId}"][data-section]`);
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          window.scrollBy({ top: rect.top - 80, behavior: reduced ? "auto" : "smooth" });
        }
      });
    }

    // 4. Heading stagger: pre-split any [data-heading-stagger] nodes
    //    so the CSS can fade-in each word independently.
    const headingTargets = Array.from(root.querySelectorAll<HTMLElement>(HEADING_STAGGER_SELECTOR));
    if (reduced) {
      // No-op: CSS falls back to no-split, fully visible.
    } else {
      headingTargets.forEach(splitHeadingWords);
    }

    // Watch for any [data-reveal] / [data-counter] / [data-section] /
    // [data-heading-stagger] nodes that mount AFTER the initial scan.
    // This catches client components whose first render shows an empty
    // / loading state and only later populates cards (e.g.
    // FeaturedSchoolsSection, LatestUpdatesSection).
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.closest("[data-back-to-top]")) continue;

          if (node.matches(REVEAL_SELECTOR)) {
            if (reduced) node.classList.add("is-revealed");
            else revealObserver.observe(node);
          }
          if (node.matches(COUNTER_SELECTOR)) counterObserver.observe(node);
          if (node.matches(SECTION_SELECTOR)) sectionObserver.observe(node);
          if (node.matches(HEADING_STAGGER_SELECTOR) && !reduced) {
            splitHeadingWords(node);
          }

          const nestedReveals = node.querySelectorAll?.<HTMLElement>(REVEAL_SELECTOR);
          if (nestedReveals && nestedReveals.length) {
            if (reduced) nestedReveals.forEach((el) => el.classList.add("is-revealed"));
            else nestedReveals.forEach((el) => revealObserver.observe(el));
          }
          const nestedCounters = node.querySelectorAll?.<HTMLElement>(COUNTER_SELECTOR);
          if (nestedCounters && nestedCounters.length) {
            nestedCounters.forEach((el) => counterObserver.observe(el));
          }
          const nestedSections = node.querySelectorAll?.<HTMLElement>(SECTION_SELECTOR);
          if (nestedSections && nestedSections.length) {
            nestedSections.forEach((el) => sectionObserver.observe(el));
          }
          const nestedHeadings = node.querySelectorAll?.<HTMLElement>(HEADING_STAGGER_SELECTOR);
          if (nestedHeadings && nestedHeadings.length && !reduced) {
            nestedHeadings.forEach(splitHeadingWords);
          }
        }
      }
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    // 5. Progress bar + back-to-top + hero parallax: driven by a single
    //    rAF-throttled scroll listener that writes --progress,
    //    --hero-parallax, and toggles data-visible on the back-to-top.
    const progressEl = root.querySelector<HTMLElement>("[data-scroll-progress]");
    const toTopEl = root.querySelector<HTMLElement>("[data-back-to-top]");
    const heroEl = root.querySelector<HTMLElement>("[data-hero]");
    const heroEarth = root.querySelector<HTMLElement>("[data-hero-earth]");

    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      if (progressEl) {
        progressEl.style.setProperty("--progress", String(ratio));
      }
      if (toTopEl) {
        const past = doc.scrollTop > doc.clientHeight * 0.8;
        toTopEl.dataset.visible = past ? "true" : "false";
      }
      // Parallax: only active while hero is on-screen. Translates the
      // earth background upward at 0.4脳 scroll speed so it feels like
      // the user is gently looking past the horizon.
      if (heroEl && heroEarth) {
        const heroRect = heroEl.getBoundingClientRect();
        if (heroRect.bottom > 0 && heroRect.top < doc.clientHeight) {
          const offset = Math.max(-200, Math.min(200, -heroRect.top * 0.4));
          heroEarth.style.setProperty("--hero-parallax", `${offset}px`);
        } else if (heroRect.bottom <= 0) {
          heroEarth.style.setProperty("--hero-parallax", `-200px`);
        } else {
          heroEarth.style.setProperty("--hero-parallax", `0px`);
        }
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const onToTopClick = () => {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    };
    toTopEl?.addEventListener("click", onToTopClick);



    return () => {
      revealObserver.disconnect();
      counterObserver.disconnect();
      sectionObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      toTopEl?.removeEventListener("click", onToTopClick);
    };
  }, []);

  // Pure side-effect component 鈥?no DOM output. The fixed-position
  // progress bar and back-to-top button live in page.tsx so they sit
  // inside the home root where this controller can find them.
  return null;
}


