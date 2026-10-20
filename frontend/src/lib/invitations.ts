// Invitation tokens for organizations.
//
// Like magic links, invitations are 32-byte base64url tokens persisted
// only as their SHA-256. The raw value travels exactly once -- in the
// email body -- so a database dump cannot be used to add an attacker
// to the firm. Acceptance is atomic: a second caller sees zero rows
// updated and gets `null`.

import { createHash, randomBytes } from "node:crypto";
import { getPool } from "@/server/db";
import type { OrgRole } from "@/lib/orgs";

export type InvitationRole = "advisor" | "student";

export const INVITATION_TTL_MS = Number(
  process.env.PATHOS_INVITATION_TTL_DAYS ?? 14,
) * 24 * 60 * 60 * 1000;

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: InvitationRole;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedByUserId: string;
}

export interface InvitationIssue {
  token: string;
  invitation: Invitation;
}

export interface InvitationView extends Invitation {
  orgName: string;
  orgSlug: string;
}

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueInvitation(args: {
  orgId: string;
  email: string;
  role: InvitationRole;
  invitedByUserId: string;
}): Promise<InvitationIssue> {
  const id = newId();
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const r = await getPool().query<{
    id: string;
    org_id: string;
    email: string;
    role: InvitationRole;
    expires_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    invited_by_user_id: string;
  }>(
    `INSERT INTO invitations
       (id, org_id, email, role, token_hash, expires_at, invited_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, org_id, email, role, expires_at, accepted_at,
               created_at, invited_by_user_id`,
    [
      id,
      args.orgId,
      args.email.toLowerCase(),
      args.role,
      tokenHash,
      expiresAt,
      args.invitedByUserId,
    ],
  );
  const row = r.rows[0];
  return {
    token,
    invitation: {
      id: row.id,
      orgId: row.org_id,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at.toISOString(),
      acceptedAt: row.accepted_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      invitedByUserId: row.invited_by_user_id,
    },
  };
}

export async function listInvitationsForOrg(orgId: string): Promise<Invitation[]> {
  const r = await getPool().query<{
    id: string;
    org_id: string;
    email: string;
    role: InvitationRole;
    expires_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    invited_by_user_id: string;
  }>(
    `SELECT id, org_id, email, role, expires_at, accepted_at,
            created_at, invited_by_user_id
       FROM invitations
      WHERE org_id = $1
      ORDER BY created_at DESC`,
    [orgId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    invitedByUserId: row.invited_by_user_id,
  }));
}

export async function getInvitationViewByToken(token: string): Promise<InvitationView | null> {
  const tokenHash = hashInvitationToken(token);
  const r = await getPool().query<{
    id: string;
    org_id: string;
    email: string;
    role: InvitationRole;
    expires_at: Date;
    accepted_at: Date | null;
    created_at: Date;
    invited_by_user_id: string;
    org_name: string;
    org_slug: string;
  }>(
    `SELECT i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at,
            i.created_at, i.invited_by_user_id,
            o.name AS org_name, o.slug AS org_slug
       FROM invitations i
       JOIN organizations o ON o.id = i.org_id
      WHERE i.token_hash = $1`,
    [tokenHash],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    invitedByUserId: row.invited_by_user_id,
    orgName: row.org_name,
    orgSlug: row.org_slug,
  };
}

// Atomic acceptance: flips accepted_at from NULL to NOW() and returns
// the row if and only if we are the first caller, the token is still
// inside its window, and the email matches the accepting user.
export async function consumeInvitation(args: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<InvitationView | null> {
  const tokenHash = hashInvitationToken(args.token);
  const claim = await getPool().query<{
    id: string;
    org_id: string;
    email: string;
    role: InvitationRole;
    expires_at: Date;
    accepted_at: Date;
    created_at: Date;
    invited_by_user_id: string;
  }>(
    `UPDATE invitations
        SET accepted_at = NOW(),
            accepted_user_id = $2
      WHERE token_hash = $1
        AND accepted_at IS NULL
        AND expires_at > NOW()
        AND email = $3
      RETURNING id, org_id, email, role, expires_at, accepted_at,
                created_at, invited_by_user_id`,
    [tokenHash, args.userId, args.userEmail.toLowerCase()],
  );
  const row = claim.rows[0];
  if (!row) return null;
  // Hydrate the view with the org name + slug so the caller can show
  // "Welcome to <Org>" without an extra round trip.
  const org = await getPool().query<{ name: string; slug: string }>(
    `SELECT name, slug FROM organizations WHERE id = $1`,
    [row.org_id],
  );
  const orgRow = org.rows[0];
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    invitedByUserId: row.invited_by_user_id,
    orgName: orgRow?.name ?? "",
    orgSlug: orgRow?.slug ?? "",
  };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await getPool().query(
    `DELETE FROM invitations WHERE id = $1 AND accepted_at IS NULL`,
    [invitationId],
  );
}

// Map an invitation role onto the membership role it should produce
// once accepted. Student invitations do not become org members -- they
// just get the right to view reports the firm shares with them. The
// auth_user row is still linked via accepted_user_id, which is what
// /api/reports/[id] will check in Phase 1.4.
export function invitationRoleToMembershipRole(role: InvitationRole): OrgRole | null {
  if (role === "advisor") return "advisor";
  return null;
}
