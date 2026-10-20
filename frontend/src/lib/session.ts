// Cookie-backed session helpers.
//
// The cookie holds a random session id; the database holds the
// SHA-256 of that id plus its expiry. The raw value never leaves
// the user`s browser, so a database dump or log leak cannot be
// replayed to impersonate a user.
//
// The cookie name and TTL are environment-controlled so we can rotate
// without invalidating every active session. PATHOS_SESSION_COOKIE
// defaults to `pathos.sid`; PATHOS_SESSION_TTL_DAYS defaults to 30.

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPool } from "@/server/db";
import {
  PREVIEW_AUTH_COOKIE,
  PREVIEW_AUTH_USER,
  isPreviewAuthEnabled,
} from "@/lib/preview-auth";

export const SESSION_COOKIE = process.env.PATHOS_SESSION_COOKIE ?? "pathos.sid";
const SESSION_TTL_MS = Number(process.env.PATHOS_SESSION_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  tier: "free" | "pro" | "studio";
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateSessionId(): string {
  // 32 bytes -> 43 chars base64url. Plenty of entropy; not user-readable.
  return randomBytes(32).toString("base64url");
}

export function hashSessionId(id: string): string {
  return hash(id);
}

export async function createSession(args: {
  userId: string;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionId();
  const tokenHash = hashSessionId(id);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getPool().query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, ip_hash, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, args.userId, tokenHash, expiresAt, args.ipHash ?? null, args.userAgent ?? null],
  );
  return { id, expiresAt };
}

export async function revokeSession(id: string): Promise<void> {
  await getPool().query("DELETE FROM auth_sessions WHERE id = $1", [id]);
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await getPool().query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
}

export async function findSessionUser(id: string): Promise<SessionUser | null> {
  const tokenHash = hashSessionId(id);
  const result = await getPool().query<{
    id: string;
    email: string;
    display_name: string | null;
    tier: "free" | "pro" | "studio";
  }>(
    `SELECT u.id, u.email, u.display_name, u.tier
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.token_hash = $2 AND s.expires_at > NOW()`,
    [id, tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  // Touch last_used_at so an idle session can be detected later.
  await getPool().query("UPDATE auth_sessions SET last_used_at = NOW() WHERE id = $1", [id]).catch(() => {});
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    tier: row.tier,
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = cookies();
  if (isPreviewAuthEnabled() && jar.get(PREVIEW_AUTH_COOKIE)?.value === "1") {
    return { ...PREVIEW_AUTH_USER };
  }
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  return findSessionUser(sid);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
