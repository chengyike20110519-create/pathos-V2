// GET /api/reports/[id]
// Returns the stored report payload. Used by /reports/[id] page and
// by clients that want to poll until status=ready.
//
// Access requires the random share token issued once at generation
// time (?token=... or X-Report-Token). The report id alone is NOT
// sufficient: ids show up in logs and support threads, and these
// reports carry student grades and target schools.
//
// DELETE /api/reports/[id] revokes the share link.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import {
  extractReportToken,
  hashToken,
  hashesMatch,
  logReportAccess,
} from "@/lib/report-access";

export const dynamic = "force-dynamic";

interface ReportRow {
  id: string;
  plan: string;
  profile: unknown;
  schools: unknown;
  payload: unknown;
  status: string;
  error: string | null;
  access_token_hash: string | null;
  token_expires_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function unauthorized(): NextResponse {
  // Deliberately identical for "wrong token" and "no such report" so the
  // endpoint cannot be used to enumerate which report ids exist.
  return NextResponse.json(
    {
      ok: false,
      code: "UNAUTHORIZED",
      message: "报告链接无效、已过期或已被撤销。请使用生成报告时获得的完整分享链接。",
    },
    { status: 401 },
  );
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const id = (params.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  if (id.length > 64) return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });

  const token = extractReportToken(req);
  if (!token || token.length < 16 || token.length > 256) {
    void logReportAccess(id, "missing_token", req);
    return unauthorized();
  }

  try {
    const r = await getPool().query<ReportRow>(
      `SELECT id, plan, profile, schools, payload, status, error,
              access_token_hash, token_expires_at, revoked_at,
              created_at, updated_at
       FROM reports WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = r.rows[0];
    if (!row) {
      void logReportAccess(id, "not_found", req);
      return unauthorized();
    }

    if (!row.access_token_hash || !hashesMatch(row.access_token_hash, hashToken(token))) {
      void logReportAccess(id, "bad_token", req);
      return unauthorized();
    }
    if (row.revoked_at) {
      void logReportAccess(id, "revoked", req);
      return unauthorized();
    }
    const expiresAt = toDate(row.token_expires_at);
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      void logReportAccess(id, "expired", req);
      return unauthorized();
    }

    void logReportAccess(id, "granted", req);

    const response = NextResponse.json({
      ok: true,
      report: {
        id: row.id,
        plan: row.plan,
        status: row.status,
        error: row.error,
        profile: row.profile,
        schools: row.schools,
        payload: row.payload,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      },
    });
    // Never let a proxy or CDN cache a report body.
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[reports/:id] error:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}

// Revoke a share link. Requires the same token, so only the holder of
// the link can burn it.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const id = (params.id ?? "").trim();
  if (!id || id.length > 64) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }
  const token = extractReportToken(req);
  if (!token || token.length < 16 || token.length > 256) return unauthorized();

  try {
    const r = await getPool().query<{ id: string }>(
      `UPDATE reports
          SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = $1
          AND access_token_hash = $2
          AND revoked_at IS NULL
        RETURNING id`,
      [id, hashToken(token)],
    );
    if (r.rows.length === 0) return unauthorized();
    void logReportAccess(id, "revoked", req);
    return NextResponse.json({ ok: true, id, revoked: true });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error("[reports/:id] revoke error:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
