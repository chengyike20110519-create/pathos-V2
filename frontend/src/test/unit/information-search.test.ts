import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db")>();
  return {
    ...actual,
    getPool: () => ({ query: queryMock }),
  };
});

import { GET } from "@/app/api/information/search/route";
import { DatabaseNotConfiguredError } from "@/server/db";
import {
  SEARCH_TARGET_MS,
  escapeLike,
  globalSearch,
  listHotNoResultQueries,
  normalizeSearchQuery,
  searchMajorDefinitions,
  searchQueryKey,
} from "@/server/information/search-service";

function queryResult(rows: unknown[] = []) {
  return { rows };
}

function mockSuccessfulSearch() {
  queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM universities") && sql.includes("search_text")) {
      return queryResult([
        {
          id: "princeton-university",
          name: "Princeton University",
          chinese_name: "普林斯顿大学",
          city: "Princeton",
          state: "NJ",
          country: "United States",
          payload: { topPrograms: ["Public Policy"] },
          rank: 0.9,
        },
      ]);
    }
    if (sql.includes("GROUP BY city, state")) {
      return queryResult([{ city: "Princeton", state: "NJ", university_count: 1 }]);
    }
    if (sql.includes("FROM facts")) {
      return queryResult([
        {
          id: "fact_deadline",
          entity_type: "university",
          entity_id: "princeton-university",
          field_key: "deadline.regular_decision",
          value_type: "date",
          value_number: null,
          value_text: "2027-01-01",
          value_boolean: null,
          value_range_min: null,
          value_range_max: null,
          value_list: null,
          academic_year: "2026-2027",
          source_url: "https://example.edu",
          retrieved_at: new Date("2026-10-01T00:00:00Z"),
          rank: 0.8,
        },
      ]);
    }
    if (sql.includes("FROM information_events")) {
      return queryResult([
        {
          id: "event_policy",
          event_type: "admission_policy",
          title: "Princeton updates testing policy",
          summary: "The policy changes beginning with the 2027 cycle.",
          entity_type: "university",
          entity_id: "princeton-university",
          source_url: "https://example.edu",
          published_at: new Date("2026-10-02T00:00:00Z"),
          rank: 0.7,
        },
      ]);
    }
    if (sql.includes("INSERT INTO search_queries")) {
      return queryResult([{ request_count: 3, no_result_count: 1 }]);
    }
    if (sql.includes("INSERT INTO search_query_runs")) return queryResult([]);
    throw new Error(`Unexpected SQL in test: ${sql} ${JSON.stringify(params)}`);
  });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("search query normalization", () => {
  it("normalizes whitespace, caps length, and lowercases a stable key", () => {
    expect(normalizeSearchQuery("  Princeton    University  ")).toBe("Princeton University");
    expect(normalizeSearchQuery("x".repeat(120))).toHaveLength(100);
    expect(searchQueryKey(" 数据 科学 ")).toBe("数据 科学");
    expect(escapeLike("50%_\\")).toBe("50\\%\\_\\\\");
  });
});

describe("global search service", () => {
  it("searches local major profiles without touching the database", () => {
    const results = searchMajorDefinitions("computer");
    expect(results[0]).toMatchObject({
      id: "major:computer-science",
      title: "计算机科学",
      href: "/majors/computer-science",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns typed groups and records query statistics", async () => {
    mockSuccessfulSearch();
    const result = await globalSearch("Princeton", 8);

    expect(result.groups.universities[0]).toMatchObject({
      type: "university",
      title: "普林斯顿大学",
      href: "/university/princeton-university",
    });
    expect(result.groups.locations[0]).toMatchObject({
      type: "location",
      title: "Princeton, NJ",
    });
    expect(result.groups.facts[0]).toMatchObject({
      type: "fact",
      title: "deadline.regular_decision",
      badge: "Approved fact",
    });
    expect(result.groups.events[0]).toMatchObject({
      type: "event",
      title: "Princeton updates testing policy",
    });
    expect(result.total).toBe(4);
    expect(result.stats.missRecorded).toBe(false);
    expect(result.stats.noResultCount).toBe(1);

    const factSql = queryMock.mock.calls.find(([sql]) => String(sql).includes("FROM facts"))?.[0];
    expect(String(factSql)).toContain("review_status = 'approved'");
    expect(String(factSql)).toContain("effective_to IS NULL OR effective_to >= NOW()");
    const eventSql = queryMock.mock.calls
      .find(([sql]) => String(sql).includes("FROM information_events"))?.[0];
    expect(String(eventSql)).toContain("is_published = TRUE");
  });

  it("starts the four bounded search branches before awaiting any branch", async () => {
    mockSuccessfulSearch();
    const pending = globalSearch("Princeton", 5);
    expect(queryMock).toHaveBeenCalledTimes(4);
    const result = await pending;
    expect(queryMock).toHaveBeenCalledTimes(6);
    expect(result.stats.missRecorded).toBe(false);
    for (const [sql, params] of queryMock.mock.calls.slice(0, 4)) {
      expect(String(sql)).toMatch(/LIMIT \$[123]/);
      expect(params).toContain(5);
    }
  });

  it("persists a no-result query and returns its repeat count", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO search_queries")) {
        return queryResult([{ request_count: 4, no_result_count: 4 }]);
      }
      if (sql.includes("INSERT INTO search_query_runs")) return queryResult([]);
      return queryResult([]);
    });
    const result = await globalSearch("完全不存在的关键词", 4);

    expect(result.total).toBe(0);
    expect(result.stats.missRecorded).toBe(true);
    expect(result.stats.noResultCount).toBe(4);
    const recordCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO search_query_runs"),
    );
    expect(recordCall?.[1]).toEqual(["完全不存在的关键词", 0, expect.any(Number)]);
    const aggregateCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO search_queries"),
    );
    expect(String(aggregateCall?.[1]?.[3])).toContain('"university":0');
  });

  it("lists hot no-result queries for the data-gap queue", async () => {
    queryMock.mockResolvedValue(
      queryResult([{ query: "机器人学费", requests: 6, last_seen_at: new Date("2026-10-15T00:00:00Z") }]),
    );
    const result = await listHotNoResultQueries(3, 30);

    expect(result).toEqual([
      { query: "机器人学费", requests: 6, lastSeenAt: "2026-10-15T00:00:00.000Z" },
    ]);
    expect(queryMock.mock.calls[0][1]).toEqual([30, 3]);
  });
});

describe("GET /api/information/search", () => {
  it("returns no-store results with observable timing", async () => {
    mockSuccessfulSearch();
    const response = await GET(
      new Request("http://pathos.local/api/information/search?q=Princeton&limit=8"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("server-timing")).toMatch(/^global-search;dur=\d+(\.\d+)?$/);
    expect(response.headers.get("x-pathos-search-target-ms")).toBe(String(SEARCH_TARGET_MS));
    expect(body.ok).toBe(true);
    expect(body.stats.targetMs).toBe(500);
    expect(body.stats.withinTarget).toBe(true);
  });

  it("validates query and limit before touching the database", async () => {
    const short = await GET(new Request("http://pathos.local/api/information/search?q=P"));
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ code: "INVALID_SEARCH_QUERY" });

    const invalidLimit = await GET(
      new Request("http://pathos.local/api/information/search?q=Princeton&limit=21"),
    );
    expect(invalidLimit.status).toBe(400);
    expect(await invalidLimit.json()).toMatchObject({ code: "INVALID_SEARCH_LIMIT" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the information schema is unavailable", async () => {
    queryMock.mockRejectedValue(new Error('relation "search_queries" does not exist'));
    const response = await GET(
      new Request("http://pathos.local/api/information/search?q=Princeton"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.code).toBe("INFORMATION_SCHEMA_NOT_READY");
  });

  it("maps an unconfigured database to its typed error", async () => {
    queryMock.mockRejectedValue(new DatabaseNotConfiguredError());
    const response = await GET(
      new Request("http://pathos.local/api/information/search?q=Princeton"),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "DATABASE_NOT_CONFIGURED" });
  });

  it("maps a malformed DATABASE_URL to a clear 503 instead of a generic crash", async () => {
    const invalidUrl = new Error("Invalid URL") as NodeJS.ErrnoException;
    invalidUrl.code = "ERR_INVALID_URL";
    queryMock.mockRejectedValue(invalidUrl);
    const response = await GET(
      new Request("http://pathos.local/api/information/search?q=Princeton"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.code).toBe("DATABASE_NOT_CONFIGURED");
    expect(body.message).toContain("DATABASE_URL");
  });
});

describe("search SQL index design", () => {
  it("defines indexed bounded retrieval for schools, facts, events, and misses", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "db/migrations/011-information-search.sql"),
      "utf8",
    );
    for (const name of [
      "idx_universities_city_trgm",
      "idx_universities_state_trgm",
      "idx_facts_public_search_fts",
      "idx_facts_public_search_trgm",
      "idx_information_events_search_fts",
      "idx_information_events_search_trgm",
      "idx_search_queries_hot_misses",
    ]) {
      expect(sql).toContain(name);
    }
    expect(sql).toContain("USING GIN");
    expect(sql).toContain("WHERE review_status = 'approved'");
    expect(sql).toContain("WHERE is_published = TRUE");
    expect(sql).toContain("search_query_runs");
  });
});
