// GET /api/admin/leads
//
// Operator-facing list of subscription_leads. Supports:
//   ?status=new|contacted|qualified|converted|lost|closed
//   ?plan=lead_intake|single_report|advisor_annual
//   ?limit=50 (max 200)
//   ?cursor=<ISO created_at of last row from previous page>
//
// Auth: caller must be a member of at least one organization.
// Returns { ok, leads, nextCursor }.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { ForbiddenError, requireAdvisor } from "@/lib/admin-auth";
import { isLeadPlan, isLeadStatus, listLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
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

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const planRaw = url.searchParams.get("plan");
  const cursorRaw = url.searchParams.get("cursor");
  const limitRaw = Number(url.searchParams.get("limit"));

  const status = statusRaw ? (isLeadStatus(statusRaw) ? statusRaw : null) : undefined;
  const plan = planRaw ? (isLeadPlan(planRaw) ? planRaw : null) : undefined;
  if ((statusRaw && !status) || (planRaw && !plan)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_FILTER", message: "unknown status or plan" },
      { status: 400 },
    );
  }

  try {
    const result = await listLeads({
      status: status ?? undefined,
      plan: plan ?? undefined,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      cursor: cursorRaw ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[admin/leads] list failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}

