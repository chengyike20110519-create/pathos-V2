// Magic-link helpers: token generation, persistence, verification.
//
// Tokens are 32 random bytes (base64url). Only the SHA-256 of the
// token is stored, the same pattern used by P0 report share links:
// a database dump cannot be used to sign in.
//
// A magic link is single-use (`consumed_at` is set on first hit) and
// has a short TTL (default 15 minutes). After consumption the link
// is dead even if still inside the window.

import { createHash, randomBytes } from "node:crypto";
import { getPool } from "@/server/db";

export const MAGIC_LINK_TTL_MS = Number(process.env.PATHOS_MAGIC_LINK_TTL_MINUTES ?? 15) * 60 * 1000;

export interface MagicLinkIssue {
  token: string;
  expiresAt: Date;
}

export interface MagicLinkUser {
  userId: string;
  email: string;
  displayName: string | null;
  tier: "free" | "pro" | "studio";
  isNewUser: boolean;
}

export function hashMagicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateMagicToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueMagicLink(args: {
  email: string;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<MagicLinkIssue> {
  const token = generateMagicToken();
  const tokenHash = hashMagicToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
  await getPool().query(
    `INSERT INTO auth_magic_links (id, email, token_hash, expires_at, ip_hash, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomBytes(12).toString("base64url"), args.email.toLowerCase(), tokenHash, expiresAt, args.ipHash ?? null, args.userAgent ?? null],
  );
  return { token, expiresAt };
}

export async function consumeMagicLink(token: string): Promise<MagicLinkUser | null> {
  const tokenHash = hashMagicToken(token);
  const pool = getPool();

  // Atomic claim: only the row that flips from NULL to NOW() wins.
  // Concurrent requests that race to use the same link all see zero
  // rows updated, so a single-use invariant is preserved without a
  // transaction.
  const claim = await pool.query<{ id: string; email: string }>(
    `UPDATE auth_magic_links
        SET consumed_at = NOW()
      WHERE token_hash = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id, email`,
    [tokenHash],
  );
  const row = claim.rows[0];
  if (!row) return null;

  // Upsert the user. Email is the canonical key: a fresh visitor who
  // claims a magic link for the first time gets a `free` row inserted
  // here, and the existing user is returned unchanged.
  const email = row.email.toLowerCase();
  const upsert = await pool.query<{ id: string; email: string; display_name: string | null; tier: "free" | "pro" | "studio"; inserted: boolean }>(
    `INSERT INTO auth_users (id, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET last_seen_at = NOW()
     RETURNING id, email, display_name, tier, (xmax = 0) AS inserted`,
    [randomBytes(12).toString("base64url"), email],
  );
  const user = upsert.rows[0];
  if (!user) return null;

  // Backfill user_id on the magic link so audits can join cleanly.
  await pool.query("UPDATE auth_magic_links SET user_id = $1 WHERE id = $2", [user.id, row.id]).catch(() => {});

  return {
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    tier: user.tier,
    isNewUser: user.inserted,
  };
}

export async function sweepExpiredMagicLinks(): Promise<number> {
  const r = await getPool().query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM auth_magic_links WHERE expires_at < NOW() - INTERVAL '1 day'",
  );
  if ((r.rows[0]?.n ?? 0) > 50) {
    await getPool().query("DELETE FROM auth_magic_links WHERE expires_at < NOW() - INTERVAL '1 day'");
  }
  return r.rows[0]?.n ?? 0;
}
