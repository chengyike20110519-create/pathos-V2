import { NextResponse } from "next/server";

import { DatabaseNotConfiguredError } from "@/server/db";
import {
  SEARCH_TARGET_MS,
  globalSearch,
  normalizeSearchQuery,
} from "@/server/information/search-service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function invalid(code: string, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, code, message },
    { status: 400, headers: NO_STORE },
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const query = normalizeSearchQuery(url.searchParams.get("q") ?? "");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw == null ? 8 : Number(limitRaw);

  if (query.length < 2) {
    return invalid("INVALID_SEARCH_QUERY", "The search query must contain at least 2 characters.");
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
    return invalid("INVALID_SEARCH_LIMIT", "Each result group must contain 1 to 20 items.");
  }

  try {
    const result = await globalSearch(query, limit);
    return NextResponse.json(
      { ok: true, ...result },
      {
        headers: {
          ...NO_STORE,
          "Server-Timing": `global-search;dur=${result.stats.durationMs}`,
          "X-PathOS-Search-Target-Ms": String(SEARCH_TARGET_MS),
        },
      },
    );
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.status, headers: NO_STORE },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    if ((error as NodeJS.ErrnoException).code === "ERR_INVALID_URL") {
      return NextResponse.json(
        {
          ok: false,
          code: "DATABASE_NOT_CONFIGURED",
          message: "DATABASE_URL 不是有效的 Postgres 连接串，信息层搜索暂不可用。",
        },
        { status: 503, headers: NO_STORE },
      );
    }
    const missingTable = [
      "universities",
      "facts",
      "information_events",
      "search_queries",
      "search_query_runs",
    ].some((table) => message.includes(table) && message.includes("does not exist"));
    console.error("[information/search] global search failed:", error);
    return NextResponse.json(
      {
        ok: false,
        code: missingTable ? "INFORMATION_SCHEMA_NOT_READY" : "GLOBAL_SEARCH_FAILED",
        message: missingTable
          ? "信息平台搜索迁移尚未执行，已审核事实与信息事件暂不可用。"
          : "全局搜索暂不可用。",
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
