"use client";

// GDPR-style cookie consent banner. Two buttons (拒绝 / 同意) and a
// setting that the user can revisit from the footer. Consent is stored
// in localStorage so SSR never sees the banner.
//
// We do NOT call out to GA / Mixpanel / Posthog yet — the underlying
// tracking code is not installed. The banner exists so that when we
// do add tracking we can read consent from this single source.

import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "pathos.cookie.consent.v1";

type ConsentValue = "accepted" | "rejected" | null;

function getStoredConsent(): ConsentValue {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "accepted" || raw === "rejected") return raw;
    return null;
  } catch {
    return null;
  }
}

function persistConsent(value: ConsentValue) {
  if (typeof window === "undefined") return;
  try {
    if (value == null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
    // Notify same-tab listeners (we re-render this component too, but
    // this lets future components observe changes).
    window.dispatchEvent(new CustomEvent("pathos:consent", { detail: value }));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function readConsent(): ConsentValue {
  return getStoredConsent();
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setVisible(getStoredConsent() == null);
  }, []);

  if (!hydrated || !visible) return null;

  const accept = () => { persistConsent("accepted"); setVisible(false); };
  const reject = () => { persistConsent("rejected"); setVisible(false); };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie 同意"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-card border border-border-soft bg-surface-1/95 p-4 shadow-panel backdrop-blur supports-[backdrop-filter]:bg-surface-1/80 sm:bottom-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/8 text-text-secondary">
          <Cookie size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
          <p className="font-medium text-text-primary">关于 Cookie 与数据采集</p>
          <p className="mt-1">
            PathOS 使用必要 Cookie 维持登录与表单状态。我们不会在没有你同意的情况下投放分析与广告追踪。
            <a href="/about" className="ml-1 underline decoration-text-tertiary underline-offset-2 hover:text-text-primary">查看完整隐私说明</a>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={reject}
            className="h-11 rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            仅必要
          </button>
          <button
            type="button"
            onClick={accept}
            className="h-11 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            同意
          </button>
          <button
            type="button"
            onClick={reject}
            aria-label="关闭"
            className="grid h-11 w-11 place-items-center rounded-control text-text-tertiary transition hover:bg-surface-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
