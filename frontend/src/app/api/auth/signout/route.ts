// POST /api/auth/signout
//
// Revokes the current session and clears the cookie. Idempotent: a
// call without a cookie is still 200 so the client does not have to
// branch on auth state to render a Sign Out button.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, revokeSession } from "@/lib/session";
import { PREVIEW_AUTH_COOKIE } from "@/lib/preview-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) {
    try {
      await revokeSession(sid);
    } catch (e) {
      // The cookie still gets cleared even if the DB call fails,
      // because the client should not loop on signout.
      console.error("[auth] revoke session failed:", e);
    }
  }

  const isHttps = new URL(req.url).protocol === "https:";
  const cookieValue = [
    `${SESSION_COOKIE}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `Max-Age=0`,
  ];
  if (isHttps) cookieValue.push("Secure");

  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", cookieValue.join("; "));
  response.headers.append(
    "Set-Cookie",
    [
      `${PREVIEW_AUTH_COOKIE}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0",
    ].join("; "),
  );
  return response;
}
