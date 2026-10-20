import { NextResponse } from "next/server";
import {
  PREVIEW_AUTH_COOKIE,
  PREVIEW_AUTH_USER,
  isPreviewAuthEnabled,
  safePreviewDestination,
} from "@/lib/preview-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const origin = new URL(req.url);
  if (!isPreviewAuthEnabled()) {
    return NextResponse.redirect(new URL("/login?error=unavailable", origin), 302);
  }

  const next = safePreviewDestination(origin.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, origin), 302);
  response.cookies.set({
    name: PREVIEW_AUTH_COOKIE,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
    secure: origin.protocol === "https:",
  });
  return response;
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: true, enabled: isPreviewAuthEnabled(), user: PREVIEW_AUTH_USER },
    { headers: { "Cache-Control": "no-store" } },
  );
}
