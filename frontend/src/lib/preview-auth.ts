// Fixture-only authentication for local UI previews.
//
// Production keeps the DB-backed magic-link flow unchanged. This cookie only
// works when PATHOS_DATA_MODE=fixture in a non-production runtime.

export const PREVIEW_AUTH_COOKIE = "pathos.preview_session";

export interface PreviewAuthEnv {
  NODE_ENV?: string | undefined;
  PATHOS_DATA_MODE?: string | undefined;
}

export const PREVIEW_AUTH_USER = {
  id: "preview-user",
  email: "preview@pathos.local",
  displayName: "本地预览用户",
  tier: "free",
} as const;

export function isPreviewAuthEnabled(env: PreviewAuthEnv = process.env): boolean {
  return env.PATHOS_DATA_MODE === "fixture" && env.NODE_ENV !== "production";
}

export function safePreviewDestination(raw: string | null): string {
  if (!raw) return "/s/home";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/s/home";
  if (raw === "/login" || raw.startsWith("/api/")) return "/s/home";
  return raw;
}
