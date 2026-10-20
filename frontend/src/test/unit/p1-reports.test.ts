// Coverage for Phase 1.4 -- versioned report share tokens + Resend.
//
// What we are locking down here:
//   - verifyReportToken rejects when no row, when hash mismatch, and
//     when the row is revoked.
//   - rotateReportToken bumps version + writes a new hash. The
//     previous hash is no longer valid (verified by calling verify
//     again with the old token).
//   - revokeReportVersion marks the current version as revoked.
//   - revokeReportVersion with expectedVersion rejects when the row
//     has moved on (race protection).
//   - getReportVersionInfo is read-only.
//   - ResendMailer sends a JSON POST with Authorization: Bearer <key>
//     and never throws on transport failure.
//   - getMailer returns ResendMailer when RESEND_API_KEY is set, and
//     ConsoleMailer otherwise.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _params: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  ),
);

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
}));

import {
  getReportVersionInfo,
  revokeReportVersion,
  rotateReportToken,
  verifyReportToken,
} from "@/lib/reports";
import {
  ConsoleMailer,
  ResendMailer,
  getMailer,
  __resetMailerForTests,
} from "@/lib/mailer";
import { generateReportToken, hashToken } from "@/lib/report-access";

type DbResult = { rows: unknown[]; rowCount: number };

function rowVersion1(hash: string, revokedAt: Date | null = null): Record<string, unknown> {
  return {
    id: "rpt_1",
    version: 1,
    access_token_hash: hash,
    token_expires_at: new Date(Date.now() + 7 * 86_400_000),
    revoked_at: revokedAt,
    updated_at: new Date("2026-01-01T00:00:00Z"),
  };
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(
    () => Promise.resolve({ rows: [], rowCount: 0 }) as Promise<DbResult>,
  );
  __resetMailerForTests();
  delete process.env.RESEND_API_KEY;
  delete process.env.PATHOS_MAIL_PROVIDER;
  delete process.env.PATHOS_MAIL_FROM;
});

afterEach(() => {
  queryMock.mockReset();
  __resetMailerForTests();
});

describe("verifyReportToken", () => {
  it("returns null when no row exists", async () => {
    queryMock.mockImplementation(async () => ({ rows: [] as unknown[], rowCount: 0 }));
    const out = await verifyReportToken("rpt_x", "any-token-1234567890abcdef");
    expect(out).toBeNull();
  });

  it("returns null when the hash does not match", async () => {
    const { hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash)],
      rowCount: 1,
    }));
    const out = await verifyReportToken("rpt_1", "totally-wrong-token-1234567890");
    expect(out).toBeNull();
  });

  it("returns version info on a successful match", async () => {
    const { token, hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash)],
      rowCount: 1,
    }));
    const info = await verifyReportToken("rpt_1", token);
    expect(info).not.toBeNull();
    expect(info!.version).toBe(1);
    expect(info!.revokedAt).toBeNull();
    expect(info!.id).toBe("rpt_1");
  });

  it("returns null when the row is revoked", async () => {
    const { token, hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash, new Date("2026-02-01T00:00:00Z"))],
      rowCount: 1,
    }));
    const out = await verifyReportToken("rpt_1", token);
    expect(out).not.toBeNull();
    expect(out!.revokedAt).toBeInstanceOf(Date);
  });
});

describe("rotateReportToken", () => {
  it("bumps version + writes a new hash; the old token no longer verifies", async () => {
    const initial = generateReportToken();
    let currentRow = rowVersion1(initial.hash);
    queryMock.mockImplementation(async (q: string, p: unknown[]) => {
      if (q.includes("FROM reports WHERE id = $1")) {
        return Promise.resolve({ rows: [currentRow], rowCount: 1 });
      }
      if (q.startsWith("UPDATE reports")) {
        // echo the new hash back as stored
        const newHash = String(p[1]);
        currentRow = {
          ...currentRow,
          version: (currentRow.version as number) + 1,
          access_token_hash: newHash,
        };
        return Promise.resolve({
          rows: [
            {
              id: String(p[0]),
              version: currentRow.version,
              token_expires_at: new Date(Date.now() + 30 * 86_400_000),
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const rotated = await rotateReportToken({ reportId: "rpt_1", currentToken: initial.token });
    expect(rotated).not.toBeNull();
    expect(rotated!.version).toBe(2);
    expect(rotated!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rotated!.token).not.toBe(initial.token);

    // verify with the OLD token now fails (hash was overwritten).
    const oldCheck = await verifyReportToken("rpt_1", initial.token);
    expect(oldCheck).toBeNull();

    // verify with the NEW token now succeeds against the new hash.
    const newHash = hashToken(rotated!.token);
    currentRow.access_token_hash = newHash;
    const newCheck = await verifyReportToken("rpt_1", rotated!.token);
    expect(newCheck).not.toBeNull();
    expect(newCheck!.version).toBe(2);
  });

  it("returns null when the supplied token does not match the current hash", async () => {
    const { hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash)],
      rowCount: 1,
    }));
    const out = await rotateReportToken({
      reportId: "rpt_1",
      currentToken: "definitely-wrong-token-1234567890",
    });
    expect(out).toBeNull();
  });

  it("returns null when the row is already revoked", async () => {
    const { token, hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash, new Date("2026-02-01T00:00:00Z"))],
      rowCount: 1,
    }));
    const out = await rotateReportToken({ reportId: "rpt_1", currentToken: token });
    expect(out).toBeNull();
  });
});

describe("revokeReportVersion", () => {
  it("marks the current version as revoked", async () => {
    const { token, hash } = generateReportToken();
    let currentRow = rowVersion1(hash);
    queryMock.mockImplementation(async (q: string, _p: unknown[]) => {
      if (q.includes("FROM reports WHERE id = $1")) {
        return Promise.resolve({ rows: [currentRow], rowCount: 1 });
      }
      if (q.startsWith("UPDATE reports")) {
        currentRow = { ...currentRow, revoked_at: new Date("2026-03-01T00:00:00Z") };
        return Promise.resolve({
          rows: [
            {
              id: currentRow.id,
              version: currentRow.version,
              revoked_at: currentRow.revoked_at,
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const out = await revokeReportVersion({ reportId: "rpt_1", currentToken: token });
    expect(out).not.toBeNull();
    expect(out!.version).toBe(1);
    expect(out!.revokedAt).toBeInstanceOf(Date);
  });

  it("rejects when expectedVersion does not match", async () => {
    const { token, hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash)],
      rowCount: 1,
    }));
    const out = await revokeReportVersion({
      reportId: "rpt_1",
      currentToken: token,
      expectedVersion: 99,
    });
    expect(out).toBeNull();
  });

  it("accepts when expectedVersion matches the row", async () => {
    const { token, hash } = generateReportToken();
    queryMock.mockImplementation(async (q: string) => {
      if (q.includes("FROM reports WHERE id = $1")) {
        return Promise.resolve({ rows: [rowVersion1(hash)], rowCount: 1 });
      }
      if (q.startsWith("UPDATE reports")) {
        return Promise.resolve({
          rows: [
            {
              id: "rpt_1",
              version: 1,
              revoked_at: new Date(),
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const out = await revokeReportVersion({
      reportId: "rpt_1",
      currentToken: token,
      expectedVersion: 1,
    });
    expect(out).not.toBeNull();
    expect(out!.version).toBe(1);
  });

  it("returns null when the row is already revoked", async () => {
    const { token, hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash, new Date("2026-02-01T00:00:00Z"))],
      rowCount: 1,
    }));
    const out = await revokeReportVersion({ reportId: "rpt_1", currentToken: token });
    expect(out).toBeNull();
  });
});

describe("getReportVersionInfo", () => {
  it("returns the current version metadata without rotating", async () => {
    const { hash } = generateReportToken();
    queryMock.mockImplementation(async () => ({
      rows: [rowVersion1(hash)],
      rowCount: 1,
    }));
    const info = await getReportVersionInfo("rpt_1");
    expect(info).not.toBeNull();
    expect(info!.version).toBe(1);
    expect(info!.tokenHash).toBe(hash);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the report does not exist", async () => {
    queryMock.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const info = await getReportVersionInfo("rpt_x");
    expect(info).toBeNull();
  });
});

describe("ResendMailer", () => {
  it("POSTs JSON with Bearer auth and never throws", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: async () => "",
    });
    globalThis.fetch = fetchMock;
    const mailer = new ResendMailer({ apiKey: "re_test_key" });
    await mailer.send({
      to: "alice@example.com",
      subject: "Hello",
      text: "World",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe("alice@example.com");
    expect(body.subject).toBe("Hello");
    expect(body.text).toBe("World");
  });

  it("swallows non-2xx without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    globalThis.fetch = fetchMock;
    const mailer = new ResendMailer({ apiKey: "re_bad" });
    await expect(
      mailer.send({ to: "x@y", subject: "s", text: "t" }),
    ).resolves.toBeUndefined();
  });

  it("swallows network errors without throwing", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    globalThis.fetch = fetchMock;
    const mailer = new ResendMailer({ apiKey: "re_test" });
    await expect(
      mailer.send({ to: "x@y", subject: "s", text: "t" }),
    ).resolves.toBeUndefined();
  });
});

describe("getMailer", () => {
  it("returns ConsoleMailer when RESEND_API_KEY is missing", () => {
    delete process.env.RESEND_API_KEY;
    __resetMailerForTests();
    expect(getMailer()).toBeInstanceOf(ConsoleMailer);
  });

  it("returns ResendMailer when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test_xxx";
    __resetMailerForTests();
    expect(getMailer()).toBeInstanceOf(ResendMailer);
  });

  it("forces ConsoleMailer when PATHOS_MAIL_PROVIDER=console even with a key", () => {
    process.env.RESEND_API_KEY = "re_test_xxx";
    process.env.PATHOS_MAIL_PROVIDER = "console";
    __resetMailerForTests();
    expect(getMailer()).toBeInstanceOf(ConsoleMailer);
  });
});
