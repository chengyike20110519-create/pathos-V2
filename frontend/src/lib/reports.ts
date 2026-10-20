// Versioned report share tokens (Phase 1.4).
//
// Why version, not just hash + revoked_at:
//   - When a school counselor forwards a link to a parent by mistake,
//     the user has no way to recover. Rotating the token invalidates
//     the leaked one but keeps the report readable for the new
//     recipient.
//   - version monotonically increases on every rotation / revoke, so
//     an audit query can group access_log entries by the version they
//     were aimed at without re-hashing every token in history.
//   - We deliberately do NOT keep a per-version history table; old
//     hashes are gone after a rotation. report_access_log captures the
//     outcome of every read attempt, so the audit trail survives the
//     hash being overwritten.
//
// All functions require an explicit caller token via verifyReportToken,
// matching the auth shape used by /api/reports/[id] DELETE.

import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import {
  REPORT_TOKEN_TTL_DAYS,
  generateReportToken,
  hashToken,
  hashesMatch,
} from "@/lib/report-access";

export interface ReportVersionInfo {
  id: string;
  version: number;
  tokenHash: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  updatedAt: Date;
}

export interface RotatedToken {
  id: string;
  version: number;
  token: string;
  hash: string;
  expiresAt: Date;
}

export interface RevokedVersion {
  id: string;
  version: number;
  revokedAt: Date;
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Returns null when the row exists but the supplied token does not match
// the current version. Throws on DB failure. The hash compare is
// constant-time.
export async function verifyReportToken(
  reportId: string,
  token: string,
): Promise<ReportVersionInfo | null> {
  const r = await getPool().query<{
    id: string;
    version: number;
    access_token_hash: string | null;
    token_expires_at: Date | string | null;
    revoked_at: Date | string | null;
    updated_at: Date | string;
  }>(
    `SELECT id, version, access_token_hash, token_expires_at, revoked_at, updated_at
       FROM reports WHERE id = $1 LIMIT 1`,
    [reportId],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (!row.access_token_hash) return null;
  if (!hashesMatch(row.access_token_hash, hashToken(token))) return null;
  return {
    id: row.id,
    version: row.version,
    tokenHash: row.access_token_hash,
    expiresAt: toDate(row.token_expires_at),
    revokedAt: toDate(row.revoked_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

// Read-only: returns the current version metadata without rotating.
export async function getReportVersionInfo(reportId: string): Promise<ReportVersionInfo | null> {
  const r = await getPool().query<{
    id: string;
    version: number;
    access_token_hash: string | null;
    token_expires_at: Date | string | null;
    revoked_at: Date | string | null;
    updated_at: Date | string;
  }>(
    `SELECT id, version, access_token_hash, token_expires_at, revoked_at, updated_at
       FROM reports WHERE id = $1 LIMIT 1`,
    [reportId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    tokenHash: row.access_token_hash,
    expiresAt: toDate(row.token_expires_at),
    revokedAt: toDate(row.revoked_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

// Rotates the token for the report. The caller MUST present the
// current token; without that, we have no way to confirm the caller
// owns the share link. Returns the new token exactly once, plus the
// version number it belongs to.
export async function rotateReportToken(args: {
  reportId: string;
  currentToken: string;
}): Promise<RotatedToken | null> {
  const info = await verifyReportToken(args.reportId, args.currentToken);
  if (!info) return null;
  if (info.revokedAt) return null;

  const { token, hash } = generateReportToken();
  const expiresAt = new Date(Date.now() + REPORT_TOKEN_TTL_DAYS * 86_400_000);

  const r = await getPool().query<{
    id: string;
    version: number;
    token_expires_at: Date | string;
  }>(
    `UPDATE reports
        SET access_token_hash = $2,
            token_expires_at = $3,
            version = version + 1,
            updated_at = NOW()
      WHERE id = $1
        AND access_token_hash = $4
        AND revoked_at IS NULL
      RETURNING id, version, token_expires_at`,
    [args.reportId, hash, expiresAt.toISOString(), info.tokenHash],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    token,
    hash,
    expiresAt: row.token_expires_at instanceof Date ? row.token_expires_at : new Date(row.token_expires_at),
  };
}

// Revokes the share link. The current token is required. If
// expectedVersion is supplied, we additionally require the row to be
// at that version, which prevents a race where two rotates happen in
// flight and revoke cancels the wrong one.
export async function revokeReportVersion(args: {
  reportId: string;
  currentToken: string;
  expectedVersion?: number;
}): Promise<RevokedVersion | null> {
  const info = await verifyReportToken(args.reportId, args.currentToken);
  if (!info) return null;
  if (info.revokedAt) return null;
  if (args.expectedVersion !== undefined && info.version !== args.expectedVersion) {
    return null;
  }

  const r = await getPool().query<{
    id: string;
    version: number;
    revoked_at: Date | string;
  }>(
    `UPDATE reports
        SET revoked_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND version = $2
        AND access_token_hash = $3
        AND revoked_at IS NULL
      RETURNING id, version, revoked_at`,
    [args.reportId, info.version, info.tokenHash],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    revokedAt: row.revoked_at instanceof Date ? row.revoked_at : new Date(row.revoked_at),
  };
}

export { DatabaseNotConfiguredError };
