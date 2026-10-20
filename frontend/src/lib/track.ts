// Minimal event tracking (Phase 1.7).
//
// Why a thin wrapper around `pg.query`:
//   - The endpoint is fire-and-forget from the client; a slow insert
//     must not block the navigation that fired the event.
//   - We keep the schema minimal (type + path + meta + identity) so
//     every component can ship an event without coordinating a shared
//     taxonomy.
//   - Rate limiting lives at the route layer so a misuse can be tuned
//     without touching this file.
//
// What we deliberately do NOT track:
//   - raw element selectors or DOM snapshots (no replay surface),
//   - keystroke timing or scroll position,
//   - any field the user can type into a textbox.

import { createHash } from "node:crypto";
import { getPool } from "@/server/db";

export const TRACK_EVENT_TYPES = [
  "view",
  "click",
  "conversion",
  "share_open",
  "report_generated",
  "lead_captured",
] as const;
export type TrackEventType = (typeof TRACK_EVENT_TYPES)[number];

export function isTrackEventType(value: unknown): value is TrackEventType {
  return typeof value === "string" && (TRACK_EVENT_TYPES as readonly string[]).includes(value);
}

const MAX_TYPE_LEN = 32;
const MAX_PATH_LEN = 256;
const MAX_META_BYTES = 2048;

function clampString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

// Salting matches the convention used by report-access.hashIp so the
// audit trail uses one consistent prefix across features.
export function hashIpForTrack(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.PATHOS_IP_HASH_SALT ?? "pathos";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

interface RecordArgs {
  type: TrackEventType;
  path?: string | null;
  meta?: Record<string, unknown>;
  userId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
}

export async function recordTrackEvent(args: RecordArgs): Promise<{ id: number } | null> {
  const metaJson = JSON.stringify(args.meta ?? {}).slice(0, MAX_META_BYTES);
  const r = await getPool().query<{ id: string | number }>(
    `INSERT INTO track_events (type, path, meta, user_id, ip_hash, user_agent)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id`,
    [
      args.type.slice(0, MAX_TYPE_LEN),
      args.path ? args.path.slice(0, MAX_PATH_LEN) : null,
      metaJson,
      args.userId ?? null,
      args.ipHash ?? null,
      args.userAgent ?? null,
    ],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { id: Number(row.id) };
}

export { clampString };
