// /api/shortlists/[id]/items
//
// POST -- add a university to the shortlist in a specific bucket.
//        404 if the caller does not own the list, 409 if the
//        (shortlist, university) pair already exists.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  addShortlistItem,
  asBucket,
  getShortlist,
  touchShortlist,
  DuplicateItemError,
  UnknownUniversityError,
} from "@/lib/shortlists";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

interface AddItemBody {
  universityId?: string;
  bucket?: string;
  notes?: string;
}

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
  const shortlistId = ctx.params.id;
  if (!shortlistId || shortlistId.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }
  let body: AddItemBody;
  try {
    body = (await req.json()) as AddItemBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const universityId = asString(body.universityId, 64);
  if (!universityId) {
    return NextResponse.json({ ok: false, code: "MISSING_UNIVERSITY", message: "universityId is required" }, { status: 400 });
  }
  const bucket = asBucket(body.bucket);
  if (!bucket) {
    return NextResponse.json({ ok: false, code: "INVALID_BUCKET", message: "bucket must be reach|match|safety" }, { status: 400 });
  }
  const notes = asString(body.notes, 500) ?? null;

  try {
    const list = await getShortlist(shortlistId);
    if (!list || list.ownerUserId !== user.id) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    const item = await addShortlistItem({ shortlistId, universityId, bucket, notes });
    await touchShortlist(shortlistId).catch(() => {});
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateItemError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    if (e instanceof UnknownUniversityError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[shortlists/:id/items] create failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
