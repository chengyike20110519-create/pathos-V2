import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { normalizeAcademicYear } from "@/domain/information/normalize";
import {
  aggregateApplicationDeadlines,
  aggregateShortlistDeadlines,
  type CalendarEntityType,
} from "@/server/information/aggregate-deadline";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ENTITY_TYPES: readonly CalendarEntityType[] = ["university", "program", "scholarship"];

function invalidRequest(
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { ok: false, code, message },
    { status: 400, headers: NO_STORE },
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const entityTypeRaw = url.searchParams.get("entityType");
  const entityId = (url.searchParams.get("entityId") ?? "").trim();
  const academicYear = (url.searchParams.get("academicYear") ?? "").trim();
  const shortlistId = (url.searchParams.get("shortlistId") ?? "").trim();

  if (entityTypeRaw != null && !ENTITY_TYPES.includes(entityTypeRaw as CalendarEntityType)) {
    return invalidRequest(
      "UNSUPPORTED_ENTITY_TYPE",
      "申请日历仅支持 university、program、scholarship。",
    );
  }
  if (shortlistId && entityTypeRaw != null) {
    return invalidRequest(
      "SHORTLIST_FILTER_CONFLICT",
      "shortlistId 不能与 entityType 同时使用。",
    );
  }
  if (shortlistId && entityId) {
    return invalidRequest(
      "SHORTLIST_FILTER_CONFLICT",
      "shortlistId 不能与 entityId 同时使用。",
    );
  }
  if (shortlistId.length > 64) {
    return invalidRequest("INVALID_SHORTLIST_ID", "shortlistId 长度不能超过 64。");
  }
  if (entityId && entityId.length > 160) {
    return invalidRequest("INVALID_ENTITY_ID", "entityId 长度不能超过 160。");
  }
  if (academicYear) {
    try {
      normalizeAcademicYear(academicYear);
    } catch {
      return invalidRequest("INVALID_ACADEMIC_YEAR", "academicYear 必须是有效入学年份。");
    }
  }

  try {
    let calendar;
    if (shortlistId) {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json(
          { ok: false, code: "UNAUTHENTICATED", message: "登录后才能查看个人清单日历。" },
          { status: 401, headers: NO_STORE },
        );
      }
      calendar = await aggregateShortlistDeadlines({
        shortlistId,
        userId: user.id,
        academicYear: academicYear || undefined,
      });
      if (calendar == null) {
        return NextResponse.json(
          { ok: false, code: "SHORTLIST_NOT_FOUND", message: "选校清单不存在或无权访问。" },
          { status: 404, headers: NO_STORE },
        );
      }
    } else {
      calendar = await aggregateApplicationDeadlines({
        entityType: entityTypeRaw == null
          ? undefined
          : entityTypeRaw as CalendarEntityType,
        entityId: entityId || undefined,
        academicYear: academicYear || undefined,
      });
    }
    return NextResponse.json(
      { ok: true, ...calendar },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status, headers: NO_STORE },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    const missingTable = message.includes("facts") && message.includes("does not exist");
    console.error("[information/deadlines] aggregate failed:", e);
    return NextResponse.json(
      {
        ok: false,
        code: missingTable ? "INFORMATION_SCHEMA_NOT_READY" : "DEADLINE_AGGREGATION_FAILED",
        message: missingTable
          ? "信息平台迁移尚未执行，申请日历暂不可用。"
          : "申请截止日事实层暂不可用。",
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
