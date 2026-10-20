// Shortlists + reach/match/safety bucketed items.
//
// Conventions:
//   - shortlist ids are 12-byte base64url, matching auth_users.id.
//   - bucket values are `'reach' | 'match' | 'safety'`. The CHECK
//     constraint in 004-shortlists.sql enforces this at the DB; the
//     union here mirrors it so TS catches a typo before SQL does.
//   - Adding the same (shortlist, university) twice is rejected by
//     the UNIQUE constraint; we surface a `DuplicateItem` so callers
//     can render a useful error instead of a generic 500.

import { randomBytes } from "node:crypto";
import { getPool } from "@/server/db";

export type ShortlistBucket = "reach" | "match" | "safety";

export const SHORTLIST_BUCKETS: readonly ShortlistBucket[] = ["reach", "match", "safety"] as const;

export function isShortlistBucket(value: unknown): value is ShortlistBucket {
  return value === "reach" || value === "match" || value === "safety";
}

export interface Shortlist {
  id: string;
  ownerUserId: string;
  name: string;
  season: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShortlistItem {
  id: string;
  shortlistId: string;
  universityId: string;
  bucket: ShortlistBucket;
  notes: string | null;
  createdAt: string;
}

export interface ShortlistItemWithUniversity extends ShortlistItem {
  universityName: string;
  universityChineseName: string | null;
}

export interface ShortlistGrouped {
  reach: ShortlistItemWithUniversity[];
  match: ShortlistItemWithUniversity[];
  safety: ShortlistItemWithUniversity[];
}

export class DuplicateItemError extends Error {
  readonly code = "DUPLICATE_ITEM";
  readonly status = 409;
  constructor() {
    super("This school is already on the list. Move it to a different bucket instead.");
    this.name = "DuplicateItemError";
  }
}

export class UnknownUniversityError extends Error {
  readonly code = "UNKNOWN_UNIVERSITY";
  readonly status = 404;
  constructor(public universityId: string) {
    super(`University ${universityId} does not exist.`);
    this.name = "UnknownUniversityError";
  }
}

function newId(): string {
  return randomBytes(12).toString("base64url");
}

function asBucket(value: unknown): ShortlistBucket | null {
  return isShortlistBucket(value) ? value : null;
}

export async function createShortlist(args: {
  ownerUserId: string;
  name: string;
  season?: string | null;
  notes?: string | null;
}): Promise<Shortlist> {
  const id = newId();
  const r = await getPool().query<{
    id: string;
    owner_user_id: string;
    name: string;
    season: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO shortlists (id, owner_user_id, name, season, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, owner_user_id, name, season, notes, created_at, updated_at`,
    [id, args.ownerUserId, args.name.trim(), args.season ?? null, args.notes ?? null],
  );
  const row = r.rows[0];
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    season: row.season,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listShortlistsForUser(userId: string): Promise<Shortlist[]> {
  const r = await getPool().query<{
    id: string;
    owner_user_id: string;
    name: string;
    season: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, owner_user_id, name, season, notes, created_at, updated_at
       FROM shortlists
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    season: row.season,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function getShortlist(shortlistId: string): Promise<Shortlist | null> {
  const r = await getPool().query<{
    id: string;
    owner_user_id: string;
    name: string;
    season: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, owner_user_id, name, season, notes, created_at, updated_at
       FROM shortlists
      WHERE id = $1`,
    [shortlistId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    season: row.season,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listShortlistItems(shortlistId: string): Promise<ShortlistItemWithUniversity[]> {
  const r = await getPool().query<{
    id: string;
    shortlist_id: string;
    university_id: string;
    bucket: ShortlistBucket;
    notes: string | null;
    created_at: Date;
    university_name: string;
    university_chinese_name: string | null;
  }>(
    `SELECT i.id, i.shortlist_id, i.university_id, i.bucket, i.notes, i.created_at,
            u.name AS university_name, u.chinese_name AS university_chinese_name
       FROM shortlist_items i
       JOIN universities u ON u.id = i.university_id
      WHERE i.shortlist_id = $1
      ORDER BY i.created_at ASC`,
    [shortlistId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    shortlistId: row.shortlist_id,
    universityId: row.university_id,
    bucket: row.bucket,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    universityName: row.university_name,
    universityChineseName: row.university_chinese_name,
  }));
}

export async function getShortlistGrouped(shortlistId: string): Promise<ShortlistGrouped> {
  const items = await listShortlistItems(shortlistId);
  const out: ShortlistGrouped = { reach: [], match: [], safety: [] };
  for (const item of items) out[item.bucket].push(item);
  return out;
}

export async function addShortlistItem(args: {
  shortlistId: string;
  universityId: string;
  bucket: ShortlistBucket;
  notes?: string | null;
}): Promise<ShortlistItem> {
  // We pre-check both the duplicate AND the FK target so we can
  // surface a useful error code (404 vs 409) instead of letting pg
  // throw an opaque SQLSTATE.
  const exists = await getPool().query<{ id: string }>(
    `SELECT id FROM universities WHERE id = $1`,
    [args.universityId],
  );
  if (!exists.rows[0]) throw new UnknownUniversityError(args.universityId);

  const dupe = await getPool().query<{ id: string }>(
    `SELECT id FROM shortlist_items WHERE shortlist_id = $1 AND university_id = $2`,
    [args.shortlistId, args.universityId],
  );
  if (dupe.rows[0]) throw new DuplicateItemError();

  const id = newId();
  try {
    const r = await getPool().query<{
      id: string;
      shortlist_id: string;
      university_id: string;
      bucket: ShortlistBucket;
      notes: string | null;
      created_at: Date;
    }>(
      `INSERT INTO shortlist_items (id, shortlist_id, university_id, bucket, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, shortlist_id, university_id, bucket, notes, created_at`,
      [id, args.shortlistId, args.universityId, args.bucket, args.notes ?? null],
    );
    const row = r.rows[0];
    return {
      id: row.id,
      shortlistId: row.shortlist_id,
      universityId: row.university_id,
      bucket: row.bucket,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
    };
  } catch (e) {
    // Race: another caller added the same school between our SELECT
    // and INSERT. Surface the same code as the synchronous dupe check.
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
      throw new DuplicateItemError();
    }
    throw e;
  }
}

export async function changeShortlistItemBucket(args: {
  itemId: string;
  shortlistId: string;
  bucket: ShortlistBucket;
}): Promise<void> {
  await getPool().query(
    `UPDATE shortlist_items
        SET bucket = $3
      WHERE id = $1 AND shortlist_id = $2`,
    [args.itemId, args.shortlistId, args.bucket],
  );
}

export async function removeShortlistItem(args: {
  itemId: string;
  shortlistId: string;
}): Promise<void> {
  await getPool().query(
    `DELETE FROM shortlist_items WHERE id = $1 AND shortlist_id = $2`,
    [args.itemId, args.shortlistId],
  );
}

export async function touchShortlist(shortlistId: string): Promise<void> {
  // updated_at drives the ordering in listShortlistsForUser. We only
  // bump it on mutations that visibly change the list (item added,
  // bucket changed, item removed); rename-only lives on a future PATCH.
  await getPool().query(
    `UPDATE shortlists SET updated_at = NOW() WHERE id = $1`,
    [shortlistId],
  );
}

export { asBucket };
