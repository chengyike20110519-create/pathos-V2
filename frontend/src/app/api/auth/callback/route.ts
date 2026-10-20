// GET /api/auth/callback?token=...&next=...
//
// This is the URL the user lands on after clicking the email link.
// Three steps run in order:
//   1. Validate the token shape and consume it (single-use, atomic).
//      consumeMagicLink also upserts the user row, so the first-ever
//      sign-in for an address materializes a `free` account here.
//   2. Create a cookie session backed by a random id; the database
//      stores only the SHA-256.
//   3. 302 to the `?next=` target when it is a same-origin path the
//      caller is allowed to land on, otherwise /s/home. The error
//      path always goes to /login?error=....
//
// We deliberately do not use a server action here: clicking a link in
// mail has to work with cookies disabled / from a different device,
// and a 302 is the only portable way to land the user on a logged-in
// page.
import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { consumeMagicLink } from "@/lib/auth-magic-link";
import { hashIp } from "@/lib/report-access";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = Number(process.env.PATHOS_SESSION_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000;

function fail(req: Request, code: string): NextResponse {
  const dest = new URL("/login", new URL(req.url).origin);
  dest.searchParams.set("error", code);
  return NextResponse.redirect(dest, { status: 302 });
}

// Only allow same-origin paths the auth callback is allowed to land
// on. Anything else (absolute URLs, javascript:,//evil.example/x)
// would let an attacker turn a magic-link email into an open redirect.
const ALLOWED_NEXT_PREFIXES = ["/", "/s/", "/workbench/", "/invite/", "/account/", "/login"];

function safeNext(raw: string | null, origin: string): string | null {
  if (!raw) return null;
  // Reject anything that does not start with a slash -- those would be
  // absolute URLs that could escape the site.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Reject protocol-relative and embedded credentials.
  if (raw.includes("\n") || raw.includes("\r")) return null;
  try {
    const probe = new URL(raw, origin);
    if (probe.origin !== origin) return null;
  } catch {
    return null;
  }
  if (ALLOWED_NEXT_PREFIXES.some((p) => raw === p || raw.startsWith(p))) return raw;
  return null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  // 32-byte base64url tokens are 43 chars. Anything else is junk and we
  // bail before touching the DB.
  if (!token || token.length < 40 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return fail(req, "invalid");
  }

  let user: { userId: string; email: string; displayName: string | null; tier: "free" | "pro" | "studio"; isNewUser: boolean };
  try {
    const result = await consumeMagicLink(token);
    if (!result) return fail(req, "invalid");
    user = result;
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return fail(req, "unavailable");
    }
    console.error("[auth] consume failed:", e);
    return fail(req, "invalid");
  }

  let sid: string;
  let expiresAt: Date;
  try {
    const sess = await createSession({
      userId: user.userId,
      ipHash: hashIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    sid = sess.id;
    expiresAt = sess.expiresAt;
  } catch (e) {
    console.error("[auth] session create failed:", e);
    return fail(req, "invalid");
  }

  const isHttps = url.protocol === "https:";
  const cookieValue = [
    `${SESSION_COOKIE}=${sid}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) cookieValue.push("Secure");

  // /s/home already exists in the old PathOS and acts as the data
  // workbench. We append `welcome=new` for first-time sign-ins so the
  // page can surface a "you`re in" toast without a separate route.
  // When the caller supplied a same-origin `?next=` (e.g. an invite
  // acceptance URL that requires auth first), we honor it instead --
  // this is the seam Phase 1.2 uses to land the user on
  // /invite/<token> after magic-link sign-in.
  const dest = new URL(safeNext(url.searchParams.get("next"), url.origin) ?? "/s/home", url.origin);
  dest.searchParams.set("welcome", user.isNewUser ? "new" : "back");
  const response = NextResponse.redirect(dest, { status: 302 });
  response.headers.append("Set-Cookie", cookieValue.join("; "));
  return response;
}
