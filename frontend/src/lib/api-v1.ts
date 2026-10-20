// Shared helpers for /api/v1/*. Provides:
//   - API key authentication via Authorization: Bearer <secret>
//   - minute-window rate limit (DB-backed, optional in-memory fast path)
//   - CORS headers so the API can be consumed by other frontends
//   - standard JSON envelope { ok, data, error }
//
// We deliberately do NOT introduce a JWT / OAuth dependency for v1;
// SHA-256 hashed static keys are sufficient until a real customer
// portal ships.

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import { consumeRateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export interface ApiKeyRow {
  id: string;
  owner_label: string;
  key_hash: string;
  scopes: string;
  rate_limit: number;
  monthly_quota: number;
  calls_this_month: number;
  quota_reset_at: Date | string;
  status: string;
}

export interface AuthSuccess {
  ok: true;
  key: ApiKeyRow;
}

export interface AuthFailure {
  ok: false;
  response: NextResponse;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Allowed browser origins for the data API. Keys are secrets, so a
// wildcard ACAO would invite customers to embed them in front-end code.
// Server-to-server callers are unaffected by CORS.
function allowedOrigins(): string[] {
  const raw = process.env.PATHOS_API_ALLOWED_ORIGINS ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function applyCors(response: NextResponse, req?: Request): NextResponse {
  const origin = req?.headers.get("origin");
  const allowed = allowedOrigins();
  if (origin && allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Api-Key");
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
}

export function ok<T>(data: T, init: ResponseInit = {}, req?: Request): NextResponse {
  const response = applyCors(
    NextResponse.json({ ok: true, data }, { status: 200, ...init }),
    req,
  );
  // Responses are keyed to a private API key; never store them in a
  // shared cache.
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

export function fail(
  code: string,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>,
  req?: Request,
): NextResponse {
  const response = applyCors(
    NextResponse.json({ ok: false, error: { code, message } }, { status }),
    req,
  );
  for (const [k, v] of Object.entries(extraHeaders ?? {})) {
    response.headers.set(k, v);
  }
  return response;
}

export async function handleOptions(req: Request): Promise<NextResponse> {
  return applyCors(new NextResponse(null, { status: 204 }), req);
}

function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header) {
    const trimmed = header.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      const secret = trimmed.slice(7).trim();
      if (secret) return secret;
    }
  }
  // X-API-Key is a friendlier alternative for simple HTTP clients.
  const alt = req.headers.get("x-api-key");
  return alt && alt.trim() ? alt.trim() : null;
}

export async function authenticate(req: Request): Promise<AuthSuccess | AuthFailure> {
  const secret = extractBearer(req);
  if (!secret) {
    return { ok: false, response: fail("MISSING_API_KEY", "Provide Authorization: Bearer <key> or X-Api-Key header.", 401) };
  }
  if (secret.length < 16 || secret.length > 256) {
    return { ok: false, response: fail("INVALID_API_KEY", "API key has unexpected length.", 401) };
  }
  const hash = sha256(secret);
  try {
    const r = await getPool().query<ApiKeyRow>(
      `SELECT id, owner_label, key_hash, scopes, rate_limit, monthly_quota,
              calls_this_month, quota_reset_at, status
       FROM api_keys WHERE key_hash = $1 LIMIT 1`,
      [hash],
    );
    const row = r.rows[0];
    if (!row) {
      return { ok: false, response: fail("INVALID_API_KEY", "API key is not recognized.", 401) };
    }
    if (row.status !== "active") {
      return { ok: false, response: fail("API_KEY_REVOKED", "API key has been revoked.", 403) };
    }
    // Lazy monthly reset: if the previous reset window has passed,
    // zero the counter and slide the window forward before we test it.
    const resetAt = row.quota_reset_at instanceof Date
      ? row.quota_reset_at
      : new Date(row.quota_reset_at);
    if (Number.isFinite(resetAt.getTime()) && resetAt.getTime() <= Date.now()) {
      try {
        await getPool().query(
          `UPDATE api_keys
             SET calls_this_month = 0,
                 quota_reset_at = date_trunc('month', NOW()) + INTERVAL '1 month'
           WHERE id = $1`,
          [row.id],
        );
        row.calls_this_month = 0;
      } catch (e) {
        console.error("[v1] quota reset error:", e);
      }
    }
    if (row.calls_this_month >= row.monthly_quota) {
      return {
        ok: false,
        response: fail("QUOTA_EXHAUSTED", "Monthly quota exhausted.", 429, undefined, req),
      };
    }
    return { ok: true, key: row };
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return { ok: false, response: fail(e.code, e.message, e.status) };
    }
    console.error("[v1] auth error:", e);
    return { ok: false, response: fail("DB_UNREACHABLE", e instanceof Error ? e.message : String(e), 503) };
  }
}

// Per-key minute-window rate limit. Delegates to the shared limiter,
// which fails closed when the counter store is unreachable.
export async function checkRateLimit(keyId: string, perMinute: number) {
  return consumeRateLimit("apikey", keyId, perMinute);
}

export { retryAfterSeconds };

// Increment the persistent monthly counter. Fire-and-forget — never
// throw to the caller.
export async function bumpMonthlyUsage(keyId: string): Promise<void> {
  try {
    await getPool().query(
      `UPDATE api_keys
         SET calls_this_month = calls_this_month + 1,
             last_used_at = NOW()
       WHERE id = $1`,
      [keyId],
    );
  } catch (e) {
    console.error("[v1] bump usage error:", e);
  }
}

// Helper to enforce a scope. Returns null on success, or a NextResponse
// on failure.
export function requireScope(key: ApiKeyRow, scope: string): NextResponse | null {
  const scopes = key.scopes.split(",").map((s) => s.trim());
  if (!scopes.includes(scope) && !scopes.includes("*")) {
    return fail("INSUFFICIENT_SCOPE", `API key is missing required scope: ${scope}`, 403);
  }
  return null;
}
