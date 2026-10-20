import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { isFactEntityType } from "@/domain/information/fact";
import { aggregateSchoolProfile } from "@/server/information/aggregate-school";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = (url.searchParams.get("entityId") ?? "").trim();
  const academicYear = (url.searchParams.get("academicYear") ?? "").trim();

  if (entityType !== "university") {
    return NextResponse.json(
      { ok: false, code: "UNSUPPORTED_ENTITY_TYPE", message: "当前仅支持 university 实体。" },
      { status: 400 },
    );
  }
  if (!isFactEntityType(entityType) || !entityId || entityId.length > 160) {
    return NextResponse.json(
      { ok: false, code: "INVALID_ENTITY", message: "entityId 必填且长度不能超过 160。" },
      { status: 400 },
    );
  }

  try {
    const profile = await aggregateSchoolProfile(entityId, academicYear || undefined);
    return NextResponse.json(
      { ok: true, profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    const missingTable = message.includes("facts") && message.includes("does not exist");
    console.error("[information/facts] aggregate failed:", e);
    return NextResponse.json(
      {
        ok: false,
        code: missingTable ? "INFORMATION_SCHEMA_NOT_READY" : "FACT_AGGREGATION_FAILED",
        message: missingTable
          ? "信息平台迁移尚未执行，已审核事实层暂不可用。"
          : message,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
