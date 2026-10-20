// POST /api/track
//
// Minimal client-side event ingestion. The client sends a single
// `type` + optional `path` + optional `meta`; the server records the
// row with a salted IP hash and (when present) the authenticated
// user id. The endpoint is intentionally chatty-tolerant but rate-
// limited per IP so a bug cannot fill the database.
//
// We deliberately do NOT 4xx on the client when the body is invalid;
// every track call returns 204 to keep the tracking path fire-and-
// forget. Real errors are returned as 5xx so they surface in logs.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { clientKey, consumeRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import {
  clampString,
  hashIpForTrack,
  isTrackEventType,
  recordTrackEvent,
} from "@/lib/track";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Per-IP caps. Generous for normal page-load events, tight enough
// that a bug or scraper cannot drive the table to millions of rows.
const TRACKS_PER_MINUTE = Number(process.env.PATHOS_TRACK_PER_MINUTE ?? 120);
const TRACKS_PER_DAY = Number(process.env.PATHOS_TRACK_PER_DAY ?? 5_000);

interface TrackBody {
  type?: unknown;
  path?: unknown;
  meta?: unknown;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumberOrUndef(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}

export async function POST(req: Request): Promise<NextResponse> {
  // Parse leniently. A botched track call must never block UX.
  let body: TrackBody = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as TrackBody;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const typeRaw = clampString(body.type, 64);
  if (!typeRaw || !isTrackEventType(typeRaw)) {
    return new NextResponse(null, { status: 204 });
  }
  const path = clampString(body.path, 256) ?? null;
  const meta = asObject(body.meta);

  // Rate-limit before touching the DB.
  const identity = clientKey(req, "track");
  const perMin = await consumeRateLimit("track:min", identity, TRACKS_PER_MINUTE);
  if (!perMin.allowed) {
    if (perMin.degraded) {
      // Soft-fail on degraded limiter: tracking must never break UX.
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", message: "事件频率超限,请稍后再试。" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(perMin.resetsAt)) },
      },
    );
  }
  const perDay = await consumeRateLimit(
    "track:day",
    `${identity}:${new Date().toISOString().slice(0, 10)}`,
    TRACKS_PER_DAY,
  );
  if (!perDay.allowed) {
    if (perDay.degraded) return new NextResponse(null, { status: 204 });
    return NextResponse.json(
      {
        ok: false,
        code: "DAILY_QUOTA_EXCEEDED",
        message: `每日事件上限 ${TRACKS_PER_DAY} 次。`,
      },
      { status: 429 },
    );
  }

  const user = await getCurrentUser().catch(() => null);
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;
  const ipHash = hashIpForTrack(req);

  try {
    const id = await recordTrackEvent({
      type: typeRaw,
      path,
      meta,
      userId: user?.id ?? null,
      ipHash,
      userAgent,
    });
    if (!id) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ ok: true, id: id.id }, { status: 202 });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      // Tracking must never block the request path.
      return new NextResponse(null, { status: 204 });
    }
    console.error("[track] insert failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}

// We accept GET for legacy compatibility with `new Image().src` pings
// where the body method is GET and a query string carries the event.
// It still 204s on success.
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const typeRaw = clampString(url.searchParams.get("type"), 64);
  if (!typeRaw || !isTrackEventType(typeRaw)) {
    return new NextResponse(null, { status: 204 });
  }
  const path = clampString(url.searchParams.get("path"), 256) ?? null;
  const meta: Record<string, unknown> = {};
  const tag = url.searchParams.get("tag");
  if (tag) meta.tag = tag;
  const id = url.searchParams.get("id");
  if (id) meta.id = id;
  const value = asNumberOrUndef(Number(url.searchParams.get("value") ?? ""));
  if (value !== undefined) meta.value = value;

  const ipHash = hashIpForTrack(req);
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300) || null;
  try {
    await recordTrackEvent({
      type: typeRaw,
      path,
      meta,
      userId: null,
      ipHash,
      userAgent,
    });
  } catch (e) {
    if (!(e instanceof DatabaseNotConfiguredError)) {
      console.error("[track/GET] insert failed:", e);
    }
  }
  return new NextResponse(null, { status: 204 });
}
