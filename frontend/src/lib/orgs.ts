// Organization + membership helpers.
//
// Conventions:
//   - ids are 12-byte base64url, matching auth_users.id.
//   - role is `'owner' | 'advisor'`. `owner` can edit membership and
//     create invitations; `advisor` can create invitations but cannot
//     remove other advisors. This split is enforced server-side on
//     every mutation in src/app/api/orgs/**.
//   - slug is derived from the org name and is unique across all orgs.
//     We append a short random suffix on collision instead of failing
//     the request.

import { randomBytes } from "node:crypto";
import { getPool } from "@/server/db";

export type OrgRole = "owner" | "advisor";
export type OrgPlan = "team" | "agency" | "studio";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  createdAt: string;
  createdByUserId: string;
}

export interface OrgMembership {
  orgId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

export interface OrgMemberView {
  userId: string;
  email: string;
  displayName: string | null;
  role: OrgRole;
  joinedAt: string;
}

function newId(): string {
  return randomBytes(12).toString("base64url");
}

export function slugifyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  // For non-Latin names where the regex wipes the string, fall back to
  // a stable hash so we never produce an empty slug.
  if (base) return base;
  return `org-${randomBytes(4).toString("hex")}`;
}

export async function createOrganization(args: {
  name: string;
  createdByUserId: string;
  plan?: OrgPlan;
}): Promise<Organization> {
  const id = newId();
  const base = slugifyName(args.name);
  const suffix = randomBytes(2).toString("hex");
  const slug = `${base}-${suffix}`;
  const plan = args.plan ?? "team";
  const r = await getPool().query<{
    id: string;
    name: string;
    slug: string;
    plan: OrgPlan;
    created_at: Date;
    created_by_user_id: string;
  }>(
    `INSERT INTO organizations (id, name, slug, plan, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, slug, plan, created_at, created_by_user_id`,
    [id, args.name.trim(), slug, plan, args.createdByUserId],
  );
  // Creator becomes the first owner.
  await getPool().query(
    `INSERT INTO org_memberships (org_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [id, args.createdByUserId],
  );
  const row = r.rows[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
  };
}

export async function listOrganizationsForUser(userId: string): Promise<Organization[]> {
  const r = await getPool().query<{
    id: string;
    name: string;
    slug: string;
    plan: OrgPlan;
    created_at: Date;
    created_by_user_id: string;
  }>(
    `SELECT o.id, o.name, o.slug, o.plan, o.created_at, o.created_by_user_id
       FROM organizations o
       JOIN org_memberships m ON m.org_id = o.id
      WHERE m.user_id = $1
      ORDER BY o.created_at DESC`,
    [userId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
  }));
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const r = await getPool().query<{
    id: string;
    name: string;
    slug: string;
    plan: OrgPlan;
    created_at: Date;
    created_by_user_id: string;
  }>(
    `SELECT id, name, slug, plan, created_at, created_by_user_id
       FROM organizations
      WHERE id = $1`,
    [orgId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
  };
}

export async function membershipRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const r = await getPool().query<{ role: OrgRole }>(
    `SELECT role FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  return r.rows[0]?.role ?? null;
}

export async function listOrgMembers(orgId: string): Promise<OrgMemberView[]> {
  const r = await getPool().query<{
    user_id: string;
    email: string;
    display_name: string | null;
    role: OrgRole;
    created_at: Date;
  }>(
    `SELECT m.user_id, u.email, u.display_name, m.role, m.created_at
       FROM org_memberships m
       JOIN auth_users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY m.created_at ASC`,
    [orgId],
  );
  return r.rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    joinedAt: row.created_at.toISOString(),
  }));
}

export async function addMembership(args: {
  orgId: string;
  userId: string;
  role: OrgRole;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO org_memberships (org_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE
       SET role = EXCLUDED.role`,
    [args.orgId, args.userId, args.role],
  );
}

export async function removeMembership(args: {
  orgId: string;
  userId: string;
}): Promise<void> {
  await getPool().query(
    `DELETE FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [args.orgId, args.userId],
  );
}
