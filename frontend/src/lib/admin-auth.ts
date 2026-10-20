// Admin-section authorization helper.
//
// The operator CRM at /admin/* is gated by org membership: anyone who
// belongs to an organization as either `owner` or `advisor` gets read
// + write access to the lead pipeline. This is the same gate used by
// /workbench/orgs; we centralize it here so the route handlers do not
// re-implement the lookup.
//
// Why not a separate `tier = studio` flag:
//   - the tier field already encodes pricing, not authorization, and
//     conflating the two would let a paid single-seat buyer manage
//     leads they have no business touching.
//   - org membership is what already restricts /api/orgs/[id] and
//     aligns with the "team" plan model the rest of Phase 1.2 built.

import { getPool } from "@/server/db";
import { requireUser, type SessionUser } from "@/lib/session";

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;
  constructor() {
    super("You need to be a member of an organization to manage leads.");
    this.name = "ForbiddenError";
  }
}

// Returns the user plus the highest role they hold across any org.
// Throws `Error("UNAUTHENTICATED")` if there is no session, or
// ForbiddenError if the user has no org membership at all.
export async function requireAdvisor(): Promise<{ user: SessionUser; role: "owner" | "advisor" }> {
  const user = await requireUser();
  const r = await getPool().query<{ role: "owner" | "advisor" }>(
    `SELECT role FROM org_memberships
      WHERE user_id = $1
      ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END
      LIMIT 1`,
    [user.id],
  );
  const row = r.rows[0];
  if (!row) throw new ForbiddenError();
  return { user, role: row.role };
}
