// /api/orgs/[id]/invitations/[invId]
//
// DELETE -- revoke a still-pending invitation. Already-accepted rows
//           are not deleteable so the audit trail stays intact.
// Caller must be a member of the org; both owner and advisor can
// revoke.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import { membershipRole } from "@/lib/orgs";
import { revokeInvitation } from "@/lib/invitations";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string; invId: string };
}

export async function DELETE(_req: Request, ctx: RouteContext): Promise<NextResponse> {
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
  const invId = ctx.params.invId;
  if (!orgId || !invId || orgId.length > 64 || invId.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }

  try {
    const role = await membershipRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
    }
    await revokeInvitation(invId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[invitations] revoke failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
