// Subscription intake endpoint. Used by /pricing when a user picks
// advisor_annual, single_report, or data_api. Writes a row to
// subscription_leads so the human advisor can reach out within 24h.
//
// We do NOT charge anything here. Payment is handled offline (微信 /
// 银行转账) for v1; once Stripe / 微信支付 is wired the route will
// gate on a successful payment intent before flipping status.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";

export const dynamic = "force-dynamic";

const VALID_PLANS = new Set(["advisor_annual", "single_report", "data_api"]);

interface SubscriptionPayload {
  plan?: string;
  contactName?: string;
  phone?: string;
  wechat?: string;
  email?: string;
  company?: string;
  notes?: string;
  source?: string;
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
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `sub_${t}_${r}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: SubscriptionPayload;
  try {
    const raw = (await req.json()) as unknown;
    body = raw && typeof raw === "object" ? (raw as SubscriptionPayload) : {};
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }

  const plan = asString(body.plan, 32);
  if (!plan || !VALID_PLANS.has(plan)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_PLAN", message: "plan must be advisor_annual | single_report | data_api" },
      { status: 400 },
    );
  }

  const phone = asString(body.phone, 32);
  const wechat = asString(body.wechat, 64);
  const email = asString(body.email, 200);
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
        (id, plan, contact_name, phone, wechat, email, company, notes, source, status, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10::jsonb)`,
      [
        id, plan,
        asString(body.contactName, 80) ?? null,
        phone ?? null, wechat ?? null, email ?? null,
        asString(body.company, 160) ?? null,
        asString(body.notes, 1000) ?? null,
        asString(body.source, 64) ?? "pricing",
        JSON.stringify(asObject(body.meta)),
      ],
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    console.error("[subscriptions] insert failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, id, plan }, { status: 200 });
}