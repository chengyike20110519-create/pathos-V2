// /api/shortlists/[id]/items/[itemId]
//
// PATCH   -- move an item to a different bucket (reach/match/safety).
// DELETE  -- remove the item from the shortlist.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  asBucket,
  changeShortlistItemBucket,
  getShortlist,
  removeShortlistItem,
  touchShortlist,
} from "@/lib/shortlists";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string; itemId: string };
}

interface PatchBody {
  bucket?: string;
}

export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
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
  const itemId = ctx.params.itemId;
  if (!shortlistId || !itemId || shortlistId.length > 64 || itemId.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const bucket = asBucket(body.bucket);
  if (!bucket) {
    return NextResponse.json({ ok: false, code: "INVALID_BUCKET" }, { status: 400 });
  }
  try {
    const list = await getShortlist(shortlistId);
    if (!list || list.ownerUserId !== user.id) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    await changeShortlistItemBucket({ itemId, shortlistId, bucket });
    await touchShortlist(shortlistId).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[shortlists/:id/items/:itemId] patch failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
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
  const shortlistId = ctx.params.id;
  const itemId = ctx.params.itemId;
  if (!shortlistId || !itemId || shortlistId.length > 64 || itemId.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }
  try {
    const list = await getShortlist(shortlistId);
    if (!list || list.ownerUserId !== user.id) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    await removeShortlistItem({ itemId, shortlistId });
    await touchShortlist(shortlistId).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[shortlists/:id/items/:itemId] delete failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
