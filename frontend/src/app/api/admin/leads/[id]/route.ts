// PATCH /api/admin/leads/[id]
//
// Update a lead's status and/or notes. Auth: caller must belong to at
// least one organization as owner or advisor (same gate as GET).
// Returns { ok, lead }.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { ForbiddenError, requireAdvisor } from "@/lib/admin-auth";
import { isLeadStatus, updateLead } from "@/lib/leads";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

interface PatchBody {
  status?: string;
  notes?: string | null;
}

function asStringOrNull(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : (value === "" ? "" : trimmed);
}

export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
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

  const id = (ctx.params.id ?? "").trim();
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }

  const statusRaw = body.status;
  const notesRaw = body.notes;

  if (statusRaw === undefined && notesRaw === undefined) {
    return NextResponse.json(
      { ok: false, code: "NO_FIELDS", message: "status or notes is required" },
      { status: 400 },
    );
  }

  let status: string | undefined;
  if (statusRaw !== undefined) {
    if (!isLeadStatus(statusRaw)) {
      return NextResponse.json(
        { ok: false, code: "INVALID_STATUS", message: "unknown status value" },
        { status: 400 },
      );
    }
    status = statusRaw;
  }

  let notes: string | null | undefined;
  if (notesRaw !== undefined) {
    const trimmed = asStringOrNull(notesRaw, 2000);
    if (trimmed === undefined) {
      return NextResponse.json(
        { ok: false, code: "INVALID_NOTES", message: "notes must be a string or null" },
        { status: 400 },
      );
    }
    notes = trimmed === "" ? null : trimmed;
  }

  try {
    const lead = await updateLead(id, {
      status: status as never,
      notes,
    });
    if (!lead) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[admin/leads/:id] patch failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
