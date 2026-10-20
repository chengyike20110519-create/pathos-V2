// Access control for /reports/[id]. Reports contain student grades,
// background, and target schools, so the share link is the only thing
// standing between that data and the open internet.
//
// Design:
//   - The token is 32 random bytes, independent of the report id, so a
//     report id (which appears in logs, URLs, and support tickets) can
//     never be used to read a report.
//   - Only the SHA-256 hash is stored. A database dump does not yield
//     working share links.
//   - Tokens expire (default 30 days) and can be revoked.
//   - Every read attempt is written to report_access_log.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getPool } from "@/server/db";

export const REPORT_TOKEN_TTL_DAYS = Number(
  process.env.PATHOS_REPORT_TOKEN_TTL_DAYS ?? 30,
);

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateReportToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

const SHA256_HEX = /^[0-9a-f]{64}$/i;

// Constant-time compare of two SHA-256 hex digests.
//
// Both operands must be well-formed 64-char hex. Without that check,
// Buffer.from(x, "hex") silently yields an empty buffer for non-hex
// input, and two such values would compare equal.
export function hashesMatch(a: string, b: string): boolean {
  if (!SHA256_HEX.test(a) || !SHA256_HEX.test(b)) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export type AccessOutcome =
  | "granted"
  | "missing_token"
  | "bad_token"
  | "expired"
  | "revoked"
  | "not_found";

// Hash the client IP so the audit trail is useful for abuse triage
// without storing raw addresses.
export function hashIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.PATHOS_IP_HASH_SALT ?? "pathos";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function logReportAccess(
  reportId: string,
  outcome: AccessOutcome,
  req: Request,
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO report_access_log (report_id, outcome, ip_hash, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [
        reportId.slice(0, 64),
        outcome,
        hashIp(req),
        (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
      ],
    );
  } catch (e) {
    // Auditing must never break the request path.
    console.error("[report-access] audit write failed:", e);
  }
}

export function extractReportToken(req: Request): string | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery && fromQuery.trim()) return fromQuery.trim();
  const header = req.headers.get("x-report-token");
  if (header && header.trim()) return header.trim();
  return null;
}
