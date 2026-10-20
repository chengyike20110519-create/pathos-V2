// GET /api/admin/information/coverage
//
// Internal data-quality dashboard payload. Coverage is an operating view, not
// public data, so it uses the same advisor/owner gate as the review queue.

import { NextResponse } from "next/server";
import { ForbiddenError, requireAdvisor } from "@/lib/admin-auth";
import { DatabaseNotConfiguredError } from "@/server/db";
import { buildInformationCoverageReport } from "@/server/information/coverage-service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdvisor();
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, code: "UNAUTHENTICATED" },
        { status: 401, headers: NO_STORE },
      );
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status, headers: NO_STORE },
      );
    }
    console.error("[admin/information/coverage] auth failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503, headers: NO_STORE },
    );
  }

  try {
    const report = await buildInformationCoverageReport();
    return NextResponse.json(
      { ok: true, report },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status, headers: NO_STORE },
      );
    }
    console.error("[admin/information/coverage] load failed:", e);
    return NextResponse.json(
      {
        ok: false,
        code: "INFORMATION_COVERAGE_UNAVAILABLE",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
