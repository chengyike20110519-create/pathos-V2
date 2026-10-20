// Coverage for Phase 1.6 -- Lead CRM helpers.
//
// What we are locking down here:
//   - isLeadStatus / isLeadPlan are strict type guards.
//   - LEAD_STATUSES lists every canonical value in the order the
//     CRM UI filter chips expect.
//   - listLeads forwards status + plan + cursor + limit, clamps the
//     limit, and uses keyset pagination on (created_at, id).
//   - listLeads returns nextCursor only when there is a next page.
//   - updateLead refuses unknown status, scopes by id, and bumps
//     updated_at.
//   - getLeadStats counts by status and plan, zero-filling buckets
//     that did not appear in the data.

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
  getLead,
  getLeadStats,
  isLeadPlan,
  isLeadStatus,
  LEAD_PLANS,
  LEAD_STATUSES,
  listLeads,
  updateLead,
} from "@/lib/leads";

function leadRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "lead_1",
    plan: "lead_intake",
    contact_name: "张三",
    phone: "13800000000",
    wechat: "zhangsan",
    email: "zhangsan@example.com",
    company: null,
    notes: null,
    source: "footer",
    status: "new",
    meta: {},
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    ...extra,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  mockQuery(async () => ({ rows: [], rowCount: 0 }));
});

afterEach(() => {
  queryMock.mockReset();
});

describe("taxonomy", () => {
  it("isLeadStatus accepts only canonical values", () => {
    for (const s of LEAD_STATUSES) expect(isLeadStatus(s)).toBe(true);
    expect(isLeadStatus("NEW")).toBe(false);
    expect(isLeadStatus("")).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
    expect(isLeadStatus(undefined)).toBe(false);
    expect(isLeadStatus(42)).toBe(false);
  });

  it("isLeadPlan accepts only canonical plans", () => {
    for (const p of LEAD_PLANS) expect(isLeadPlan(p)).toBe(true);
    expect(isLeadPlan("enterprise")).toBe(false);
    expect(isLeadPlan(null)).toBe(false);
  });

  it("LEAD_STATUSES is in the order the filter chips expect", () => {
    expect(LEAD_STATUSES).toEqual([
      "new",
      "contacted",
      "qualified",
      "converted",
      "lost",
      "closed",
    ]);
  });
});

describe("listLeads", () => {
  it("issues a SELECT with WHERE + ORDER BY + LIMIT +1 for cursor pagination", async () => {
    mockQuery(async () => ({
      rows: [
        leadRow({ id: "lead_a", created_at: new Date("2026-01-02T00:00:00Z") }),
        leadRow({ id: "lead_b", created_at: new Date("2026-01-01T00:00:00Z") }),
      ],
      rowCount: 2,
    }));
    const out = await listLeads({ status: "new", plan: "lead_intake", limit: 25 });
    expect(out.leads).toHaveLength(2);
    expect(out.nextCursor).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/FROM subscription_leads/);
    expect(sql).toMatch(/status = \$1/);
    expect(sql).toMatch(/plan = \$2/);
    expect(sql).toMatch(/ORDER BY created_at DESC, id DESC/);
    // +1 row is requested to detect "has more"
    expect(sql).toMatch(/LIMIT 26/);
    expect(params).toEqual(["new", "lead_intake"]);
  });

  it("returns nextCursor when more rows exist past the page boundary", async () => {
    mockQuery(async () => ({
      rows: [
        leadRow({ id: "lead_a", created_at: new Date("2026-01-02T00:00:00Z") }),
        leadRow({ id: "lead_b", created_at: new Date("2026-01-01T00:00:00Z") }),
        leadRow({ id: "lead_c", created_at: new Date("2026-01-01T00:00:00Z") }),
      ],
      rowCount: 3,
    }));
    const out = await listLeads({ limit: 2 });
    expect(out.leads).toHaveLength(2);
    expect(out.leads.map((l) => l.id)).toEqual(["lead_a", "lead_b"]);
    expect(out.nextCursor).toBe("2026-01-01T00:00:00.000Z");
  });

  it("clamps the limit to a sane window", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    await listLeads({ limit: 9999 });
    const [sql] = queryMock.mock.calls[0] as [string, unknown[]];
    // MAX_LIMIT = 200 -> LIMIT 201 with +1
    expect(sql).toMatch(/LIMIT 201/);
  });

  it("uses default limit when none is given", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    await listLeads();
    const [sql] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/LIMIT 51/);
  });

  it("passes a cursor through to a keyset predicate", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    await listLeads({ cursor: "2026-01-01T00:00:00.000Z" });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/\(created_at, id\) < \(/);
    expect(String(params[0])).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("getLead", () => {
  it("returns null on empty id", async () => {
    expect(await getLead("")).toBeNull();
  });

  it("returns the row mapped to Lead shape", async () => {
    mockQuery(async () => ({ rows: [leadRow()], rowCount: 1 }));
    const out = await getLead("lead_1");
    expect(out).not.toBeNull();
    expect(out!.id).toBe("lead_1");
    expect(out!.contactName).toBe("张三");
    expect(out!.phone).toBe("13800000000");
    expect(out!.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns null when no row", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    expect(await getLead("lead_x")).toBeNull();
  });
});

describe("updateLead", () => {
  it("rejects unknown status", async () => {
    expect(await updateLead("lead_1", { status: "weird" as never })).toBeNull();
  });

  it("updates status with SET status = $1 and bumps updated_at", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/UPDATE subscription_leads/);
      expect(q).toMatch(/status = \$1/);
      expect(q).toMatch(/updated_at = NOW\(\)/);
      expect(String(p[1])).toBe("lead_1");
      return {
        rows: [leadRow({ status: String(p[0]) })],
        rowCount: 1,
      };
    });
    const out = await updateLead("lead_1", { status: "qualified" });
    expect(out).not.toBeNull();
    expect(out!.status).toBe("qualified");
  });

  it("updates notes only", async () => {
    mockQuery(async (q, p) => {
      expect(q).not.toMatch(/status = /);
      expect(q).toMatch(/notes = \$1/);
      return {
        rows: [leadRow({ notes: String(p[0]) })],
        rowCount: 1,
      };
    });
    const out = await updateLead("lead_1", { notes: "called once, follow up Friday" });
    expect(out!.notes).toBe("called once, follow up Friday");
  });

  it("returns null when the row does not exist", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    expect(await updateLead("lead_x", { status: "lost" })).toBeNull();
  });
});

describe("getLeadStats", () => {
  it("zero-fills buckets that did not appear", async () => {
    mockQuery(async () => ({
      rows: [
        { status: "new", plan: "lead_intake", n: 3 },
        { status: "qualified", plan: "single_report", n: 1 },
      ],
      rowCount: 2,
    }));
    const stats = await getLeadStats();
    expect(stats.total).toBe(4);
    expect(stats.byStatus.new).toBe(3);
    expect(stats.byStatus.qualified).toBe(1);
    expect(stats.byStatus.contacted).toBe(0);
    expect(stats.byStatus.converted).toBe(0);
    expect(stats.byStatus.lost).toBe(0);
    expect(stats.byStatus.closed).toBe(0);
    expect(stats.byPlan.lead_intake).toBe(3);
    expect(stats.byPlan.single_report).toBe(1);
    expect(stats.byPlan.advisor_annual).toBe(0);
  });

  it("returns zero stats when there are no leads", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    const stats = await getLeadStats();
    expect(stats.total).toBe(0);
    expect(stats.byStatus.new).toBe(0);
    expect(stats.byPlan.lead_intake).toBe(0);
  });
});
