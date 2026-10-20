// Coverage for Phase 1.7 -- minimal event tracking.
//
// What we are locking down here:
//   - TRACK_EVENT_TYPES is the canonical whitelist of acceptable
//     event types; anything else is silently 204-ed by the route.
//   - isTrackEventType is a strict type guard.
//   - hashIpForTrack applies the salt, truncates to 32 hex, and
//     returns null when no IP is present.
//   - recordTrackEvent INSERTs into track_events with sane truncation.
//   - clampString trims, caps length, and rejects empty strings.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DbResult = { rows: unknown[]; rowCount: number };
const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _params: unknown[]): Promise<DbResult> =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  ),
);
function mockQuery(impl: (q: string, p: unknown[]) => Promise<DbResult>): void {
  queryMock.mockImplementation(impl);
}

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
}));

import {
  TRACK_EVENT_TYPES,
  clampString,
  hashIpForTrack,
  isTrackEventType,
  recordTrackEvent,
} from "@/lib/track";

beforeEach(() => {
  queryMock.mockReset();
  mockQuery(async () => ({ rows: [], rowCount: 0 }));
});

afterEach(() => {
  queryMock.mockReset();
});

describe("taxonomy", () => {
  it("isTrackEventType accepts only canonical values", () => {
    for (const t of TRACK_EVENT_TYPES) expect(isTrackEventType(t)).toBe(true);
    expect(isTrackEventType("VIEW")).toBe(false);
    expect(isTrackEventType("custom_event")).toBe(false);
    expect(isTrackEventType(null)).toBe(false);
    expect(isTrackEventType(undefined)).toBe(false);
    expect(isTrackEventType(42)).toBe(false);
  });

  it("TRACK_EVENT_TYPES contains the four core types plus the two report/lead hooks", () => {
    expect(TRACK_EVENT_TYPES).toContain("view");
    expect(TRACK_EVENT_TYPES).toContain("click");
    expect(TRACK_EVENT_TYPES).toContain("conversion");
    expect(TRACK_EVENT_TYPES).toContain("share_open");
    expect(TRACK_EVENT_TYPES).toContain("report_generated");
    expect(TRACK_EVENT_TYPES).toContain("lead_captured");
  });
});

describe("clampString", () => {
  it("returns undefined for non-strings", () => {
    expect(clampString(null, 10)).toBeUndefined();
    expect(clampString(42, 10)).toBeUndefined();
    expect(clampString(undefined, 10)).toBeUndefined();
    expect(clampString({}, 10)).toBeUndefined();
  });

  it("trims and caps", () => {
    expect(clampString("  hello  ", 10)).toBe("hello");
    expect(clampString("a".repeat(20), 5)).toBe("aaaaa");
  });

  it("returns undefined for empty after trim", () => {
    expect(clampString("   ", 10)).toBeUndefined();
    expect(clampString("", 10)).toBeUndefined();
  });
});

describe("hashIpForTrack", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/track", { headers });
  }

  it("returns null when no IP headers are present", () => {
    expect(hashIpForTrack(req({}))).toBeNull();
  });

  it("prefers x-forwarded-for first hop and truncates to 32 hex chars", () => {
    const h = hashIpForTrack(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }));
    expect(h).not.toBeNull();
    expect(h!).toMatch(/^[0-9a-f]{32}$/);
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const h = hashIpForTrack(req({ "x-real-ip": "9.9.9.9" }));
    expect(h).not.toBeNull();
    expect(h!).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("recordTrackEvent", () => {
  it("INSERTs into track_events and returns the id", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/INSERT INTO track_events/);
      expect(q).toMatch(/RETURNING id/);
      expect(p[0]).toBe("click");
      expect(p[1]).toBe("/reports/rpt_1");
      return Promise.resolve({ rows: [{ id: "12345" }], rowCount: 1 });
    });
    const out = await recordTrackEvent({
      type: "click",
      path: "/reports/rpt_1",
      meta: { tag: "share" },
      userId: "u_1",
      ipHash: "abcd",
      userAgent: "Mozilla/5.0",
    });
    expect(out).not.toBeNull();
    expect(out!.id).toBe(12345);
  });

  it("truncates path to 256 chars", async () => {
    const longPath = "/" + "x".repeat(400);
    mockQuery(async (_q, p) => {
      expect(String(p[1]).length).toBe(256);
      return Promise.resolve({ rows: [{ id: "1" }], rowCount: 1 });
    });
    await recordTrackEvent({
      type: "view",
      path: longPath,
    });
  });

  it("clamps meta to <= 2048 bytes", async () => {
    const huge = { blob: "x".repeat(5000) };
    mockQuery(async (_q, p) => {
      expect(String(p[2]).length).toBeLessThanOrEqual(2048);
      return Promise.resolve({ rows: [{ id: "1" }], rowCount: 1 });
    });
    await recordTrackEvent({
      type: "click",
      meta: huge,
    });
  });

  it("returns null when the DB returns no row", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    const out = await recordTrackEvent({ type: "view" });
    expect(out).toBeNull();
  });
});
