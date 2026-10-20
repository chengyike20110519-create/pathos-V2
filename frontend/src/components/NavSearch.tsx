"use client";

// NavSearch — global search affordance rendered in NavBar.
//
// Why a subcomponent:
//   The NavBar must remain a single source of truth for global
//   navigation, but adding a controlled search input directly
//   inline would force the entire header to ship the
//   usePathname/useRouter/useState trio. Splitting it out lets
//   the parent stay presentation-only and isolates the "open /
//   type / submit / close" state machine to a 1.5KB client island.
//
// Behaviour:
//   - Collapsed: a 36px icon button labelled "搜索". Activated via
//     click or "/" keyboard shortcut, which is the de-facto search
//     hotkey on most sites.
//   - Expanded: an inline input with the existing SearchInput
//     styling; Enter submits to /search?q=... and Esc collapses.
//   - Submitting on the search page itself (pathname starts with
//     /search) skips the navigation and just updates the query
//     param via router.replace, so the live results stay visible
//     while the user keeps typing.

import { Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function isSearchPath(pathname: string | null): boolean {
  return !!pathname && (pathname === "/search" || pathname.startsWith("/search/"));
}

export function NavSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync the input value with the URL when the user is already on /search.
  useEffect(() => {
    if (isSearchPath(pathname)) {
      setValue(searchParams.get("q") ?? "");
    }
  }, [pathname, searchParams]);

  const focusInput = useCallback(() => {
    // Wait one tick so the controlled input has rendered.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  // "/" keyboard shortcut to open search (skip when typing in another input).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.key === "/" && !inEditable && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
        focusInput();
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, focusInput]);

  const submit = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    if (isSearchPath(pathname)) {
      router.replace(`/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
    // Close the inline input on submit; the results page owns the rest.
    setOpen(false);
  }, [value, pathname, router]);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="搜索学校 / 城市"
        title="搜索（按 / 打开）"
        onClick={() => {
          setOpen(true);
          focusInput();
        }}
        className="grid h-11 w-11 place-items-center rounded-control border border-border-soft bg-surface-1 text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Search size={15} aria-hidden="true" />
      </button>
    );
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-center gap-1"
    >
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="搜索学校 / 城市"
          aria-label="搜索学校 / 城市"
          // Compact width on small screens, fixed 240px on >= sm.
          className="min-h-11 w-44 rounded-control border border-border-soft bg-surface-1 py-1.5 pl-8 pr-3 text-[13px] outline-none transition focus:border-cobalt/45 focus:ring-2 focus:ring-focus-ring sm:w-60"
        />
      </div>
      <button
        type="button"
        aria-label="关闭搜索"
        onClick={() => {
          setValue("");
          setOpen(false);
        }}
        className="grid h-11 w-11 place-items-center rounded-control text-text-secondary transition hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <X size={15} aria-hidden="true" />
      </button>
      {/* Hidden submit so Enter still works without an extra button. */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}

export default NavSearch;
