import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UniversitySummary } from "@/domain/dataset";
import type { Fact } from "@/domain/information/fact";
import {
  comparisonRowsForPerspective,
  comparisonToCsv,
  createUniversityComparison,
} from "@/domain/information/comparison";

const aggregateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/information/fact-repository", () => ({
  listApprovedFacts: aggregateMock,
}));

import { GET } from "@/app/api/information/compare/route";

const ROOT = resolve(__dirname, "../../..");

const NOW = "2026-10-15T08:00:00.000Z";

function university(id: string, extra: Partial<UniversitySummary> = {}): UniversitySummary {
  return {
    id,
    name: id.toUpperCase() + " University",
    nameZh: id.toUpperCase() + " 大学",
    chineseName: id.toUpperCase() + " 大学",
    latitude: 38,
    longitude: -97,
    displayTier: "preview",
    previewOnly: true,
    datasetVersion: "test",
    nullableFields: [],
    ...extra,
  };
}

function fact(extra: Partial<Fact> = {}): Fact {
  return {
    entityType: "university",
    entityId: "a",
    fieldKey: "admission.acceptance_rate",
    valueType: "percent",
    valueNumber: 8,
    academicYear: "2026-2027",
    applicantScope: "international",
    sourceId: "source_a",
    sourceUrl: "https://a.example/admissions",
    retrievedAt: NOW,
    reviewedAt: NOW,
    reviewStatus: "approved",
    confidence: "high",
    nullReason: null,
    notes: null,
    id: "fact_a",
    factKey: "fact-key-a",
    currentRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function request(query: string): Request {
  return new Request(`http://localhost/api/information/compare${query}`);
}

beforeEach(() => {
  aggregateMock.mockReset();
});

describe("comparison domain", () => {
  it("creates all six decision perspectives", () => {
    const model = createUniversityComparison({ universities: [] });
    const perspectives = new Set(model.rows.map(row => row.perspective));
    expect(perspectives).toEqual(new Set([
      "admission",
      "cost",
      "outcome",
      "program",
      "location",
      "deadline",
    ]));
  });

  it("uses approved facts over preview fields and keeps source inspection visible", () => {
    const model = createUniversityComparison({
      universities: [
        university("a", { acceptanceRate: 20 }),
        university("b", { acceptanceRate: 30 }),
      ],
      factsByUniversity: {
        a: [fact()],
        b: [fact({
          id: "fact_b",
          entityId: "b",
          valueNumber: 12,
          sourceId: "source_b",
          sourceUrl: "https://b.example/admissions",
        })],
      },
    });
    const row = comparisonRowsForPerspective(model, "admission")
      .find(item => item.id === "acceptance_rate");
    expect(row?.cells.map(cell => cell.value)).toEqual(["8%", "12%"]);
    expect(row?.cells.every(cell => cell.source.kind === "approved_fact")).toBe(true);
    expect(row?.cells[0].source.url).toBe("https://a.example/admissions");
    expect(row?.sourceMismatch).toBe(true);
  });

  it("keeps missing values explicit and marks numeric best and extreme values", () => {
    const model = createUniversityComparison({
      universities: [
        university("a", { sat25: 1400, sat75: 1550 }),
        university("b", { sat25: 1450 }),
        university("c", {}),
      ],
    });
    const sat25 = comparisonRowsForPerspective(model, "admission")
      .find(row => row.id === "sat_25");
    expect(sat25?.cells[2].value).toBeNull();
    expect(sat25?.cells[2].missingReason).toBe("not_collected");
    expect(sat25?.cells[1].isBest).toBe(true);
    expect(sat25?.cells[0].isExtreme).toBe(true);
    expect(sat25?.cells[2].isBest || sat25?.cells[2].isExtreme).toBe(false);
  });

  it("flags mixed academic years while preserving each cell year", () => {
    const model = createUniversityComparison({
      universities: [university("a"), university("b")],
      factsByUniversity: {
        a: [fact({ fieldKey: "cost.tuition", valueType: "currency", valueNumber: 50000, currency: "USD" })],
        b: [fact({
          entityId: "b",
          fieldKey: "cost.tuition",
          valueType: "currency",
          valueNumber: 52000,
          currency: "USD",
          academicYear: "2025-2026",
        })],
      },
    });
    const tuition = comparisonRowsForPerspective(model, "cost")
      .find(row => row.id === "tuition");
    expect(tuition?.yearMismatch).toBe(true);
    expect(tuition?.cells.map(cell => cell.academicYear)).toEqual(["2026-2027", "2025-2026"]);
  });

  it("exports a UTF-8 CSV with warnings and escaped field labels", () => {
    const model = createUniversityComparison({
      universities: [university("a"), university("b")],
    });
    const csv = comparisonToCsv(model);
    expect(csv.split("\n")[0]).toContain('"视角","字段","A 大学","B 大学","学年口径一致","来源口径一致","单位口径一致"');
    expect(csv).toContain('"未采集"');
  });
});

describe("GET /api/information/compare", () => {
  it("validates comparison size before touching the fact repository", async () => {
    const response = await GET(request("?ids=a"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_COMPARISON_SIZE" });
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it("normalizes and queries approved facts for each university", async () => {
    aggregateMock.mockImplementation(async (query: { entityType?: string }) =>
      query.entityType === "university" ? [fact()] : [],
    );
    const response = await GET(request("?ids=a,b&academicYear=2026/27"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(aggregateMock).toHaveBeenCalledWith({
      entityType: "university",
      entityId: "a",
      academicYear: "2026-2027",
    });
    expect(aggregateMock).toHaveBeenCalledWith({
      entityType: "university",
      entityId: "b",
      academicYear: "2026-2027",
    });
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.factsByUniversity.a).toHaveLength(1);
  });

  it("fails closed when the information schema is not ready", async () => {
    aggregateMock.mockRejectedValue(new Error('relation "facts" does not exist'));
    const response = await GET(request("?ids=a,b"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "INFORMATION_SCHEMA_NOT_READY" });
  });
});

describe("comparison route integration", () => {
  it("mounts the canonical comparison workspace and routes legacy entries to it", () => {
    const page = readFileSync(resolve(ROOT, "src/app/compare/page.tsx"), "utf8");
    const nav = readFileSync(resolve(ROOT, "src/components/NavBar.tsx"), "utf8");
    const detail = readFileSync(
      resolve(ROOT, "src/components/university/UniversityDetailView.tsx"),
      "utf8",
    );
    const sitemap = readFileSync(
      resolve(ROOT, "src/app/sitemap.xml/route.ts"),
      "utf8",
    );
    expect(page).toContain("ComparisonMatrix");
    expect(nav).toContain('href: "/compare"');
    expect(detail).toContain('href="/compare"');
    expect(sitemap).toContain('"/compare"');
  });
});
