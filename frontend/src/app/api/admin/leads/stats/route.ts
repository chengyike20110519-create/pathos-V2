// GET /api/admin/leads/stats
//
// Operator dashboard counters. Auth: caller must belong to an org as
// owner or advisor. Returns { ok, total, byStatus, byPlan }.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { ForbiddenError, requireAdvisor } from "@/lib/admin-auth";
import { getLeadStats } from "@/lib/leads";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdvisor();
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }

  try {
    const stats = await getLeadStats();
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[admin/leads/stats] failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
