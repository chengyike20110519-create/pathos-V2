// POST /api/reports/[id]/rotate
//
// Issues a new share token and bumps version by 1. The caller MUST
// supply the current token (header `X-Report-Token` or `?token=`);
// without it we cannot tell a real owner from a random visitor.
//
// Response:
//   { ok, id, version, token, shareUrl, expiresAt }
// The raw token is returned exactly once here. The DB only stores its
// hash, so it cannot be recovered from a backup or a query log.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { extractReportToken } from "@/lib/report-access";
import { rotateReportToken } from "@/lib/reports";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
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

function shareUrl(req: Request, id: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
    ?? new URL(req.url).origin;
  return `${base}/reports/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
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

  try {
    const rotated = await rotateReportToken({ reportId: id, currentToken: token });
    if (!rotated) return unauthorized();
    const response = NextResponse.json({
      ok: true,
      id: rotated.id,
      version: rotated.version,
      // Returned once. Stored as hash only.
      token: rotated.token,
      shareUrl: shareUrl(req, rotated.id, rotated.token),
      expiresAt: rotated.expiresAt.toISOString(),
    });
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[reports/rotate] error:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
