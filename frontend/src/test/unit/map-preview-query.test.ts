import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseUniversityDetail, parseUniversitySummaryList } from "@/schemas/dataset.schema";
import { normalizeStage5Summary, parseStage5Detail } from "@/schemas/stage5-preview.schema";
import { mapViewport } from "@/lib/map-viewport";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/server/db", async (original) => ({
  ...await original<typeof import("@/server/db")>(),
  getPool: () => ({ query }),
}));

const storedSchools = JSON.parse(readFileSync("data/preview/universities.json", "utf8"));

describe("map preview query regressions", () => {
  beforeEach(() => {
    vi.resetModules(); // A test must not inherit another request's server cache.
    query.mockReset();
    query.mockResolvedValue({ rows: storedSchools.slice(0, 2).map((payload: unknown) => ({ payload })) });
  });

  async function request(search: string) {
    const { handleBackendPreviewRoute } = await import("@/server/backend-preview");
    return handleBackendPreviewRoute(new Request(`http://localhost/api/pathos/preview?endpoint=universities${search}`), process.env);
  }

  it("state-only requests do not acquire a 0,0 viewport or a one-row limit", async () => {
    const response = await request("&state=CO");
    expect(response.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toContain("latitude BETWEEN");
    expect(sql).toContain("jsonb_build_object");
    expect(sql).not.toContain("SELECT u.payload");
    expect(params).toEqual([["CO"], 250]);
    const rows = parseUniversitySummaryList(await response.json());
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.costSummary).toBeUndefined();
      expect((row.topPrograms ?? []).length).toBeLessThanOrEqual(2);
      expect(row.guidePreview).toBeUndefined();
    }
  });

  it("unfiltered requests use the bounded default instead of silently returning nothing", async () => {
    expect((await request("")).status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([250]);
  });

  it("uses supplied viewport coordinates and caps oversized limits", async () => {
    const response = await request("&west=-110&south=36&east=-102&north=42&limit=9999");
    expect(response.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([-110, -102, 36, 42, 500]);
    expect(query.mock.calls[0][0]).toContain("ORDER BY u.id");
  });

  it("supports a viewport crossing the date line", async () => {
    expect((await request("&west=170&south=-20&east=-170&north=20")).status).toBe(200);
    expect(query.mock.calls[0][0]).toContain("longitude >= $1 OR longitude <= $2");
  });

  it.each([
    "&west=-110", "&west=nope&south=0&east=1&north=10",
    "&west=-181&south=0&east=1&north=10", "&west=-110&south=42&east=-102&north=36",
    "&limit=nope",
  ])("rejects invalid parameters without issuing a database query: %s", async (search) => {
    const response = await request(search);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_MAP_QUERY");
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
    Object.assign(new Error("server starting"), { code: "57P03" }),
    new Error("Connection terminated unexpectedly"),
    new Error("timeout exceeded when trying to connect"),
  ])("reports connection failures as retryable, not as an invalid data contract", async (error) => {
    query.mockRejectedValue(error);
    const response = await request("&state=CO");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BACKEND_UNAVAILABLE", retryable: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("coalesces concurrent summary requests and caches the successful result", async () => {
    await Promise.all([request("&state=CO"), request("&state=CO")]);
    await request("&state=CO");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed request, allowing Retry to recover", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "ETIMEDOUT" }));
    expect((await request("&state=CO")).status).toBe(503);
    expect((await request("&state=CO")).status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("normalizes world copies when zooming out instead of sending invalid longitudes", () => {
    const bounds = (west: number, east: number) => ({
      getWest: () => west, getEast: () => east,
      getSouth: () => -20, getNorth: () => 70,
    });
    expect(mapViewport(bounds(-220, 220))).toEqual({ west: -180, east: 180, south: -20, north: 70 });
    expect(mapViewport(bounds(170, 190))).toEqual({ west: 170, east: -170, south: -20, north: 70 });
  });

  it("keeps the click-time official snapshot instead of dropping admissions, tuition and dates", () => {
    const detail = parseUniversityDetail({
      ...normalizeStage5Summary(storedSchools[0]),
      officialResearch: {
        provider: "Official source", retrievedOn: "2026-10-16", sourceUrl: "https://example.edu/data",
        acceptanceRate: 0.5, tuitionOutOfState: 40000, undergraduateEnrollment: 20000,
        tuitionInState: null, satMath25: "not reported",
      },
    });
    expect(detail.officialResearch).toMatchObject({
      acceptanceRate: 0.5, tuitionOutOfState: 40000, undergraduateEnrollment: 20000,
      retrievedOn: "2026-10-16", tuitionInState: null, satMath25: null,
    });
  });

  it("normalizes both string and object major lists so card chips have names", () => {
    const detail = parseUniversityDetail({
      ...normalizeStage5Summary(storedSchools[0]),
      previewMetadata: { allMajors: ["Architecture", { name: "Mathematics", displayName: "数学" }, null, ""] },
    });
    expect(detail.previewMetadata?.allMajors?.map((major) => major.displayName)).toEqual(["Architecture", "数学"]);
  });

  it("accepts catalog-confirmed programs while still rejecting invented status values", () => {
    const raw = JSON.parse(readFileSync("data/preview/university-details/candidate-v2/harvard-university.json", "utf8"));
    const program = { ...raw.programs[0], verificationStatus: "confirmed" };
    expect(() => parseStage5Detail({ ...raw, programs: [program] })).not.toThrow();
    expect(() => parseStage5Detail({ ...raw, programs: [{ ...program, verificationStatus: "invented_status" }] })).toThrow(/unknown status/);
  });

  it("loads one school, its projected research fields and its own source index in one round trip", async () => {
    const raw = JSON.parse(readFileSync("data/preview/university-details/candidate-v2/harvard-university.json", "utf8"));
    const sourceIndex = JSON.parse(readFileSync("data/preview/source-index.json", "utf8"));
    query.mockResolvedValue({ rows: [{ payload: raw, confirmed_facts: [], detail_source_index: sourceIndex }] });
    const { handleBackendPreviewRoute } = await import("@/server/backend-preview");
    const response = await handleBackendPreviewRoute(new Request(`http://localhost/api/pathos/preview?endpoint=university&id=${encodeURIComponent(raw.id)}`), process.env);
    expect(response.status).toBe(200);
    expect(parseUniversityDetail(await response.json()).id).toBe(raw.id);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql).not.toContain("r.payload AS research_payload");
    expect(sql).toContain("jsonb_agg(entry.source_doc)");
    expect(sql).toContain("jsonb_path_query(d.payload");
  });

  it("filters directory membership in PostgreSQL while keeping the map payload compact", async () => {
    const response = await request("&program=Symbolic%20Systems&state=CA");
    expect(response.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([["CA"], "Symbolic Systems", 250]);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("pd.university_id = u.id");
    expect(sql).not.toContain("pd.u.payload");
    const rows = await response.json();
    expect(rows.every((row: Record<string, unknown>) => Array.isArray(row.topPrograms) && row.topPrograms.length <= 2)).toBe(true);
  });

  it("keeps program input parameterized, including quotes and SQL-looking text", async () => {
    const program = "x' OR true --";
    await request(`&program=${encodeURIComponent(program)}`);
    expect(query.mock.calls[0][0]).not.toContain(program);
    expect(query.mock.calls[0][1]).toEqual([program, 250]);
  });

  it("escapes search wildcards in the on-demand program picker", async () => {
    query.mockResolvedValue({ rows: [{ name: "Symbolic Systems", schoolCount: 1 }] });
    const { handleBackendPreviewRoute } = await import("@/server/backend-preview");
    const response = await handleBackendPreviewRoute(new Request("http://localhost/api/pathos/preview?endpoint=program-options&q=%25"), process.env);
    expect(response.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual(["%\\%%"]);
    expect(query.mock.calls[0][0]).toContain("count(DISTINCT id)");
  });

  it("rejects overlong program names without querying the database", async () => {
    expect((await request(`&program=${"x".repeat(241)}`)).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
