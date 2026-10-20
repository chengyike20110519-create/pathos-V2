// /api/shortlists/[id]
//
// GET -- fetch one shortlist + the items grouped by bucket so the
//        workbench can render three columns in a single round trip.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  getShortlist,
  getShortlistGrouped,
} from "@/lib/shortlists";

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
  const shortlistId = ctx.params.id;
  if (!shortlistId || shortlistId.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }
  try {
    const list = await getShortlist(shortlistId);
    if (!list) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    if (list.ownerUserId !== user.id) {
      // Same 404 trick we use on /api/orgs: do not leak existence.
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    const groups = await getShortlistGrouped(shortlistId);
    return NextResponse.json({ ok: true, shortlist: list, groups });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[shortlists/:id] get failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
