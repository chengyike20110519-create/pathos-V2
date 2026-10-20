// Coverage for Phase 1.1 magic-link + cookie session primitives.
//
// What we are locking down here:
//   - Token generation is 43-char base64url; the SHA-256 hash is what
//     actually lives in the database, not the token itself.
//   - consumeMagicLink is single-use: a second consume on the same
//     token returns null.
//   - Sessions are bound to a single user -- a token swap cannot
//     resolve to a different user.
//   - Sessions expire; findSessionUser returns null past the deadline.
//   - ConsoleMailer.send is fire-and-forget -- no throw on missing SMTP.
//
// We mock the database at the @/server/db boundary the same way
// p0-security.test.ts does. The mock returns a Promise with .catch()
// so the lib code that does `.catch(() => {})` does not blow up.

import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _params: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  ),
);

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
}));

import {
  generateMagicToken,
  hashMagicToken,
  consumeMagicLink,
  issueMagicLink,
} from "@/lib/auth-magic-link";
import {
  generateSessionId,
  hashSessionId,
  createSession,
  findSessionUser,
  revokeSession,
  SESSION_COOKIE,
} from "@/lib/session";
import { ConsoleMailer, getMailer, __resetMailerForTests } from "@/lib/mailer";

type DbResult = { rows: unknown[]; rowCount: number };

afterEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(
    () => Promise.resolve({ rows: [], rowCount: 0 }) as Promise<DbResult>,
  );
  __resetMailerForTests();
});

describe("magic-link tokens", () => {
  it("generateMagicToken returns 43-char base64url from 32 random bytes", () => {
    const tokens = new Set(Array.from({ length: 30 }, () => generateMagicToken()));
    expect(tokens.size).toBe(30);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("hashMagicToken is the SHA-256 hex digest, never the raw token", () => {
    const t = generateMagicToken();
    const h = hashMagicToken(t);
    expect(h).not.toBe(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashMagicToken(t));
  });

  it("issueMagicLink persists only the hash, never the raw token", async () => {
    await issueMagicLink({ email: "alice@example.com" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/INSERT INTO auth_magic_links/);
    // params order: [id, email, token_hash, expires_at, ipHash, userAgent]
    expect(params[1]).toBe("alice@example.com");
    expect(params[2]).toMatch(/^[0-9a-f]{64}$/);
    expect(params[2]).not.toContain("alice");
  });
});

describe("consumeMagicLink atomicity", () => {
  function claimOnce(opts: {
    claimed: boolean;
    user?: { id: string; email: string; display_name: string | null; tier: "free" | "pro" | "studio"; inserted: boolean };
  }) {
    return (q: string): Promise<DbResult> => {
      if (q.includes("UPDATE auth_magic_links") && q.includes("consumed_at = NOW")) {
        return opts.claimed
          ? Promise.resolve({ rows: [{ id: "ml_1", email: "alice@example.com" }], rowCount: 1 })
          : Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (q.includes("INSERT INTO auth_users")) {
        return Promise.resolve({ rows: [opts.user], rowCount: 1 });
      }
      if (q.includes("UPDATE auth_magic_links SET user_id")) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    };
  }

  it("returns the user when the claim succeeds and marks the token consumed", async () => {
    queryMock.mockImplementation(
      claimOnce({
        claimed: true,
        user: { id: "u_1", email: "alice@example.com", display_name: null, tier: "free", inserted: true },
      }),
    );
    const u = await consumeMagicLink(generateMagicToken());
    expect(u).not.toBeNull();
    expect(u!.email).toBe("alice@example.com");
    expect(u!.isNewUser).toBe(true);
    // Three queries: claim, upsert, backfill user_id.
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("returns null on a second consume of the same token (single-use)", async () => {
    let consumed = false;
    queryMock.mockImplementation((q: string): Promise<DbResult> => {
      if (q.includes("UPDATE auth_magic_links") && q.includes("consumed_at = NOW")) {
        if (consumed) return Promise.resolve({ rows: [], rowCount: 0 });
        consumed = true;
        return Promise.resolve({ rows: [{ id: "ml_1", email: "alice@example.com" }], rowCount: 1 });
      }
      if (q.includes("INSERT INTO auth_users")) {
        return Promise.resolve({
          rows: [{ id: "u_1", email: "alice@example.com", display_name: null, tier: "free", inserted: false }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    const token = generateMagicToken();
    const first = await consumeMagicLink(token);
    const second = await consumeMagicLink(token);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("returns null when the claim UPDATE matches zero rows", async () => {
    queryMock.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }));
    const result = await consumeMagicLink(generateMagicToken());
    expect(result).toBeNull();
  });
});

describe("session ids", () => {
  it("generateSessionId is 43-char base64url and hashSessionId is SHA-256 hex", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateSessionId()));
    expect(ids.size).toBe(20);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(hashSessionId(id)).toMatch(/^[0-9a-f]{64}$/);
      expect(hashSessionId(id)).not.toContain(id);
    }
  });

  it("SESSION_COOKIE defaults to pathos.sid so old clients can be migrated later", () => {
    expect(SESSION_COOKIE).toBe("pathos.sid");
  });

  it("createSession stores only the hash, then revokeSession deletes by id", async () => {
    await createSession({ userId: "u_1" });
    const insertCall = queryMock.mock.calls[0] as [string, string[]];
    expect(insertCall[0]).toMatch(/INSERT INTO auth_sessions/);
    expect(insertCall[1][1]).toBe("u_1");
    expect(insertCall[1][2]).toMatch(/^[0-9a-f]{64}$/);
    expect(insertCall[1][2]).not.toBe(insertCall[1][0]);
    await revokeSession("sid-xyz");
    const delCall = queryMock.mock.calls[1] as [string, string[]];
    expect(delCall[0]).toMatch(/DELETE FROM auth_sessions/);
    expect(delCall[1][0]).toBe("sid-xyz");
  });
});

describe("findSessionUser lookup", () => {
  function lookupResponder(opts: {
    foundUser?: { id: string; email: string; display_name: string | null; tier: "free" | "pro" | "studio" };
    expired?: boolean;
  }) {
    return (q: string): Promise<DbResult> => {
      if (q.includes("SELECT u.id, u.email") && q.includes("FROM auth_sessions s")) {
        if (opts.expired) return Promise.resolve({ rows: [], rowCount: 0 });
        if (opts.foundUser) return Promise.resolve({ rows: [opts.foundUser], rowCount: 1 });
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (q.includes("UPDATE auth_sessions SET last_used_at")) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    };
  }

  it("returns the bound user when the hash matches and session is live", async () => {
    queryMock.mockImplementation(
      lookupResponder({
        foundUser: { id: "u_a", email: "a@example.com", display_name: "Alice", tier: "free" },
      }),
    );
    const u = await findSessionUser(generateSessionId());
    expect(u).not.toBeNull();
    expect(u!.id).toBe("u_a");
    expect(u!.tier).toBe("free");
  });

  it("returns null when the join finds zero rows (expired or revoked)", async () => {
    queryMock.mockImplementation(lookupResponder({ expired: true }));
    expect(await findSessionUser(generateSessionId())).toBeNull();
  });

  it("scopes the lookup by both id and hash so a token swap cannot cross users", async () => {
    queryMock.mockImplementation(
      lookupResponder({
        foundUser: { id: "u_a", email: "a@example.com", display_name: null, tier: "pro" },
      }),
    );
    const sid = generateSessionId();
    await findSessionUser(sid);
    const selectCall = queryMock.mock.calls[0] as [string, string[]];
    expect(selectCall[1][0]).toBe(sid);
    expect(selectCall[1][1]).toBe(hashSessionId(sid));
  });
});

describe("ConsoleMailer", () => {
  it("send does not throw and logs the subject and recipient", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const m = new ConsoleMailer();
    await expect(
      m.send({ to: "x@y.z", subject: "hi", text: "body" }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("getMailer returns a cached instance", () => {
    const a = getMailer();
    const b = getMailer();
    expect(a).toBe(b);
  });
});
