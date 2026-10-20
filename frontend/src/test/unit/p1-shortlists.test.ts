// Coverage for Phase 1.3 shortlist + reach/match/safety bucketing.
//
// What we are locking down here:
//   - isShortlistBucket is a strict type guard; any other string
//     (including an empty string) is rejected.
//   - SHORTLIST_BUCKETS lists all three buckets in the canonical
//     order so the board UI can iterate without reordering.
//   - createShortlist trims the name so trailing whitespace does not
//     produce visually-duplicate rows.
//   - listShortlistsForUser issues a SELECT (no mutation).
//   - getShortlist returns null on miss, the row on hit.
//   - getShortlistGrouped partitions items by bucket using an empty
//     array as the default; it never drops or duplicates rows.
//   - addShortlistItem short-circuits on a missing university with
//     UnknownUniversityError (status 404), and on a duplicate with
//     DuplicateItemError (status 409).
//   - addShortlistItem maps a pg SQLSTATE 23505 race to the same
//     DuplicateItemError code so concurrent inserts surface a
//     consistent error.
//   - changeShortlistItemBucket and removeShortlistItem scope by
//     (itemId, shortlistId) so a stray id cannot mutate a row from
//     a different list.
//   - touchShortlist runs an unconditional UPDATE; the list page
//     uses updated_at as the sort key.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DbResult = { rows: unknown[]; rowCount: number };
import {
  addShortlistItem,
  changeShortlistItemBucket,
  createShortlist,
  DuplicateItemError,
  getShortlist,
  getShortlistGrouped,
  isShortlistBucket,
  listShortlistItems,
  listShortlistsForUser,
  removeShortlistItem,
  SHORTLIST_BUCKETS,
  touchShortlist,
  UnknownUniversityError,
} from "@/lib/shortlists";

type QueryFn = (q: string, p: unknown[]) => Promise<DbResult>;
type QueryMock = import('vitest').Mock<QueryFn>;
const queryMock: QueryMock = vi.hoisted(() => vi.fn() as unknown as QueryMock);
function mockQuery(impl: (q: string, p: unknown[]) => Promise<DbResult>): void {
  queryMock.mockImplementation(impl);
}


vi.mock("@/server/db", () => ({
  getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
}));

function shortlistRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sl_1",
    owner_user_id: "u_1",
    name: "Fall 2027",
    season: null,
    notes: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-02T00:00:00Z"),
    ...extra,
  };
}

function itemRow(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "it_1",
    shortlist_id: "sl_1",
    university_id: "uni_1",
    bucket: "reach",
    notes: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    university_name: "Stanford University",
    university_chinese_name: "斯坦福大学",
    ...extra,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  mockQuery(
    () => Promise.resolve({ rows: [], rowCount: 0 }) as Promise<DbResult>,
  );
});

afterEach(() => {
  queryMock.mockReset();
});

describe("bucket taxonomy", () => {
  it("isShortlistBucket only accepts the three canonical values", () => {
    expect(isShortlistBucket("reach")).toBe(true);
    expect(isShortlistBucket("match")).toBe(true);
    expect(isShortlistBucket("safety")).toBe(true);
    expect(isShortlistBucket("REACH")).toBe(false);
    expect(isShortlistBucket("")).toBe(false);
    expect(isShortlistBucket(null)).toBe(false);
    expect(isShortlistBucket(undefined)).toBe(false);
    expect(isShortlistBucket(42)).toBe(false);
    expect(isShortlistBucket({})).toBe(false);
  });

  it("SHORTLIST_BUCKETS lists reach/match/safety in that order", () => {
    expect(SHORTLIST_BUCKETS).toEqual(["reach", "match", "safety"]);
  });
});

describe("createShortlist", () => {
  it("INSERTs a new shortlist owned by the caller and trims the name", async () => {
    mockQuery(async (_q, p) => ({
      rows: [
        {
          id: String(p[0]),
          owner_user_id: String(p[1]),
          name: String(p[2]),
          season: p[3] === undefined ? null : String(p[3]),
          notes: p[4] === undefined ? null : String(p[4]),
          created_at: new Date("2026-01-01T00:00:00Z"),
          updated_at: new Date("2026-01-02T00:00:00Z"),
        },
      ],
      rowCount: 1,
    }));
    const list = await createShortlist({
      ownerUserId: "u_1",
      name: "  Fall 2027  ",
      season: "fall-2027",
      notes: "primary",
    });
    expect(list.name).toBe("Fall 2027");
    expect(list.ownerUserId).toBe("u_1");
    expect(list.season).toBe("fall-2027");
    expect(list.notes).toBe("primary");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO shortlists/);
    expect(String(params[1])).toBe("u_1");
    expect(String(params[2])).toBe("Fall 2027");
  });
});

describe("listShortlistsForUser", () => {
  it("issues a single SELECT keyed by the caller", async () => {
    mockQuery(async (_q, _p) => ({
      rows: [shortlistRow(), shortlistRow({ id: "sl_2", name: "ED" })],
      rowCount: 2,
    }));
    const out = await listShortlistsForUser("u_1");
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("sl_1");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/SELECT[\s\S]*FROM shortlists/);
    expect(sql).toMatch(/ORDER BY updated_at DESC/);
    expect(params[0]).toBe("u_1");
  });
});

describe("getShortlist", () => {
  it("returns the row when present", async () => {
    mockQuery(async (_q, _p) => ({
      rows: [shortlistRow({ name: "ED Round 1" })],
      rowCount: 1,
    }));
    const out = await getShortlist("sl_1");
    expect(out).not.toBeNull();
    expect(out!.name).toBe("ED Round 1");
  });

  it("returns null when the row is missing", async () => {
    mockQuery(async (_q, _p) => ({ rows: [], rowCount: 0 }));
    expect(await getShortlist("nope")).toBeNull();
  });
});

describe("listShortlistItems + getShortlistGrouped", () => {
  it("groups rows into reach/match/safety preserving empty buckets", async () => {
    mockQuery(async (_q, _p) => ({
      rows: [
        itemRow({ id: "a", bucket: "reach", university_id: "u_a", university_name: "A" }),
        itemRow({ id: "b", bucket: "match", university_id: "u_b", university_name: "B" }),
        itemRow({ id: "c", bucket: "safety", university_id: "u_c", university_name: "C" }),
      ],
      rowCount: 3,
    }));
    const groups = await getShortlistGrouped("sl_1");
    expect(groups.reach.map((i) => i.universityName)).toEqual(["A"]);
    expect(groups.match.map((i) => i.universityName)).toEqual(["B"]);
    expect(groups.safety.map((i) => i.universityName)).toEqual(["C"]);
  });

  it("returns three empty arrays when the shortlist has no items", async () => {
    mockQuery(async (_q, _p) => ({ rows: [], rowCount: 0 }));
    const groups = await getShortlistGrouped("sl_empty");
    expect(groups).toEqual({ reach: [], match: [], safety: [] });
  });

  it("exposes chinese_name alongside the canonical name", async () => {
    mockQuery(async (_q, _p) => ({
      rows: [
        itemRow({
          id: "it_cn",
          university_id: "u_cn",
          university_name: "Peking University",
          university_chinese_name: "北京大学",
        }),
      ],
      rowCount: 1,
    }));
    const items = await listShortlistItems("sl_1");
    expect(items[0].universityName).toBe("Peking University");
    expect(items[0].universityChineseName).toBe("北京大学");
  });
});

describe("addShortlistItem error mapping", () => {
  it("throws UnknownUniversityError (404) when the university is missing", async () => {
    mockQuery(async (_q, _p) => ({ rows: [], rowCount: 0 }));
    await expect(
      addShortlistItem({ shortlistId: "sl_1", universityId: "ghost", bucket: "reach" }),
    ).rejects.toBeInstanceOf(UnknownUniversityError);
    let caught: UnknownUniversityError | undefined;
    try {
      await addShortlistItem({ shortlistId: "sl_1", universityId: "ghost", bucket: "reach" });
    } catch (e) {
      caught = e as UnknownUniversityError;
    }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe("UNKNOWN_UNIVERSITY");
    expect(caught!.status).toBe(404);
  });

  it("throws DuplicateItemError (409) when the (shortlist, university) pair already exists", async () => {
    mockQuery(async (q) => {
      if (q.includes("SELECT id FROM universities")) {
        return Promise.resolve({ rows: [{ id: "uni_1" }], rowCount: 1 });
      }
      if (q.includes("SELECT id FROM shortlist_items")) {
        return Promise.resolve({ rows: [{ id: "it_x" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    let caught: DuplicateItemError | undefined;
    try {
      await addShortlistItem({ shortlistId: "sl_1", universityId: "uni_1", bucket: "match" });
    } catch (e) {
      caught = e as DuplicateItemError;
    }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe("DUPLICATE_ITEM");
    expect(caught!.status).toBe(409);
  });

  it("maps a pg SQLSTATE 23505 race to DuplicateItemError", async () => {
    mockQuery(async (q) => {
      if (q.includes("SELECT id FROM universities")) {
        return Promise.resolve({ rows: [{ id: "uni_1" }], rowCount: 1 });
      }
      if (q.includes("SELECT id FROM shortlist_items")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (q.includes("INSERT INTO shortlist_items")) {
        const err = new Error("duplicate key value violates unique constraint") as Error & { code?: string };
        err.code = "23505";
        throw err;
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    await expect(
      addShortlistItem({ shortlistId: "sl_1", universityId: "uni_1", bucket: "safety" }),
    ).rejects.toBeInstanceOf(DuplicateItemError);
  });

  it("INSERTs and returns the row on the happy path", async () => {
    mockQuery(async (q, p) => {
      if (q.includes("SELECT id FROM universities")) {
        return Promise.resolve({ rows: [{ id: "uni_1" }], rowCount: 1 });
      }
      if (q.includes("SELECT id FROM shortlist_items")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (q.includes("INSERT INTO shortlist_items")) {
        return Promise.resolve({
          rows: [
            {
              id: String(p[0]),
              shortlist_id: String(p[1]),
              university_id: String(p[2]),
              bucket: p[3] as string,
              notes: p[4] ?? null,
              created_at: new Date("2026-02-01T00:00:00Z"),
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const item = await addShortlistItem({
      shortlistId: "sl_1",
      universityId: "uni_1",
      bucket: "reach",
      notes: "first choice",
    });
    expect(item.shortlistId).toBe("sl_1");
    expect(item.universityId).toBe("uni_1");
    expect(item.bucket).toBe("reach");
    expect(item.notes).toBe("first choice");
    expect(item.createdAt).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("changeShortlistItemBucket", () => {
  it("scopes the UPDATE by (itemId, shortlistId) and emits the new bucket", async () => {
    mockQuery(async (_q, _p) => ({ rows: [], rowCount: 1 }));
    await changeShortlistItemBucket({
      itemId: "it_1",
      shortlistId: "sl_1",
      bucket: "safety",
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE shortlist_items/);
    expect(sql).toMatch(/SET bucket/);
    expect(params).toEqual(["it_1", "sl_1", "safety"]);
  });
});

describe("removeShortlistItem", () => {
  it("scopes the DELETE by (itemId, shortlistId)", async () => {
    mockQuery(async (_q, _p) => ({ rows: [], rowCount: 1 }));
    await removeShortlistItem({ itemId: "it_1", shortlistId: "sl_1" });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/DELETE FROM shortlist_items/);
    expect(params).toEqual(["it_1", "sl_1"]);
  });
});

describe("touchShortlist", () => {
  it("bumps updated_at via an unconditional UPDATE", async () => {
    mockQuery(async (_q, _p) => ({ rows: [], rowCount: 1 }));
    await touchShortlist("sl_1");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE shortlists SET updated_at = NOW\(\)/);
    expect(params).toEqual(["sl_1"]);
  });
});
