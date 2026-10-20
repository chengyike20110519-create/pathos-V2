// POST /api/reports/[id]/revoke
//
// Revokes the current share token. The caller MUST supply the current
// token (header `X-Report-Token` or `?token=`); without it we cannot
// tell a real owner from a random visitor.
//
// This is a richer counterpart to DELETE /api/reports/[id]. DELETE
// remains in place for backwards compatibility; new clients should
// prefer this POST because it returns version + revoked_at.
//
// Response:
//   { ok, id, version, revokedAt }

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { extractReportToken, logReportAccess } from "@/lib/report-access";
import { revokeReportVersion } from "@/lib/reports";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

interface RevokeBody {
  expectedVersion?: number;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "UNAUTHORIZED",
      message: "报告链接无效、已过期或已被撤销。请使用生成报告时获得的完整分享链接。",
    },
    { status: 401 },
  );
}

export async function POST(
  req: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const id = (params.id ?? "").trim();
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }
  const token = extractReportToken(req);
  if (!token || token.length < 16 || token.length > 256) return unauthorized();

  let body: RevokeBody = {};
  try {
    // Body is optional; an empty / missing body is allowed.
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as RevokeBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }

  const expectedVersion = asNumber(body.expectedVersion);

  try {
    const revoked = await revokeReportVersion({
      reportId: id,
      currentToken: token,
      expectedVersion,
    });
    if (!revoked) {
      void logReportAccess(id, "revoked", req);
      return unauthorized();
    }
    void logReportAccess(id, "revoked", req);
    const response = NextResponse.json({
      ok: true,
      id: revoked.id,
      version: revoked.version,
      revokedAt: revoked.revokedAt.toISOString(),
    });
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[reports/revoke] error:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
