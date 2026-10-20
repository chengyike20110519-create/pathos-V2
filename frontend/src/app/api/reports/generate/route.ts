// POST /api/reports/generate
// Body: { profile: StudentProfile, schools: UniversityRef[],
//         leadId?: string, plan?: 'single_report' | 'advisor_annual' }
// Response: { id, status, shareUrl, token, expiresAt }
//
// Internally fans out to /api/ai/analyze so we never duplicate the
// scoring logic. Persists the result into the reports table so it
// can be re-shown via /reports/[id] without paying for a new LLM call.
//
// This endpoint spends money (DeepSeek) and stores personal data, so it
// is rate limited per IP, capped per day, and accepts an idempotency key
// so a retried submit does not bill twice. The share token is returned
// exactly once here; we only keep its hash.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import {
  clientKey,
  consumeRateLimit,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import {
  REPORT_TOKEN_TTL_DAYS,
  generateReportToken,
} from "@/lib/report-access";
import {
  buildReportInformationSnapshot,
  mergeReportPayloadWithInformation,
  type ReportInformationSnapshot,
} from "@/server/information/report-integration";

export const dynamic = "force-dynamic";

// Per-IP caps. Generous enough for a family trying a few variations,
// tight enough that the endpoint cannot be farmed.
const REPORTS_PER_MINUTE = Number(process.env.PATHOS_REPORTS_PER_MINUTE ?? 3);
const REPORTS_PER_DAY = Number(process.env.PATHOS_REPORTS_PER_DAY ?? 10);
const MAX_SCHOOLS = 10;

interface GenerateRequest {
  profile?: Record<string, unknown>;
  schools?: Array<{ id?: string; name?: string; chineseName?: string }>;
  leadId?: string;
  plan?: string;
  notes?: string;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

function newId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `rpt_${t}_${r}`;
}

const VALID_PLANS = new Set(["single_report", "advisor_annual"]);

function shareUrl(req: Request, id: string, token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;
  return `${base}/reports/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const profile = asObject(body.profile);
  const schools = asArray<Record<string, unknown>>(body.schools).map((s) => ({
    id: asString(s.id),
    name: asString(s.name),
    chineseName: asString(s.chineseName),
  }));
  const requestedPlan = asString(body.plan, 32) ?? "single_report";
  const plan = VALID_PLANS.has(requestedPlan) ? requestedPlan : "single_report";
  const notes = asString(body.notes, 1000);
  const leadId = asString(body.leadId, 64);
  const idempotencyKey = asString(
    req.headers.get("idempotency-key") ?? undefined,
    128,
  );

  if (schools.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_SCHOOLS",
        message: "At least one school is required.",
      },
      { status: 400 },
    );
  }
  if (schools.length > MAX_SCHOOLS) {
    return NextResponse.json(
      {
        ok: false,
        code: "TOO_MANY_SCHOOLS",
        message: `At most ${MAX_SCHOOLS} schools per report.`,
      },
      { status: 400 },
    );
  }
  if (!profile || Object.keys(profile).length === 0) {
    return NextResponse.json(
      { ok: false, code: "MISSING_PROFILE", message: "Profile is required." },
      { status: 400 },
    );
  }

  // Rate limit before touching the DB or the LLM.
  const identity = clientKey(req, "reports");
  const perMinute = await consumeRateLimit(
    "reports:min",
    identity,
    REPORTS_PER_MINUTE,
  );
  if (!perMinute.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: perMinute.degraded ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED",
        message: perMinute.degraded
          ? "系统繁忙，请稍后重试。"
          : "请求过于频繁，请稍后再试。",
      },
      {
        status: perMinute.degraded ? 503 : 429,
        headers: {
          "Retry-After": String(retryAfterSeconds(perMinute.resetsAt)),
        },
      },
    );
  }
  const perDay = await consumeRateLimit(
    "reports:day",
    `${identity}:${new Date().toISOString().slice(0, 10)}`,
    REPORTS_PER_DAY,
  );
  if (!perDay.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: perDay.degraded
          ? "RATE_LIMIT_UNAVAILABLE"
          : "DAILY_QUOTA_EXCEEDED",
        message: perDay.degraded
          ? "系统繁忙，请稍后重试。"
          : `每日免费生成上限为 ${REPORTS_PER_DAY} 份。如需更多，请联系顾问。`,
      },
      { status: perDay.degraded ? 503 : 429 },
    );
  }

  // Idempotency: a retried submit returns the original report instead of
  // paying for a second LLM call. The token is not recoverable, so we
  // tell the caller to reuse the link they already have.
  if (idempotencyKey) {
    try {
      const existing = await getPool().query<{ id: string; status: string }>(
        "SELECT id, status FROM reports WHERE idempotency_key = $1 LIMIT 1",
        [idempotencyKey],
      );
      const row = existing.rows[0];
      if (row) {
        return NextResponse.json(
          { ok: true, id: row.id, status: row.status, reused: true },
          { status: 200 },
        );
      }
    } catch (e) {
      if (e instanceof DatabaseNotConfiguredError) {
        return NextResponse.json(
          { ok: false, code: e.code, message: e.message },
          { status: e.status },
        );
      }
      console.error("[reports/generate] idempotency lookup failed:", e);
    }
  }

  const id = newId();
  const { token, hash } = generateReportToken();
  const expiresAt = new Date(Date.now() + REPORT_TOKEN_TTL_DAYS * 86_400_000);
  let informationSnapshot: ReportInformationSnapshot;

  // The report must cite the facts that existed when it was created. Persist
  // this immutable snapshot before the AI call so a later fact revision can
  // never rewrite an already-shared report.
  try {
    informationSnapshot = await buildReportInformationSnapshot({ schools });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[reports/generate] information snapshot failed:", e);
    return NextResponse.json(
      {
        ok: false,
        code:
          message.includes("facts") && message.includes("does not exist")
            ? "INFORMATION_SCHEMA_NOT_READY"
            : "INFORMATION_LAYER_UNAVAILABLE",
        message: "已审核事实层暂不可用，报告不能在没有数据来源的情况下生成。",
      },
      { status: 503 },
    );
  }

  // Persist the report row immediately (status=pending) so we never
  // lose the request if the upstream AI call later throws. lead_id is
  // only set when it refers to a real lead, so the FK cannot reject the
  // insert on a stale client value.
  try {
    await getPool().query(
      `INSERT INTO reports
         (id, lead_id, plan, profile, schools, status, payload,
          access_token_hash, token_expires_at, idempotency_key)
       VALUES ($1,
               (SELECT l.id FROM subscription_leads l WHERE l.id = $2),
               $3, $4::jsonb, $5::jsonb, 'pending', $6::jsonb, $7, $8, $9)`,
      [
        id,
        leadId ?? null,
        plan,
        JSON.stringify(profile),
        JSON.stringify(schools),
        JSON.stringify({ information: informationSnapshot }),
        hash,
        expiresAt.toISOString(),
        idempotencyKey ?? null,
      ],
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    console.error("[reports/generate] insert failed:", e);
    return NextResponse.json(
      {
        ok: false,
        code: "DB_UNREACHABLE",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }

  // Fan out to /api/ai/analyze using the same-origin URL. We pass
  // 'school_assessment' as the mode; this reuses the deterministic
  // scoring + DeepSeek layer without duplicating any logic.
  let aiResult: unknown = null;
  let aiError: string | null = null;
  try {
    const origin = new URL(req.url).origin;
    // The LLM path can hang; cap it so the request cannot pin a worker.
    const timeout = AbortSignal.timeout(
      Number(process.env.PATHOS_REPORT_AI_TIMEOUT_MS ?? 60_000),
    );
    const aiResp = await fetch(`${origin}/api/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: timeout,
      body: JSON.stringify({
        mode: "school_assessment",
        profile,
        schools,
        information: informationSnapshot,
        notes,
      }),
    });
    if (aiResp.ok) {
      aiResult = await aiResp.json();
    } else {
      const text = await aiResp.text().catch(() => "");
      aiError = `AI returned ${aiResp.status}: ${text.slice(0, 200)}`;
    }
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e);
  }

  const status = aiResult ? "ready" : "failed";
  const error = aiError;

  try {
    await getPool().query(
      `UPDATE reports
         SET status = $2, payload = $3::jsonb, error = $4, updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        status,
        JSON.stringify(
          mergeReportPayloadWithInformation(aiResult, informationSnapshot),
        ),
        error,
      ],
    );
  } catch (e) {
    console.error("[reports/generate] update failed:", e);
    // We still return what we have -- the row exists in the DB; the
    // client can re-read it after we recover from the transient error.
  }

  const response = NextResponse.json(
    {
      ok: aiResult != null,
      id,
      status,
      error,
      // Returned once. We store only the hash, so this cannot be re-issued.
      token,
      shareUrl: shareUrl(req, id, token),
      expiresAt: expiresAt.toISOString(),
    },
    { status: aiResult ? 200 : 502 },
  );
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
