// POST /api/auth/magic-link
//
// Body: { email: string }
//
// Behaviour:
//   - Validates the address shape. Anything that does not parse as an
//     email returns 400.
//   - Rate-limits per IP (5/min) so a burst of probes cannot be used to
//     enumerate which addresses are members. The limit is the same
//     magnitude as the rate limit used by the public report share
//     endpoint, which faces the same probe risk.
//   - Persists a single-use token via issueMagicLink and emails it
//     through the configured mailer. The mailer abstraction defaults
//     to the console sink in dev so missing SMTP never blocks sign-in.
//   - Always returns 200 to the client. We do not leak whether the
//     email was previously registered, and we do not surface mailer
//     errors as 5xx (the user could not have done anything about them
//     anyway).
//
// A real Resend / SMTP transport is plugged in later in Phase 1.4; the
// shape of this route will not change.
import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { consumeRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { hashIp } from "@/lib/report-access";
import { issueMagicLink } from "@/lib/auth-magic-link";
import { getMailer } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const email = typeof body === "object" && body && (body as { email?: unknown }).email;
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.length > 200) {
    return NextResponse.json(
      { ok: false, code: "INVALID_EMAIL", message: "valid email is required" },
      { status: 400 },
    );
  }
  const normalized = email.trim().toLowerCase();

  // Per-IP rate limit, fail-closed so a flood of probes cannot reach
  // the mailer. 5/min matches the share-link budget.
  const rl = await consumeRateLimit("auth:magic-link", hashIp(req) ?? "anon", 5);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", retryAfter: retryAfterSeconds(rl.resetsAt) },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetsAt)) } },
    );
  }

  let token: string;
  let expiresAt: Date;
  try {
    const issued = await issueMagicLink({
      email: normalized,
      ipHash: hashIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    token = issued.token;
    expiresAt = issued.expiresAt;
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[auth] issue magic-link failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE" },
      { status: 503 },
    );
  }

  const origin = new URL(req.url).origin;
  const link = `${origin}/api/auth/callback?token=${encodeURIComponent(token)}`;
  try {
    await getMailer().send({
      to: normalized,
      subject: "Your PathOS sign-in link",
      text:
        `Click this link to sign in to PathOS (expires ${expiresAt.toISOString()}):\n\n${link}\n\n` +
        `If you did not request this, you can ignore the message.`,
    });
  } catch (e) {
    console.error("[auth] mailer send failed:", e);
    // Continue -- the link was issued; we still return 200 so the
    // caller cannot infer mailer health from this endpoint.
  }

  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
}
