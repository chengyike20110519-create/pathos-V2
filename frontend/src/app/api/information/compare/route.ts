import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { normalizeAcademicYear } from "@/domain/information/normalize";
import {
  aggregateComparisonFacts,
  parseComparisonIds,
} from "@/server/information/aggregate-compare";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const ids = parseComparisonIds(url.searchParams.get("ids") ?? "");
  const academicYear = (url.searchParams.get("academicYear") ?? "").trim();

  if (ids.length < 2 || ids.length > 4) {
    return NextResponse.json(
      { ok: false, code: "INVALID_COMPARISON_SIZE", message: "ids 必须包含 2 到 4 所学校。" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (ids.some(id => !id || id.length > 160)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_ENTITY_ID", message: "entityId 长度不能超过 160。" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (academicYear) {
    try {
      normalizeAcademicYear(academicYear);
    } catch {
      return NextResponse.json(
        { ok: false, code: "INVALID_ACADEMIC_YEAR", message: "academicYear 必须是有效入学年份。" },
        { status: 400, headers: NO_STORE },
      );
    }
  }

  try {
    const result = await aggregateComparisonFacts(
      ids,
      academicYear ? normalizeAcademicYear(academicYear) : undefined,
    );
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status, headers: NO_STORE },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    const missingTable = message.includes("facts") && message.includes("does not exist");
    console.error("[information/compare] aggregate failed:", e);
    return NextResponse.json(
      {
        ok: false,
        code: missingTable ? "INFORMATION_SCHEMA_NOT_READY" : "COMPARISON_FACTS_UNAVAILABLE",
        message: missingTable
          ? "信息平台迁移尚未执行，approved facts 对比暂不可用。"
          : "approved facts 对比层暂不可用。",
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
