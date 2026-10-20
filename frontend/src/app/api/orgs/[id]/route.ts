// /api/orgs/[id]
//
// GET -- return the org detail, current role, member list, and pending
//        invitations. Caller must be a member of the org.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  getOrganization,
  membershipRole,
  listOrgMembers,
} from "@/lib/orgs";
import { listInvitationsForOrg } from "@/lib/invitations";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
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

  try {
    const org = await getOrganization(orgId);
    if (!org) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    const role = await membershipRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
    }
    const [members, invitations] = await Promise.all([
      listOrgMembers(orgId),
      listInvitationsForOrg(orgId),
    ]);
    return NextResponse.json({ ok: true, organization: org, role, members, invitations });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[orgs/:id] get failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
