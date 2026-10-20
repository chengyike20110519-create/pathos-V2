// Shared minute-window rate limiter backed by the rate_limit_buckets
// table. Used by /api/v1/* (per API key) and by public endpoints such
// as /api/reports/generate (per IP).
//
// Failure policy is fail-CLOSED: if the counter store is unreachable we
// reject rather than wave traffic through. An endpoint that spends money
// (DeepSeek calls) must not become unmetered because Postgres blipped.
// Callers that prefer availability over protection can opt in via
// `failOpen`.

import { createHash } from "node:crypto";
import { getPool } from "@/server/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetsAt: string;
  degraded: boolean;
}

function currentWindow(now = new Date()): { key: string; resetsAt: Date } {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
  ].join("");
  const resetsAt = new Date(now);
  resetsAt.setUTCSeconds(0, 0);
  resetsAt.setUTCMinutes(resetsAt.getUTCMinutes() + 1);
  return { key: stamp, resetsAt };
}

export function clientKey(req: Request, salt = "rl"): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function consumeRateLimit(
  scope: string,
  identity: string,
  perMinute: number,
  options: { failOpen?: boolean } = {},
): Promise<RateLimitResult> {
  const { key: window, resetsAt } = currentWindow();
  const bucketKey = `${scope}:${identity}:${window}`;

  try {
    const result = await getPool().query<{ hits: number }>(
      `INSERT INTO rate_limit_buckets (bucket_key, hits, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (bucket_key) DO UPDATE
         SET hits = rate_limit_buckets.hits + 1
       RETURNING hits`,
      [bucketKey],
    );
    const hits = result.rows[0]?.hits ?? perMinute + 1;
    // Opportunistic GC: ~2% of calls sweep buckets older than an hour so
    // the table does not grow without bound.
    if (Math.random() < 0.02) void sweepBuckets();
    return {
      allowed: hits <= perMinute,
      remaining: Math.max(0, perMinute - hits),
      limit: perMinute,
      resetsAt: resetsAt.toISOString(),
      degraded: false,
    };
  } catch (e) {
    console.error(`[rate-limit] store unavailable for ${scope}:`, e);
    return {
      allowed: options.failOpen === true,
      remaining: 0,
      limit: perMinute,
      resetsAt: resetsAt.toISOString(),
      degraded: true,
    };
  }
}

export async function sweepBuckets(): Promise<void> {
  try {
    await getPool().query(
      "DELETE FROM rate_limit_buckets WHERE window_start < NOW() - INTERVAL '1 hour'",
    );
  } catch (e) {
    console.error("[rate-limit] sweep failed:", e);
  }
}

export function retryAfterSeconds(resetsAt: string): number {
  const ms = new Date(resetsAt).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 1000));
}
