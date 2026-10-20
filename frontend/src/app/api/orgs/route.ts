// /api/orgs
//
// POST  -- create a new organization. The caller is automatically
//         inserted as the first owner.
// GET   -- list the organizations the caller is a member of.
//
// Both routes require a valid session and surface
// DatabaseNotConfiguredError so the client can show a useful 503.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { requireUser } from "@/lib/session";
import {
  createOrganization,
  listOrganizationsForUser,
} from "@/lib/orgs";

export const dynamic = "force-dynamic";

interface CreateOrgBody {
  name?: string;
  plan?: "team" | "agency" | "studio";
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

  let body: CreateOrgBody;
  try {
    body = (await req.json()) as CreateOrgBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }
  const name = asString(body.name, 80);
  if (!name) {
    return NextResponse.json({ ok: false, code: "MISSING_NAME", message: "name is required" }, { status: 400 });
  }
  const plan = body.plan === "agency" || body.plan === "studio" ? body.plan : "team";

  try {
    const org = await createOrganization({ name, plan, createdByUserId: user.id });
    return NextResponse.json({ ok: true, organization: org }, { status: 201 });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[orgs] create failed:", e);
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
    const orgs = await listOrganizationsForUser(user.id);
    return NextResponse.json({ ok: true, organizations: orgs });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[orgs] list failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
