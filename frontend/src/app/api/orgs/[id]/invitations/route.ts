// /api/orgs/[id]/invitations
//
// POST -- create a new invitation. Both `owner` and `advisor` roles can
//        issue invitations. The token is delivered in the response so
//        the client can render a copy-pasteable share link; in a future
//        Resend-backed mailer this same token goes into the email body.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import { membershipRole } from "@/lib/orgs";
import { issueInvitation, type InvitationRole } from "@/lib/invitations";
import { getMailer } from "@/lib/mailer";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

interface InviteBody {
  email?: string;
  role?: InvitationRole;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    throw e;
  }

  const orgId = ctx.params.id;
  if (!orgId || orgId.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const email = asString(body.email, 200);
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, code: "INVALID_EMAIL", message: "valid email is required" }, { status: 400 });
  }
  const role: InvitationRole = body.role === "student" ? "student" : "advisor";

  try {
    const role2 = await membershipRole(orgId, user.id);
    if (!role2) {
      return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
    }
    const issued = await issueInvitation({
      orgId,
      email,
      role,
      invitedByUserId: user.id,
    });
    const url = new URL(req.url);
    const acceptUrl = `${url.origin}/invite/${encodeURIComponent(issued.token)}`;
    // Best-effort mail. A failure here does not fail the request --
    // the share link is in the response so the inviter can paste it
    // into a chat if email delivery is broken.
    try {
      await getMailer().send({
        to: email,
        subject: "PathOS 团队邀请",
        text:
          `${user.email} 邀请你加入 PathOS 团队。\n\n点击接受邀请:\n${acceptUrl}\n\n` +
          `链接 14 天内有效,只能使用一次。`,
      });
    } catch (e) {
      console.error("[invitations] mailer send failed:", e);
    }
    return NextResponse.json(
      {
        ok: true,
        invitation: issued.invitation,
        shareUrl: acceptUrl,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[invitations] create failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
