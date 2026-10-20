// /api/invitations/[token]
//
// GET  -- public lookup: returns the invitation view (org name,
//        role, expiry) for a token. The raw token never leaves the
//        URL; we hash it server-side and only the matching row
//        becomes readable.
// POST -- accept the invitation. Caller must be logged in. The
//        atomic UPDATE in consumeInvitation is what enforces
//        single-use + email match + not-expired; if any check
//        fails we return null and the route responds with the
//        generic error code INVALID so we do not leak which one.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  getInvitationViewByToken,
  consumeInvitation,
  invitationRoleToMembershipRole,
} from "@/lib/invitations";
import { addMembership } from "@/lib/orgs";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { token: string };
}

const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

function isValidToken(token: string): boolean {
  // 32-byte base64url tokens are 43 chars; we accept 32..64 so future
  // formats can land without a code change.
  return token.length >= 32 && token.length <= 64 && TOKEN_RE.test(token);
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const token = ctx.params.token ?? "";
  if (!isValidToken(token)) {
    return NextResponse.json({ ok: false, code: "INVALID_TOKEN" }, { status: 400 });
  }
  try {
    const view = await getInvitationViewByToken(token);
    if (!view) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    // Public view: expose only what a landing page needs. The token
    // and the inviting user id are deliberately omitted so a link
    // preview cannot impersonate the inviter or replay the token.
    return NextResponse.json({
      ok: true,
      invitation: {
        orgId: view.orgId,
        orgName: view.orgName,
        orgSlug: view.orgSlug,
        role: view.role,
        expiresAt: view.expiresAt,
        acceptedAt: view.acceptedAt,
        expired: new Date(view.expiresAt).getTime() <= Date.now(),
      },
    });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[invitations/:token] get failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
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
  const token = ctx.params.token ?? "";
  if (!isValidToken(token)) {
    return NextResponse.json({ ok: false, code: "INVALID_TOKEN" }, { status: 400 });
  }
  try {
    const claimed = await consumeInvitation({
      token,
      userId: user.id,
      userEmail: user.email,
    });
    if (!claimed) {
      // We do not distinguish missing vs already-used vs wrong-email
      // in the response code; the only way to learn which is to
      // attempt a fresh accept, and we never want the route to act
      // as an enumeration oracle.
      return NextResponse.json(
        { ok: false, code: "INVALID", message: "邀请已失效或邮箱不匹配" },
        { status: 409 },
      );
    }
    const membershipRole = invitationRoleToMembershipRole(claimed.role);
    if (membershipRole) {
      // Advisor invitations promote the user to an org member. The
      // upsert on (org_id, user_id) makes the operation idempotent
      // if the user was somehow already a member.
      await addMembership({ orgId: claimed.orgId, userId: user.id, role: membershipRole });
    }
    // Student invitations intentionally skip addMembership -- the
    // accepted_user_id on the invitation row is enough for Phase
    // 1.4 to authorize /api/reports/[id] on shared report links.
    return NextResponse.json(
      {
        ok: true,
        org: { id: claimed.orgId, name: claimed.orgName, slug: claimed.orgSlug },
        role: claimed.role,
        membershipRole,
      },
      { status: 200 },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[invitations/:token] accept failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
