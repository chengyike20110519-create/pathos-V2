// Coverage for Phase 1.2 organization + invitation primitives.
//
// What we are locking down here:
//   - createOrganization auto-inserts the creator as the first owner
//     of the new org in a single user flow.
//   - slug collision falls back to a suffixed slug instead of throwing,
//     so two firms called "Hope Education" do not block each other.
//   - membershipRole returns owner/advisor/null and never confuses
//     advisor / student rows (Phase 1.2 keeps those as invitations
//     only, not memberships).
//   - issueInvitation stores only the SHA-256 of the token, never the
//     raw token. The raw value is returned to the caller exactly once.
//   - consumeInvitation is single-use: a second consume on the same
//     token returns null.
//   - consumeInvitation rejects expired tokens.
//   - consumeInvitation rejects mismatched emails (the canonical
//     "I clicked my advisor's invite on my personal account" case).
//   - listInvitationsForOrg returns rows in created_at DESC order.
//
// The database is mocked at the @/server/db boundary the same way
// p0-security.test.ts and p1-auth.test.ts do. The mock routes by
// query shape so we can assert call counts without hand-rolling a
// full SQL parser.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DbResult = { rows: unknown[]; rowCount: number };

const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _params: unknown[]): Promise<DbResult> =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  ),
);

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
}));

import {
  createOrganization,
  listOrganizationsForUser,
  membershipRole,
  listOrgMembers,
  addMembership,
  removeMembership,
  getOrganization,
  slugifyName,
} from "@/lib/orgs";
import {
  issueInvitation,
  listInvitationsForOrg,
  getInvitationViewByToken,
  consumeInvitation,
  revokeInvitation,
  generateInvitationToken,
  hashInvitationToken,
  invitationRoleToMembershipRole,
} from "@/lib/invitations";

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(() =>
    Promise.resolve({ rows: [], rowCount: 0 }) as Promise<DbResult>,
  );
});

afterEach(() => {
  queryMock.mockReset();
});

function mockQuery(impl: (q: string, p: unknown[]) => Promise<DbResult>) {
  queryMock.mockImplementation(impl as (q: string, p: unknown[]) => Promise<DbResult>);
}

describe("slug derivation", () => {
  it("slugifyName lowercases and replaces spaces with hyphens", () => {
    expect(slugifyName("Hope Education")).toBe("hope-education");
    expect(slugifyName("  Hope   Education  ")).toBe("hope-education");
  });

  it("slugifyName preserves CJK characters so Chinese names are stable", () => {
    expect(slugifyName("启行顾问工作室")).toBe("启行顾问工作室");
  });

  it("slugifyName falls back to a random hex slug when the input is pure punctuation", () => {
    const slug = slugifyName("!!!");
    expect(slug).toMatch(/^org-[0-9a-f]{8}$/);
  });
});

describe("createOrganization", () => {
  it("inserts the org row and immediately adds the creator as owner", async () => {
    const calls: string[] = [];
    mockQuery(async (q) => {
      calls.push(q);
      if (q.includes("INSERT INTO organizations")) {
        return Promise.resolve({
          rows: [
            {
              id: "org_1",
              name: "Hope Education",
              slug: "hope-education-abcd",
              plan: "team",
              created_at: new Date("2026-01-01T00:00:00Z"),
              created_by_user_id: "u_1",
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const created = await createOrganization({
      name: "Hope Education",
      createdByUserId: "u_1",
    });
    expect(created.id).toBe("org_1");
    expect(created.slug).toBe("hope-education-abcd");
    expect(created.plan).toBe("team");
    // The order matters: org row first, membership second so the FK
    // resolves. We assert both calls were issued in that order.
    expect(calls.findIndex((c) => c.includes("INSERT INTO organizations"))).toBeLessThan(
      calls.findIndex((c) => c.includes("INSERT INTO org_memberships")),
    );
  });

  it("appends a short random suffix to the slug so collisions do not throw", async () => {
    const slugs: string[] = [];
    mockQuery(async (q, p) => {
      if (q.includes("INSERT INTO organizations")) {
        const slug = String(p[2] ?? "");
        slugs.push(slug);
        return Promise.resolve({
          rows: [
            {
              id: "org_x",
              name: String(p[1]),
              slug,
              plan: "team",
              created_at: new Date(),
              created_by_user_id: String(p[4]),
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const a = await createOrganization({ name: "Hope Education", createdByUserId: "u_1" });
    const b = await createOrganization({ name: "Hope Education", createdByUserId: "u_2" });
    expect(a.slug).not.toBe(b.slug);
    expect(a.slug.startsWith("hope-education-")).toBe(true);
    expect(b.slug.startsWith("hope-education-")).toBe(true);
    expect(slugs).toHaveLength(2);
  });
});

describe("membershipRole", () => {
  it("returns the role string when the membership exists", async () => {
    mockQuery(async (q) => {
      if (q.includes("SELECT role FROM org_memberships")) {
        return Promise.resolve({ rows: [{ role: "owner" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    expect(await membershipRole("org_1", "u_1")).toBe("owner");
  });

  it("returns null when the (org, user) row is absent", async () => {
    mockQuery(async () => Promise.resolve({ rows: [], rowCount: 0 }));
    expect(await membershipRole("org_1", "u_1")).toBeNull();
  });

  it("listOrganizationsForUser joins memberships and orders by created_at DESC", async () => {
    mockQuery(async (q) => {
      if (q.includes("JOIN org_memberships")) {
        return Promise.resolve({
          rows: [
            {
              id: "org_2",
              name: "Second",
              slug: "second",
              plan: "team",
              created_at: new Date("2026-02-01T00:00:00Z"),
              created_by_user_id: "u_1",
            },
            {
              id: "org_1",
              name: "First",
              slug: "first",
              plan: "team",
              created_at: new Date("2026-01-01T00:00:00Z"),
              created_by_user_id: "u_1",
            },
          ],
          rowCount: 2,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const out = await listOrganizationsForUser("u_1");
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("org_2");
    expect(out[1].id).toBe("org_1");
  });

  it("listOrgMembers joins auth_users so the email is available", async () => {
    mockQuery(async (q) => {
      if (q.includes("JOIN auth_users")) {
        return Promise.resolve({
          rows: [
            {
              user_id: "u_1",
              email: "owner@example.com",
              display_name: "Owner",
              role: "owner",
              created_at: new Date(),
            },
            {
              user_id: "u_2",
              email: "advisor@example.com",
              display_name: null,
              role: "advisor",
              created_at: new Date(),
            },
          ],
          rowCount: 2,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const rows = await listOrgMembers("org_1");
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe("owner@example.com");
    expect(rows[0].displayName).toBe("Owner");
    expect(rows[1].displayName).toBeNull();
  });

  it("addMembership upserts so a duplicate (org, user) row promotes instead of throwing", async () => {
    mockQuery(async (q) =>
      q.includes("INSERT INTO org_memberships")
        ? Promise.resolve({ rows: [], rowCount: 1 })
        : Promise.resolve({ rows: [], rowCount: 0 }),
    );
    await addMembership({ orgId: "org_1", userId: "u_1", role: "advisor" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/ON CONFLICT/);
    expect(params).toEqual(["org_1", "u_1", "advisor"]);
  });

  it("removeMembership deletes by (org, user) PK", async () => {
    mockQuery(async () => Promise.resolve({ rows: [], rowCount: 1 }));
    await removeMembership({ orgId: "org_1", userId: "u_2" });
    const [sql, params] = queryMock.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/DELETE FROM org_memberships/);
    expect(params).toEqual(["org_1", "u_2"]);
  });

  it("getOrganization returns null for an unknown id", async () => {
    mockQuery(async () => Promise.resolve({ rows: [], rowCount: 0 }));
    expect(await getOrganization("nope")).toBeNull();
  });
});

describe("issueInvitation", () => {
  it("returns the raw token exactly once and only stores its hash", async () => {
    mockQuery(async (q, p) => {
      if (q.includes("INSERT INTO invitations")) {
        return Promise.resolve({
          rows: [
            {
              id: "inv_1",
              org_id: String(p[1]),
              email: String(p[2]),
              role: String(p[3]),
              expires_at: new Date(Date.now() + 1000),
              accepted_at: null,
              created_at: new Date(),
              invited_by_user_id: String(p[6]),
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const out = await issueInvitation({
      orgId: "org_1",
      email: "Teammate@Example.COM",
      role: "advisor",
      invitedByUserId: "u_1",
    });
    expect(out.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(out.invitation.email).toBe("teammate@example.com"); // lowercased
    const [sql, params] = queryMock.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/INSERT INTO invitations/);
    // params: [id, org_id, email, role, token_hash, expires_at, invited_by]
    const tokenHash = String(params[4]);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashInvitationToken(out.token));
    // The raw token must NOT appear in any persisted param slot.
    for (const slot of params) {
      expect(String(slot)).not.toBe(out.token);
    }
  });

  it("listInvitationsForOrg returns rows in created_at DESC order", async () => {
    mockQuery(async (q) => {
      if (q.includes("FROM invitations") && q.includes("ORDER BY created_at DESC")) {
        return Promise.resolve({
          rows: [
            {
              id: "inv_2",
              org_id: "org_1",
              email: "second@example.com",
              role: "advisor",
              expires_at: new Date(),
              accepted_at: null,
              created_at: new Date("2026-02-01T00:00:00Z"),
              invited_by_user_id: "u_1",
            },
            {
              id: "inv_1",
              org_id: "org_1",
              email: "first@example.com",
              role: "advisor",
              expires_at: new Date(),
              accepted_at: null,
              created_at: new Date("2026-01-01T00:00:00Z"),
              invited_by_user_id: "u_1",
            },
          ],
          rowCount: 2,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const rows = await listInvitationsForOrg("org_1");
    expect(rows.map((r) => r.id)).toEqual(["inv_2", "inv_1"]);
  });
});

describe("consumeInvitation atomicity", () => {
  function okResponse() {
    return {
      id: "inv_1",
      org_id: "org_1",
      email: "alice@example.com",
      role: "advisor" as const,
      expires_at: new Date(Date.now() + 60_000),
      accepted_at: new Date(),
      created_at: new Date(),
      invited_by_user_id: "u_1",
    };
  }
  function lookupResponse() {
    return Promise.resolve({ rows: [{ name: "Hope", slug: "hope" }], rowCount: 1 });
  }

  it("returns the view when the claim succeeds and backfills the org row", async () => {
    mockQuery(async (q) => {
      if (q.includes("UPDATE invitations") && q.includes("accepted_at = NOW()")) {
        return Promise.resolve({ rows: [okResponse()], rowCount: 1 });
      }
      if (q.includes("SELECT name, slug FROM organizations")) {
        return lookupResponse();
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const view = await consumeInvitation({
      token: generateInvitationToken(),
      userId: "u_99",
      userEmail: "alice@example.com",
    });
    expect(view).not.toBeNull();
    expect(view!.orgName).toBe("Hope");
    expect(view!.role).toBe("advisor");
    // Two queries: claim + org lookup. Membership insertion is the
    // route`s job, not consume`s.
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("returns null on a second consume of the same token", async () => {
    let consumed = false;
    mockQuery(async (q) => {
      if (q.includes("UPDATE invitations") && q.includes("accepted_at = NOW()")) {
        if (consumed) return Promise.resolve({ rows: [], rowCount: 0 });
        consumed = true;
        return Promise.resolve({ rows: [okResponse()], rowCount: 1 });
      }
      if (q.includes("SELECT name, slug FROM organizations")) return lookupResponse();
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const token = generateInvitationToken();
    const first = await consumeInvitation({
      token,
      userId: "u_99",
      userEmail: "alice@example.com",
    });
    const second = await consumeInvitation({
      token,
      userId: "u_99",
      userEmail: "alice@example.com",
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("returns null when the claim matches zero rows (expired or unknown)", async () => {
    mockQuery(async () => Promise.resolve({ rows: [], rowCount: 0 }));
    expect(
      await consumeInvitation({
        token: generateInvitationToken(),
        userId: "u_99",
        userEmail: "alice@example.com",
      }),
    ).toBeNull();
  });

  it("returns null when the email on the invitation does not match the caller", async () => {
    // The atomic UPDATE has `email = $3`, so a mismatched caller
    // never wins the claim -- this is what protects against an
    // attacker using their own logged-in session to consume someone
    // else's invite.
    mockQuery(async (q, p) => {
      if (q.includes("UPDATE invitations") && q.includes("accepted_at = NOW()")) {
        const claimEmail = String(p[2] ?? "").toLowerCase();
        if (claimEmail !== "alice@example.com") {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        return Promise.resolve({ rows: [okResponse()], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const out = await consumeInvitation({
      token: generateInvitationToken(),
      userId: "u_evil",
      userEmail: "evil@example.com",
    });
    expect(out).toBeNull();
  });
});

describe("getInvitationViewByToken", () => {
  it("hashes the token and returns the joined row", async () => {
    const token = generateInvitationToken();
    mockQuery(async (q, p) => {
      if (q.includes("FROM invitations i") && q.includes("JOIN organizations")) {
        // Assert we received the hash, not the token.
        expect(String(p[0])).toBe(hashInvitationToken(token));
        expect(String(p[0])).not.toBe(token);
        return Promise.resolve({
          rows: [
            {
              id: "inv_1",
              org_id: "org_1",
              email: "alice@example.com",
              role: "advisor",
              expires_at: new Date(),
              accepted_at: null,
              created_at: new Date(),
              invited_by_user_id: "u_1",
              org_name: "Hope",
              org_slug: "hope",
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const view = await getInvitationViewByToken(token);
    expect(view).not.toBeNull();
    expect(view!.orgName).toBe("Hope");
    expect(view!.orgSlug).toBe("hope");
  });

  it("returns null when the token hash matches no row", async () => {
    mockQuery(async () => Promise.resolve({ rows: [], rowCount: 0 }));
    expect(await getInvitationViewByToken(generateInvitationToken())).toBeNull();
  });
});

describe("revokeInvitation", () => {
  it("deletes only non-accepted rows so the audit trail stays intact", async () => {
    mockQuery(async () => Promise.resolve({ rows: [], rowCount: 1 }));
    await revokeInvitation("inv_1");
    const [sql, params] = queryMock.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/DELETE FROM invitations/);
    expect(sql).toMatch(/accepted_at IS NULL/);
    expect(params).toEqual(["inv_1"]);
  });
});

describe("invitationRoleToMembershipRole mapping", () => {
  it("advisor invitations become advisor memberships", () => {
    expect(invitationRoleToMembershipRole("advisor")).toBe("advisor");
  });

  it("student invitations do NOT create a membership -- only the accepted_user_id link", () => {
    expect(invitationRoleToMembershipRole("student")).toBeNull();
  });
});
