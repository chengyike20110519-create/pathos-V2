"use client";

// AuthButton — a tiny pill in the navbar right cluster that swaps
// between Sign In and an Account menu depending on /api/auth/me.
//
// Layout goal: visually peer with the ThemeToggle. Same height, same
// border treatment, same hover behavior. We deliberately do not
// import any PathOS commercial copy or sign-up pitch here so this
// component is reusable across the marketing site and the auth-gated
// workbench without leaking context.
import Link from "next/link";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  tier: "free" | "pro" | "studio";
}

interface MeResponse {
  ok: boolean;
  user?: SessionUser;
  code?: string;
}

export function AuthButton(): JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as MeResponse;
      setUser(data.ok && data.user ? data.user : null);
    } catch {
      setUser(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
    } finally {
      setUser(null);
      setMenuOpen(false);
    }
  }, []);

  // Pre-load state: render nothing so we don't shift the navbar after
  // hydration. The ThemeToggle peer also renders as a fixed-size
  // chip, so the cluster stays balanced.
  if (!loaded) {
    return <div className="h-11 w-11 shrink-0" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <LogIn size={14} aria-hidden="true" />
        <span className="hidden sm:inline">登录</span>
      </Link>
    );
  }

  const label = user.displayName ?? user.email;
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        className="inline-flex h-11 min-w-11 items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-2.5 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <UserRound size={14} aria-hidden="true" />
        <span className="hidden max-w-[120px] truncate sm:inline">{label}</span>
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-control border border-border-soft bg-surface-1 p-1 shadow-lg"
        >
          <div className="px-3 py-2 text-[12px] text-text-tertiary">
            <div className="truncate font-medium text-text-primary">{label}</div>
            <div className="truncate">{user.email}</div>
            <div className="mt-1 inline-flex rounded-full border border-border-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
              {user.tier}
            </div>
          </div>
          <Link
            href="/s/home"
            role="menuitem"
            className="block min-h-11 rounded-control px-3 py-2.5 text-[13px] text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            数据工作台
          </Link>
          <Link
            href="/workbench/orgs"
            role="menuitem"
            className="block rounded-control px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            我的组织
          </Link>
          <Link
            href="/followed"
            role="menuitem"
            className="block rounded-control px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            我的关注
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex min-h-11 w-full items-center gap-1.5 rounded-control px-3 py-2.5 text-left text-[13px] text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            <LogOut size={13} aria-hidden="true" /> 退出登录
          </button>
        </div>
      )}
    </div>
  );
}

export default AuthButton;

