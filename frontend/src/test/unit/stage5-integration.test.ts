import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeStage5Detail,
  normalizeStage5StatusDictionary,
  normalizeStage5Summary,
  parseStage5Detail,
  parseStage5Manifest,
  parseStage5RegionEnvelope,
  parseStage5SourceIndex,
  parseStage5Summaries,
} from "@/schemas/stage5-preview.schema";
import { PreviewApiDataSource } from "@/services/preview-api-data-source";
import { parseUniversitySummary } from "@/schemas/dataset.schema";
import {
  createPreviewRouteHandler,
  resolveDataMode,
} from "@/server/pathos-preview";
import { resetPreviewCacheForTests } from "@/server/backend-preview";
import { handleAiContextRoute } from "@/server/ai-context";
import { DatabaseNotConfiguredError } from "@/server/db";

const BUNDLE_ROOT = process.env.PATHOS_PREVIEW_BUNDLE_DIR
  ? path.resolve(process.env.PATHOS_PREVIEW_BUNDLE_DIR)
  : path.resolve(process.cwd(), "data/preview");

async function artifact<T = unknown>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(BUNDLE_ROOT, name), "utf8")) as T;
}


const queryMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db")>();
  return {
    ...actual,
    getPool: () => ({
      query: (query: string, params?: unknown[]) => queryMock(query, params),
    }),
  };
});

interface BackendStore {
  manifest: Record<string, any>;
  summaries: Array<Record<string, any>>;
  details: Record<string, Record<string, any>>;
  sourceIndex: Record<string, any>;
  region: Record<string, any>;
  statuses: Record<string, any>;
}

let backendStorePromise: Promise<BackendStore> | null = null;

function loadBackendStore(): Promise<BackendStore> {
  backendStorePromise ??= (async () => {
    const summaries = await artifact<Array<Record<string, any>>>("universities.json");
    const manifest = await artifact<Record<string, any>>("manifest.json");
    const detailSlugs = Object.keys(manifest.artifactHashes ?? {})
      .filter((key) => key.startsWith("university-details/candidate-v2/"))
      .map((key) => key.slice("university-details/candidate-v2/".length).replace(/\.json$/, ""));
    const detailEntries = await Promise.all(
      detailSlugs.map(async (slug) => [
        `candidate-v2:${slug}`,
        await artifact<Record<string, any>>(`university-details/candidate-v2/${slug}.json`),
      ] as const),
    );
    return {
      manifest,
      summaries,
      details: Object.fromEntries(detailEntries),
      sourceIndex: await artifact("source-index.json"),
      region: await artifact("region-metrics.json"),
      statuses: await artifact("status-dictionary.json"),
    };
  })();
  return backendStorePromise;
}

async function defaultBackendQuery(
  query: string,
  params: unknown[] = [],
): Promise<{ rows: any[] }> {
  const store = await loadBackendStore();
  if (query.includes("FROM manifest")) {
    return { rows: [{ payload: store.manifest }] };
  }
  if (query.includes("FROM university_details")) {
    return {
      rows: [{
        payload: store.details[String(params[0])],
        detail_source_index: store.sourceIndex,
        source_index_present: true,
      }],
    };
  }
  if (query.includes("FROM source_index")) {
    return { rows: [{ payload: store.sourceIndex }] };
  }
  if (query.includes("FROM region_envelope")) {
    return { rows: [{ payload: store.region }] };
  }
  if (query.includes("FROM status_dictionary")) {
    return {
      rows: Object.entries(store.statuses).map(([code, payload]) => ({ code, payload })),
    };
  }
  if (query.includes("FROM universities")) {
    if (query.includes("search_text")) {
      const needle = String(params[0]).toLowerCase();
      const rows = store.summaries
        .map((summary) => {
          const detail = store.details[summary.id];
          const haystack = [
            summary.name,
            summary.chineseName,
            summary.city,
            summary.state,
            summary.region,
            ...(summary.aliases ?? []),
            ...(summary.topPrograms ?? []),
            ...(detail?.allMajors ?? []).flatMap((major: { name?: string; displayName?: string }) => [major.name, major.displayName]),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle) ? { payload: summary } : null;
        })
        .filter(Boolean);
      return { rows };
    }
    return { rows: store.summaries.map((payload) => ({ payload })) };
  }
  throw new Error(`Unexpected Stage5 backend query: ${query}`);
}

async function realFixture() {
  const manifest = parseStage5Manifest(await artifact("manifest.json"));
  const summaries = parseStage5Summaries(await artifact("universities.json"));
  const detail = parseStage5Detail(
    await artifact(
      "university-details/candidate-v2/arizona-state-university.json",
    ),
  );
  const sourceIndex = parseStage5SourceIndex(await artifact("source-index.json"));
  return { manifest, summaries, detail, sourceIndex };
}

function env(mode: "fixture" | "backend", bundleDir = BUNDLE_ROOT) {
  return {
    NODE_ENV: "test",
    PATHOS_DATA_MODE: mode,
    PATHOS_PREVIEW_BUNDLE_DIR: bundleDir,
  } as NodeJS.ProcessEnv;
}

describe("Stage 5 frontend/backend integration contract", () => {
  beforeEach(() => {
    queryMock.mockImplementation(defaultBackendQuery);
    resetPreviewCacheForTests();
  });

  it("01 backend DataSource success", async () => {
    const handler = createPreviewRouteHandler(env("backend"));
    const response = await handler(
      new Request("http://localhost/api/pathos/preview?endpoint=universities"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(94);
  });

  it("02 fixture DataSource success", async () => {
    const handler = createPreviewRouteHandler(env("fixture"));
    const response = await handler(
      new Request("http://localhost/api/pathos/preview?endpoint=universities"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).length).toBeGreaterThan(0);
  });

  it("03 explicit mode selection", () => {
    expect(resolveDataMode(env("fixture"))).toBe("fixture");
    expect(resolveDataMode(env("backend"))).toBe("backend");
    expect(resolveDataMode({ NODE_ENV: "production" })).toBe("backend");
  });

  it("04 backend database unavailable has no fixture fallback", async () => {
    queryMock.mockRejectedValue(new DatabaseNotConfiguredError());
    const response = await createPreviewRouteHandler(
      env("backend"),
    )(new Request("http://localhost/api/pathos/preview?endpoint=universities"));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("DATABASE_NOT_CONFIGURED");
    expect(response.headers.get("X-PathOS-Data-Mode")).toBe("backend");
  });

  it("05 timeout has no fallback", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pending = new PreviewApiDataSource("/api/pathos/preview", 5).getManifest();
    const rejection = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("06 backend 500 has no fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("failure", { status: 500 })));
    await expect(new PreviewApiDataSource().getManifest()).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
    });
    vi.unstubAllGlobals();
  });

  it("07 detail 404 has no fallback", async () => {
    queryMock.mockImplementation(async (query, params = []) => {
      if (query.includes("FROM university_details")) return { rows: [] };
      return defaultBackendQuery(query, params);
    });
    const handler = createPreviewRouteHandler(env("backend"));
    const response = await handler(
      new Request(
        "http://localhost/api/pathos/preview?endpoint=university&id=candidate-v2:missing",
      ),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("UNIVERSITY_NOT_FOUND");
  });

  it("07b encoded dynamic-route IDs resolve exactly once", async () => {
    const handler = createPreviewRouteHandler(env("backend"));
    const response = await handler(
      new Request(
        "http://localhost/api/pathos/preview?endpoint=university&id=candidate-v2%253Aarizona-state-university",
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe("candidate-v2:arizona-state-university");
  });

  it("08 connection refused has no fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(new PreviewApiDataSource().getManifest()).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
    });
    vi.unstubAllGlobals();
  });

  it("09 invalid JSON has no fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{", { status: 200 })));
    await expect(new PreviewApiDataSource().getManifest()).rejects.toMatchObject({
      code: "INVALID_JSON",
    });
    vi.unstubAllGlobals();
  });

  it("10 schema invalid has no fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ nope: true })));
    await expect(new PreviewApiDataSource().getManifest()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    vi.unstubAllGlobals();
  });

  it("10b unknown field status is rejected", async () => {
    const detail = await artifact<any>(
      "university-details/candidate-v2/harvard-university.json",
    );
    for (const invalidStatus of ["invented_status", 42, null]) {
      expect(() =>
        parseStage5Detail({
          ...detail,
          enrollment: {
            ...detail.enrollment,
            undergraduate: {
              ...detail.enrollment.undergraduate,
              status: invalidStatus,
            },
          },
        }),
      ).toThrow(/status/);
    }
  });

  it("11 missing manifest row has no fallback", async () => {
    queryMock.mockImplementation(async (query, params = []) => {
      if (query.includes("FROM manifest")) return { rows: [] };
      return defaultBackendQuery(query, params);
    });
    const response = await createPreviewRouteHandler(
      env("backend"),
    )(new Request("http://localhost/api/pathos/preview?endpoint=manifest"));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("BUNDLE_ARTIFACT_MISSING");
  });

  it("12 unsupported contract version has no fallback", () => {
    expect(() =>
      parseStage5Manifest({
        ...(require(path.join(BUNDLE_ROOT, "manifest.json")) as object),
        contractVersion: "unsupported",
      }),
    ).toThrow(/contractVersion/);
  });

  it("13 Summary schema normalization", async () => {
    const { summaries } = await realFixture();
    const normalized = normalizeStage5Summary(summaries[0]);
    expect(normalized.id).toMatch(/^candidate-v2:/);
    expect(normalized.rankingTier).toMatch(/top20|top50|top100|other/);
  });

  it("14 Detail schema normalization", async () => {
    const { detail, sourceIndex } = await realFixture();
    const normalized = normalizeStage5Detail(detail, sourceIndex);
    expect(normalized.id).toBe(detail.id);
    expect(normalized.programs.length).toBeGreaterThan(0);
  });

  it("15 status mapping", () => {
    expect(
      normalizeStage5StatusDictionary({
        statuses: { pending_external_access: "pending" },
      }).pending_external_access.consumerLabel,
    ).toBe("数据补充中");
  });

  it("16 warning mapping", async () => {
    const { summaries } = await realFixture();
    expect(normalizeStage5Summary(summaries[0]).qualitySummary?.warningCodes?.length).toBeGreaterThan(0);
  });

  it("17 source mapping", async () => {
    const { detail, sourceIndex } = await realFixture();
    const normalized = normalizeStage5Detail(detail, sourceIndex);
    expect(normalized.sources.every((source) => source.url.startsWith("http"))).toBe(true);
    expect(
      normalized.sources.every(
        (source) =>
          source.status === "live_verified_exact" ||
          source.status === "live_verified_normalized",
      ),
    ).toBe(true);
  });

  it("18 null preservation", async () => {
    const rows = parseStage5Summaries(await artifact("universities.json"));
    const raw = rows.find((row) => row.rankingSummary.nationalRank === null)!;
    const normalized = normalizeStage5Summary(raw);
    expect(normalized.rankingSummary?.nationalRank).toBeNull();
    expect(normalized.nationalRanking).toBeUndefined();
    expect(parseUniversitySummary(normalized).nationalRanking).toBeUndefined();
  });

  it("19 enrollment year warning", async () => {
    const detail = parseStage5Detail(
      await artifact("university-details/candidate-v2/harvard-university.json"),
    );
    const normalized = normalizeStage5Detail(
      detail,
      parseStage5SourceIndex(await artifact("source-index.json")),
    );
    expect(normalized.previewMetadata!.enrollment.undergraduate.referenceYear).toBe(2019);
    expect(normalized.previewMetadata!.enrollment.undergraduate.warnings).toContain("stale_reference_year");
  });

  it("20 rank null semantics", async () => {
    const rows = parseStage5Summaries(await artifact("universities.json"));
    const raw = rows.find((row) => row.rankingSummary.nationalRank === null)!;
    expect(raw.rankingSummary.filterBehavior).toBe("exclude_from_numeric_range");
  });

  it("21 SAT/ACT not_reported", async () => {
    const manifest = await artifact<Record<string, any>>("manifest.json");
    const detailPaths = Object.keys(manifest.artifactHashes)
      .filter((key) => key.startsWith("university-details/candidate-v2/"));
    const details = await Promise.all(
      detailPaths.map((name) => artifact<Record<string, unknown>>(name)),
    );
    expect(details.filter((d: any) => d.admissions.sat.status === "not_reported")).toHaveLength(9);
    expect(details.filter((d: any) => d.admissions.act.status === "not_reported")).toHaveLength(9);
  });

  it("22 test policy pending", async () => {
    const { detail } = await realFixture();
    expect(detail.admissions.testPolicy).toMatchObject({
      value: null,
      status: "pending_external_access",
    });
  });

  it("23 English policy pending", async () => {
    const { detail } = await realFixture();
    expect(detail.admissions.englishPolicy).toMatchObject({
      value: null,
      status: "pending_external_access",
    });
  });

  it("24 county scope", async () => {
    const detail = parseStage5Detail(
      await artifact("university-details/candidate-v2/harvey-mudd-college.json"),
    );
    expect(["place", "county"]).toContain(detail.geography.geographyScope);
    const all = await artifact<Array<{ id: string }>>("universities.json");
    let county = 0;
    const manifest = await artifact<Record<string, any>>("manifest.json");
    const detailPaths = Object.keys(manifest.artifactHashes)
      .filter((key) => key.startsWith("university-details/candidate-v2/"));
    for (const name of detailPaths) {
      const row = await artifact<any>(name);
      if (row.geography.geographyScope === "county") county += 1;
    }
    expect(county).toBe(16);
  });

  it("24b all-major gaps preserve not-reported semantics", async () => {
    // A missing directory is a deliberate test fixture. ASU now has reviewed
    // program data and must not be forced back to the original empty snapshot.
    const raw = await artifact<Record<string, unknown>>("university-details/candidate-v2/arizona-state-university.json");
    const detail = parseStage5Detail({ ...raw, allMajors: [], allMajorsStatus: {
      status: "not_reported", nullReason: "identity_ipeds_match_not_resolved",
    } });
    const normalized = normalizeStage5Detail(
      detail,
      parseStage5SourceIndex(await artifact("source-index.json")),
    );
    expect(normalized.previewMetadata?.allMajors).toEqual([]);
    expect(normalized.previewMetadata?.allMajorsStatus).toEqual({
      status: "not_reported",
      nullReason: "identity_ipeds_match_not_resolved",
    });
  });

  it("25 source_review_not_completed remains a gap", async () => {
    const { detail } = await realFixture();
    expect(detail.programPeopleGaps.every((gap) => gap.status === "source_review_not_completed")).toBe(true);
  });

  it("26 quarantined people are excluded", async () => {
    const { detail, sourceIndex } = await realFixture();
    expect(normalizeStage5Detail(detail, sourceIndex).people.every((person) => !person.quarantined)).toBe(true);
  });

  it("27 region metrics blocked", async () => {
    const region = parseStage5RegionEnvelope(await artifact("region-metrics.json"));
    expect(region).toMatchObject({
      status: "blocked",
      records: [],
      choroplethEnabled: false,
      disabledReason: expect.any(String),
      metricMetadata: expect.any(Array),
    });
    const response = await createPreviewRouteHandler(env("backend"))(
      new Request("http://localhost/api/pathos/preview?endpoint=region-metrics"),
    );
    expect(await response.json()).toMatchObject({
      status: "blocked",
      records: [],
      choroplethEnabled: false,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(region)));
    await expect(
      new PreviewApiDataSource().getRegionMetrics({
        metricId: "income",
        granularity: "state",
      }),
    ).resolves.toEqual([]);
    vi.unstubAllGlobals();
  });

  it("28 choropleth disabled", async () => {
    const region = parseStage5RegionEnvelope(await artifact("region-metrics.json"));
    expect(region.choroplethEnabled).toBe(false);
  });

  it("29 AI context disabled", async () => {
    const response = await handleAiContextRoute(
      new Request("http://localhost/api/ai/context", {
        method: "POST",
        body: JSON.stringify({ schoolIds: ["candidate-v2:harvard-university"] }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "AI_CONTEXT_DISABLED",
      retryable: false,
    });
  });

  it("30 source index resolution", async () => {
    const { sourceIndex } = await realFixture();
    expect(sourceIndex.sources.length).toBeGreaterThan(0);
    expect(new Set(sourceIndex.sources.map((source) => source.sourceId)).size).toBe(sourceIndex.sources.length);
  });

  it("31 Summary/Detail consistency", async () => {
    const { summaries, detail } = await realFixture();
    const summary = summaries.find((row) => row.id === detail.id)!;
    expect([detail.name, detail.nameZh, detail.latitude, detail.longitude]).toEqual([
      summary.name,
      summary.nameZh,
      summary.latitude,
      summary.longitude,
    ]);
  });

  it("31b backend search covers region and top programs", async () => {
    const handler = createPreviewRouteHandler(env("backend"));
    for (const [query, expectedId] of [
      ["Southwest", "candidate-v2:arizona-state-university"],
      ["Supply Chain Management", "candidate-v2:arizona-state-university"],
      ["Symbolic Systems", "candidate-v2:stanford-university"],
    ]) {
      const response = await handler(
        new Request(
          `http://localhost/api/pathos/preview?endpoint=search&q=${encodeURIComponent(query)}`,
        ),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            university: expect.objectContaining({
              id: expectedId,
            }),
          }),
        ]),
      );
    }
  });

  it("32 invalid coordinates are rejected", async () => {
    const rows = await artifact<any[]>("universities.json");
    expect(() => parseStage5Summaries([{ ...rows[0], latitude: 91 }])).toThrow(/latitude/);
    expect(() => parseStage5Summaries([{ ...rows[0], latitude: 0, longitude: 0 }])).toThrow(/0,0/);
  });

  it("33 duplicate IDs are rejected", async () => {
    const rows = await artifact<any[]>("universities.json");
    expect(() => parseStage5Summaries([rows[0], rows[0]])).toThrow(/duplicate/);
  });

  it("34 production mode prohibits fixture", () => {
    expect(() =>
      resolveDataMode({ NODE_ENV: "production", PATHOS_DATA_MODE: "fixture" }),
    ).toThrow(/fixture/);
  });
});
