// Coverage for the P0 security primitives: report share tokens, the
// fail-closed rate limiter, and migration readiness.
//
// These are the boundaries that keep student data (grades, background,
// target schools) off the open internet and keep a paid AI endpoint
// metered, so the properties below are asserted directly rather than
// inferred from the calling routes.

import { describe, expect, it, vi, afterEach } from "vitest";

import {
  extractReportToken,
  generateReportToken,
  hashToken,
  hashesMatch,
  hashIp,
} from "@/lib/report-access";
import { clientKey, consumeRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getContactChannels, getCommercialCapabilities } from "@/lib/contact";
import {
  EXPECTED_MIGRATIONS,
  evaluateSchemaReadiness,
} from "@/lib/schema-version";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: queryMock }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  queryMock.mockReset();
  vi.restoreAllMocks();
});

describe("report share tokens", () => {
  it("derives the token from randomness, never from the report id", () => {
    // The historical vulnerability was token === reportId, which made
    // every report readable to anyone who saw an id in a log or URL.
    const reportId = "rep_abc123";
    const { token } = generateReportToken();
    expect(token).not.toBe(reportId);
    expect(token).not.toContain(reportId);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("issues a distinct token on every call", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateReportToken().token),
    );
    expect(tokens.size).toBe(50);
  });

  it("returns a hash that matches the token and is not the token", () => {
    const { token, hash } = generateReportToken();
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compares equal hashes and rejects mismatched or malformed ones", () => {
    const { token, hash } = generateReportToken();
    const other = generateReportToken();
    expect(hashesMatch(hash, hashToken(token))).toBe(true);
    expect(hashesMatch(hash, other.hash)).toBe(false);
    expect(hashesMatch(hash, "")).toBe(false);
    expect(hashesMatch(hash, hash.slice(0, 63))).toBe(false);
    expect(hashesMatch("zz", "zz")).toBe(false);
  });

  it("reads the token from the query string or the header, else null", () => {
    const q = new Request("http://localhost/api/reports/rep_1?token=secret-1");
    expect(extractReportToken(q)).toBe("secret-1");

    const h = new Request("http://localhost/api/reports/rep_1", {
      headers: { "x-report-token": "secret-2" },
    });
    expect(extractReportToken(h)).toBe("secret-2");

    const none = new Request("http://localhost/api/reports/rep_1");
    expect(extractReportToken(none)).toBeNull();

    const blank = new Request("http://localhost/api/reports/rep_1?token=%20%20");
    expect(extractReportToken(blank)).toBeNull();
  });
});

describe("client identity hashing", () => {
  it("never returns the raw address", () => {
    const req = new Request("http://localhost/api/reports/generate", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
    });
    const hashed = hashIp(req);
    expect(hashed).not.toBeNull();
    expect(hashed).not.toContain("203.0.113.7");
    expect(hashed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uses the first forwarded hop so a client cannot hide behind a list", () => {
    const salt = "test-salt";
    vi.stubEnv("PATHOS_IP_HASH_SALT", salt);
    const a = hashIp(
      new Request("http://localhost/", {
        headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      }),
    );
    const b = hashIp(
      new Request("http://localhost/", {
        headers: { "x-forwarded-for": "203.0.113.7, 198.51.100.9" },
      }),
    );
    expect(a).toBe(b);
  });

  it("separates identities by salt so buckets and audit rows cannot be correlated", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(clientKey(req, "reports")).not.toBe(clientKey(req, "apikey"));
  });

  it("returns null when no address header is present", () => {
    expect(hashIp(new Request("http://localhost/"))).toBeNull();
  });
});

describe("rate limit retry hint", () => {
  it("always advertises at least one second, even for a past window", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(retryAfterSeconds(past)).toBe(1);
  });

  it("rounds up to whole seconds", () => {
    const soon = new Date(Date.now() + 2_400).toISOString();
    expect(retryAfterSeconds(soon)).toBe(3);
  });
});

describe("schema readiness", () => {
  it("is ready only once every expected migration is applied", () => {
    const ready = evaluateSchemaReadiness([...EXPECTED_MIGRATIONS]);
    expect(ready.ready).toBe(true);
    expect(ready.missing).toEqual([]);
  });

  it("reports a database that has never been migrated", () => {
    const empty = evaluateSchemaReadiness([]);
    expect(empty.ready).toBe(false);
    expect(empty.missing).toEqual([...EXPECTED_MIGRATIONS]);
  });

  it("stays ready when the database is ahead of this deploy", () => {
    // A newer release may have applied migrations this build does not
    // know about. That is not a reason to report the service unready.
    const ahead = evaluateSchemaReadiness([...EXPECTED_MIGRATIONS, "999-future"]);
    expect(ahead.ready).toBe(true);
    expect(ahead.unknown).toEqual(["999-future"]);
  });
});

describe("rate limit counting", () => {
  function stubHits(hits: number) {
    queryMock.mockResolvedValue({ rows: [{ hits }] });
  }

  it("allows a request at the limit and rejects the one past it", async () => {
    // Keep the opportunistic sweep out of the call count.
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    stubHits(5);
    const atLimit = await consumeRateLimit("reports", "abc", 5);
    expect(atLimit.allowed).toBe(true);
    expect(atLimit.remaining).toBe(0);
    expect(atLimit.degraded).toBe(false);

    stubHits(6);
    const over = await consumeRateLimit("reports", "abc", 5);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("returns a reset timestamp in the future so Retry-After is usable", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    stubHits(1);
    const res = await consumeRateLimit("reports", "abc", 5);
    expect(new Date(res.resetsAt).getTime()).toBeGreaterThan(Date.now());
    expect(retryAfterSeconds(res.resetsAt)).toBeGreaterThanOrEqual(1);
  });

  it("scopes counters per identity and per minute window", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    stubHits(1);
    await consumeRateLimit("reports", "identity-a", 5);
    const firstKey = queryMock.mock.calls[0]?.[1]?.[0] as string;
    queryMock.mockClear();
    await consumeRateLimit("reports", "identity-b", 5);
    const secondKey = queryMock.mock.calls[0]?.[1]?.[0] as string;

    expect(firstKey).toContain("reports:identity-a:");
    expect(secondKey).toContain("reports:identity-b:");
    expect(firstKey).not.toBe(secondKey);
    // Trailing window stamp is YYYYMMDDHHmm, so buckets expire on their own.
    expect(firstKey.split(":").pop()).toMatch(/^\d{12}$/);
  });
});

describe("rate limit failure policy", () => {
  it("fails CLOSED when the counter store is unreachable", async () => {
    // A paid endpoint must not become unmetered because Postgres blipped.
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockRejectedValue(new Error("connection refused"));

    const res = await consumeRateLimit("reports", "abc", 5);
    expect(res.allowed).toBe(false);
    expect(res.degraded).toBe(true);
    expect(res.remaining).toBe(0);
  });

  it("fails open only when the caller explicitly opts in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryMock.mockRejectedValue(new Error("connection refused"));

    const res = await consumeRateLimit("reports", "abc", 5, { failOpen: true });
    expect(res.allowed).toBe(true);
    expect(res.degraded).toBe(true);
  });

  it("treats a missing row as over the limit rather than as zero hits", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    queryMock.mockResolvedValue({ rows: [] });

    const res = await consumeRateLimit("reports", "abc", 5);
    expect(res.allowed).toBe(false);
  });
});

describe("contact channels", () => {
  it("renders nothing when no channel is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WECHAT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_WECHAT_QR_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PHONE", "");

    const channels = getContactChannels();
    expect(channels.hasAnyChannel).toBe(false);
    expect(channels.email).toBeNull();
  });

  it("filters placeholder values so users never see a dead address", () => {
    // A paying customer will actually email support@pathos.example.
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@pathos.example");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WECHAT_ID", "changeme");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PHONE", "TODO");

    const channels = getContactChannels();
    expect(channels.email).toBeNull();
    expect(channels.wechatId).toBeNull();
    expect(channels.phone).toBeNull();
    expect(channels.hasAnyChannel).toBe(false);
  });

  it("passes through a real address and trims whitespace", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "  hello@pathos.cn  ");
    const channels = getContactChannels();
    expect(channels.email).toBe("hello@pathos.cn");
    expect(channels.hasAnyChannel).toBe(true);
  });
});

describe("commercial capability flags", () => {
  it("defaults every unbacked capability to off", () => {
    vi.stubEnv("PATHOS_FEATURE_ONLINE_PAYMENT", "");
    vi.stubEnv("PATHOS_FEATURE_INVOICES", "");
    vi.stubEnv("PATHOS_FEATURE_WEBHOOKS", "");
    vi.stubEnv("PATHOS_FEATURE_SELF_SERVE_API_KEYS", "");

    expect(getCommercialCapabilities()).toEqual({
      onlinePayment: false,
      invoices: false,
      webhooks: false,
      selfServeApiKeys: false,
    });
  });

  it("only accepts an explicit true, so a typo cannot promise invoices", () => {
    vi.stubEnv("PATHOS_FEATURE_INVOICES", "yes");
    expect(getCommercialCapabilities().invoices).toBe(false);

    vi.stubEnv("PATHOS_FEATURE_INVOICES", "1");
    expect(getCommercialCapabilities().invoices).toBe(false);

    vi.stubEnv("PATHOS_FEATURE_INVOICES", "TRUE");
    expect(getCommercialCapabilities().invoices).toBe(true);
  });
});
