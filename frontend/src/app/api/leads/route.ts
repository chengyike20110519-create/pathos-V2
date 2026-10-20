// Generic lead capture endpoint used by /pricing, the footer "联系顾问"
// form, and the home-page CTA. Persists a row into subscription_leads
// with plan=lead_intake and source=the page that fired the form.
//
// The endpoint is intentionally permissive: 503 if the DB is down
// (we never want to lie about success), otherwise 200 with the lead
// id so the client can show a confirmation.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";

export const dynamic = "force-dynamic";

interface LeadPayload {
  contactName?: string;
  phone?: string;
  wechat?: string;
  email?: string;
  company?: string;
  notes?: string;
  source?: string;
  plan?: string;
  meta?: Record<string, unknown>;
}

function asString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function newId(): string {
  // Tiny URL-safe id: timestamp + 6 char base36 random.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `lead_${t}_${r}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: LeadPayload;
  try {
    const raw = (await req.json()) as unknown;
    body = raw && typeof raw === "object" ? (raw as LeadPayload) : {};
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }

  const phone = asString(body.phone, 32);
  const wechat = asString(body.wechat, 64);
  const email = asString(body.email, 200);
  const contactName = asString(body.contactName, 80);
  const company = asString(body.company, 160);
  const notes = asString(body.notes, 1000);
  const source = asString(body.source, 64) ?? "unknown";
  const plan = asString(body.plan, 32) ?? "lead_intake";
  const meta = asObject(body.meta);

  if (!phone && !wechat && !email) {
    return NextResponse.json(
      { ok: false, code: "MISSING_CONTACT", message: "phone, wechat, or email is required" },
      { status: 400 },
    );
  }

  const id = newId();
  try {
    await getPool().query(
      `INSERT INTO subscription_leads
        (id, plan, contact_name, phone, wechat, email, company, notes, source, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        id, plan, contactName ?? null, phone ?? null, wechat ?? null,
        email ?? null, company ?? null, notes ?? null, source,
        JSON.stringify(meta),
      ],
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    console.error("[leads] insert failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, id, plan }, { status: 200 });
}