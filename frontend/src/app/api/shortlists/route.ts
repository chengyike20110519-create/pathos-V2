// /api/shortlists
//
// POST -- create a new shortlist owned by the caller.
// GET  -- list every shortlist owned by the caller.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  createShortlist,
  listShortlistsForUser,
} from "@/lib/shortlists";

export const dynamic = "force-dynamic";

interface CreateBody {
  name?: string;
  season?: string;
  notes?: string;
}

function asString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(req: Request): Promise<NextResponse> {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    throw e;
  }
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const name = asString(body.name, 80);
  if (!name) {
    return NextResponse.json({ ok: false, code: "MISSING_NAME", message: "name is required" }, { status: 400 });
  }
  const season = asString(body.season, 32) ?? null;
  const notes = asString(body.notes, 500) ?? null;
  try {
    const list = await createShortlist({
      ownerUserId: user.id,
      name,
      season,
      notes,
    });
    return NextResponse.json({ ok: true, shortlist: list }, { status: 201 });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[shortlists] create failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    throw e;
  }
  try {
    const lists = await listShortlistsForUser(user.id);
    return NextResponse.json({ ok: true, shortlists: lists });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[shortlists] list failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
