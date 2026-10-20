// Client-side track() helper.
//
// Usage from a React component:
//   track("view", "/pricing");
//
// Behavior:
//   - Sends POST /api/track with { type, path, meta? } as JSON.
//   - Uses `navigator.sendBeacon` when available (so the request
//     survives a navigation that would otherwise cancel a fetch).
//   - Swallows errors silently; tracking is fire-and-forget.
//   - Skips entirely in SSR (typeof window === "undefined").

import type { TrackEventType } from "@/lib/track";

interface TrackArgs {
  type: TrackEventType;
  path?: string;
  meta?: Record<string, unknown>;
}

export function track(type: TrackEventType, path?: string, meta?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ type, path, meta });
  // Prefer sendBeacon so we don't get cancelled by navigation.
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/track", blob);
      if (ok) return;
    } catch {
      // fall through to fetch
    }
  }
  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // swallow
  }
}

// Re-export the canonical type list for client components that want to
// validate without importing the server-side lib.
export { TRACK_EVENT_TYPES } from "@/lib/track";
export type { TrackEventType };
