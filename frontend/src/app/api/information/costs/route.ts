import { NextResponse } from "next/server";
import { isCostItemType, type CostScenarioRates } from "@/domain/information/cost";
import { DatabaseNotConfiguredError } from "@/server/db";
import {
  aggregateUniversityCost,
  type CostCenterRequest,
  type CostUserAssumptionInput,
} from "@/server/information/aggregate-cost";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function failure(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code, message }, { status, headers: NO_STORE });
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function scenarioRates(raw: unknown, allowZero: boolean): CostScenarioRates | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const low = finiteNumber(record.low);
  const central = finiteNumber(record.central);
  const high = finiteNumber(record.high);
  if (low == null || central == null || high == null) return null;
  if (low < 0 || central < 0 || high < 0) return null;
  if ((!allowZero && (low === 0 || central === 0 || high === 0)) ||
      !(low <= central && central <= high)) return null;
  return { low, central, high };
}

function amount(source: Record<string, unknown>): number | { min: number; max: number } | null {
  const numeric = finiteNumber(source.amount);
  if (numeric != null && numeric >= 0) return numeric;
  if (!source.amountRange || typeof source.amountRange !== "object" || Array.isArray(source.amountRange)) {
    return null;
  }
  const range = source.amountRange as Record<string, unknown>;
  const min = finiteNumber(range.min);
  const max = finiteNumber(range.max);
  if (min == null || max == null || min < 0 || max < 0 || min > max) return null;
  return { min, max };
}

function userAssumptions(source: Record<string, unknown>): CostUserAssumptionInput[] | null {
  if (source.userAssumptions == null) return [];
  if (!Array.isArray(source.userAssumptions)) return null;
  const result: CostUserAssumptionInput[] = [];
  for (const entry of source.userAssumptions) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    const type = typeof record.type === "string" && isCostItemType(record.type) ? record.type : null;
    const itemAmount = amount(record);
    if (!type || itemAmount == null) return null;
    result.push({ type, amount: itemAmount });
  }
  return result;
}

function parseRequest(
  source: Record<string, unknown>,
): { ok: true; request: CostCenterRequest } | { ok: false; message: string } {
  const entityId = typeof source.entityId === "string" ? source.entityId.trim() : "";
  if (!entityId || entityId.length > 160) {
    return { ok: false, message: "entityId 必填且长度不能超过 160。" };
  }
  const yearCount = finiteNumber(source.yearCount);
  if (yearCount != null && (!Number.isInteger(yearCount) || yearCount < 1 || yearCount > 10)) {
    return { ok: false, message: "yearCount 必须是 1 到 10 的整数。" };
  }
  const inflation =
    source.inflationPercent == null ? undefined : scenarioRates(source.inflationPercent, true) ?? undefined;
  const exchange =
    source.exchangeRateCnyPerUsd == null
      ? undefined
      : scenarioRates(source.exchangeRateCnyPerUsd, false) ?? undefined;
  if (source.inflationPercent != null && !inflation) {
    return { ok: false, message: "inflationPercent 必须包含 low/central/high，且按顺序排列。" };
  }
  if (source.exchangeRateCnyPerUsd != null && !exchange) {
    return { ok: false, message: "exchangeRateCnyPerUsd 必须包含正数 low/central/high，且按顺序排列。" };
  }
  const assumptions = userAssumptions(source);
  if (!assumptions) return { ok: false, message: "userAssumptions 格式无效。" };
  const useDefault = source.useDefaultAssumptions === true || source.useDefaultAssumptions === "true";
  if (!inflation && !exchange && !useDefault) {
    return { ok: false, message: "必须显式输入通胀和汇率，或设置 useDefaultAssumptions=true。" };
  }
  if ((inflation || exchange) && (!inflation || !exchange)) {
    return { ok: false, message: "自定义通胀与汇率必须同时提供。" };
  }
  return {
    ok: true,
    request: {
      entityId,
      academicYear: typeof source.academicYear === "string" && source.academicYear.trim() ? source.academicYear : undefined,
      yearCount: yearCount ?? undefined,
      inflationPercent: inflation,
      exchangeRateCnyPerUsd: exchange,
      useDefaultAssumptions: useDefault,
      userAssumptions: assumptions,
    },
  };
}

async function respond(parsed: ReturnType<typeof parseRequest>): Promise<NextResponse> {
  if (!parsed.ok) return failure("INVALID_REQUEST", parsed.message, 400);
  try {
    const result = await aggregateUniversityCost(parsed.request);
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) return failure(e.code, e.message, e.status);
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("Invalid cost") || message.includes("invalid university id") ||
        message.includes("invalid user cost assumption type") || message.includes("INVALID_YEAR")) {
      return failure("INVALID_COST_REQUEST", message, 400);
    }
    console.error("[information/costs] aggregate failed:", e);
    const missingTable = message.includes("facts") && message.includes("does not exist");
    return failure(
      missingTable ? "INFORMATION_SCHEMA_NOT_READY" : "COST_AGGREGATION_UNAVAILABLE",
      missingTable
        ? "信息平台迁移尚未执行，成本事实层暂不可用。"
        : "成本事实层暂不可用。",
      503,
    );
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  return respond(parseRequest(Object.fromEntries(new URL(req.url).searchParams.entries())));
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failure("INVALID_JSON", "请求体必须是 JSON。", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return failure("INVALID_JSON", "请求体必须是 JSON 对象。", 400);
  }
  return respond(parseRequest(body as Record<string, unknown>));
}
