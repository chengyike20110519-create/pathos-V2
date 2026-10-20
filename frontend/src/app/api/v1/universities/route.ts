// GET /api/v1/universities
// Returns a paginated, lightly trimmed list of universities for
// programmatic consumers (机会 A). Authenticated via API key.
//
// Query params:
//   ?state=CA            Filter to one US state.
//   ?tier=top20|top50|top100|other   Filter by ranking tier.
//   ?limit=50             1..200, default 50.
//   ?cursor=<id>          Cursor (next page). Returns rows with id > cursor.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import {
  authenticate, bumpMonthlyUsage, checkRateLimit, requireScope,
  handleOptions, ok, fail, retryAfterSeconds,
} from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export { handleOptions as OPTIONS };

interface UniversityListRow {
  id: string;
  name: string;
  chinese_name: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  school_type: string | null;
  ranking_band: string | null;
  ranking_tier: string | null;
  national_ranking: number | null;
  latitude: number | null;
  longitude: number | null;
  preview_only: boolean;
  updated_at: Date | string;
}

function asInt(value: string | null, min: number, max: number, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function asString(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const VALID_TIERS = new Set(["top20", "top50", "top100", "other"]);

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const scopeErr = requireScope(auth.key, "universities.read");
  if (scopeErr) return scopeErr;

  const rl = await checkRateLimit(auth.key.id, auth.key.rate_limit);
  if (!rl.allowed) {
    return fail(
      rl.degraded ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED",
      rl.degraded
        ? "Rate limit store is unavailable; requests are temporarily rejected."
        : "Too many requests. Try again in a minute.",
      rl.degraded ? 503 : 429,
      { "Retry-After": String(retryAfterSeconds(rl.resetsAt)) },
      req,
    );
  }

  const url = new URL(req.url);
  const state = asString(url.searchParams.get("state"));
  const tier = asString(url.searchParams.get("tier"));
  const cursor = asString(url.searchParams.get("cursor"));
  const limit = asInt(url.searchParams.get("limit"), 1, 200, 50);

  if (tier && !VALID_TIERS.has(tier)) {
    return fail("INVALID_TIER", "tier must be one of top20 | top50 | top100 | other", 400, undefined, req);
  }

  const params: unknown[] = [];
  const conditions: string[] = [];
  if (state) { params.push(state.toUpperCase()); conditions.push(`state = $${params.length}`); }
  if (tier)  { params.push(tier);                   conditions.push(`ranking_tier = $${params.length}`); }
  if (cursor) { params.push(cursor);                conditions.push(`id > $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit + 1);

  try {
    const r = await getPool().query<UniversityListRow>(
      `SELECT id, name, chinese_name, city, state, region, school_type,
              ranking_band, ranking_tier, national_ranking, latitude, longitude,
              preview_only, updated_at
       FROM universities
       ${where}
       ORDER BY id ASC
       LIMIT $${params.length}`,
      params,
    );
    const rows = r.rows;
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id : null;

    void bumpMonthlyUsage(auth.key.id);

    return ok({
      universities: trimmed.map((row) => ({
        id: row.id,
        name: row.name,
        chineseName: row.chinese_name,
        city: row.city,
        state: row.state,
        region: row.region,
        schoolType: row.school_type,
        rankingBand: row.ranking_band,
        rankingTier: row.ranking_tier,
        nationalRanking: row.national_ranking,
        latitude: row.latitude,
        longitude: row.longitude,
        previewOnly: row.preview_only,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      })),
      pagination: {
        limit,
        nextCursor,
        hasMore,
      },
      rateLimit: { remaining: rl.remaining, perMinute: auth.key.rate_limit, resetsAt: rl.resetsAt },
      quota: {
        used: auth.key.calls_this_month,
        limit: auth.key.monthly_quota,
        resetsAt: auth.key.quota_reset_at instanceof Date
          ? auth.key.quota_reset_at.toISOString()
          : String(auth.key.quota_reset_at),
      },
    }, {}, req);
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return fail(e.code, e.message, e.status, undefined, req);
    }
    console.error("[v1/universities] error:", e);
    return fail("DB_UNREACHABLE", e instanceof Error ? e.message : String(e), 503, undefined, req);
  }
}
