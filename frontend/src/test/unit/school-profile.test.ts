import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fact } from "@/domain/information/fact";
import {
  createSchoolFactProfile,
  schoolFactLabel,
} from "@/domain/information/school-profile";

const aggregateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/information/aggregate-school", () => ({
  aggregateSchoolProfile: aggregateMock,
}));

import { GET } from "@/app/api/information/facts/route";

const ROOT = resolve(__dirname, "../../..");
const NOW = "2026-10-15T08:00:00.000Z";

function fact(extra: Partial<Fact> = {}): Fact {
  return {
    entityType: "university",
    entityId: "massachusetts-institute-of-technology",
    fieldKey: "admission.acceptance_rate",
    valueType: "percent",
    valueNumber: 4.5,
    academicYear: "2025-2026",
    applicantScope: "all",
    sourceId: "src_1",
    sourceUrl: "https://example.edu/admissions",
    retrievedAt: NOW,
    reviewedAt: NOW,
    reviewStatus: "approved",
    confidence: "high",
    nullReason: null,
    notes: null,
    id: "fact_1",
    factKey: "fact-key-1",
    currentRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

beforeEach(() => {
  aggregateMock.mockReset();
});

afterEach(() => {
  aggregateMock.mockReset();
});

describe("school fact aggregation", () => {
  it("groups approved facts by decision domain and omits empty groups", () => {
    const profile = createSchoolFactProfile("mit", [
      fact({ id: "fact_admission", valueNumber: 4.5 }),
      fact({
        id: "fact_cost",
        fieldKey: "cost.tuition",
        valueType: "currency",
        valueNumber: 58000,
        currency: "USD",
      }),
      fact({
        id: "fact_outcome",
        fieldKey: "outcome.graduation_rate",
        valueType: "percent",
        valueNumber: 92,
      }),
    ]);
    expect(profile.totalFacts).toBe(3);
    expect(profile.groups.map((group) => group.id)).toEqual([
      "admission",
      "cost",
      "outcome",
    ]);
    expect(profile.groups[1].facts[0]).toMatchObject({
      fieldKey: "cost.tuition",
      valueNumber: 58000,
    });
  });

  it("sorts newer academic years first and keeps scopes deterministic", () => {
    const profile = createSchoolFactProfile("mit", [
      fact({ id: "old", academicYear: "2024-2025" }),
      fact({ id: "international", applicantScope: "international" }),
      fact({ id: "all", applicantScope: "all" }),
    ]);
    expect(profile.groups[0].facts.map((item) => item.id)).toEqual([
      "all",
      "international",
      "old",
    ]);
  });

  it("counts explicit missing facts and builds a bounded recent-change list", () => {
    const facts = Array.from({ length: 7 }, (_, index) =>
      fact({
        id: `fact_${index}`,
        fieldKey: `profile.field_${index}`,
        valueType: "number",
        valueNumber: index === 0 ? null : index,
        nullReason: index === 0 ? "not_reported" : null,
        updatedAt: new Date(Date.parse(NOW) + index * 60_000).toISOString(),
        currentRevision: index + 1,
      }),
    );
    const profile = createSchoolFactProfile("mit", facts);
    expect(profile.totalFacts).toBe(7);
    expect(profile.missingFacts).toBe(1);
    expect(profile.recentChanges).toHaveLength(5);
    expect(profile.recentChanges[0]).toMatchObject({
      factId: "fact_6",
      revision: 7,
      label: "profile.field_6",
    });
  });

  it("maps priority fields to Chinese labels without inventing unknown labels", () => {
    expect(schoolFactLabel("admission.acceptance_rate")).toBe("录取率");
    expect(schoolFactLabel("cost.estimated_total")).toBe("预估总成本");
    expect(schoolFactLabel("program.fall_deadline")).toBe("秋季截止日");
    expect(schoolFactLabel("custom.new_field")).toBe("custom.new_field");
  });
});

describe("GET /api/information/facts", () => {
  function request(query: string): Request {
    return new Request(`http://localhost/api/information/facts${query}`);
  }

  it("rejects unsupported entity types and malformed ids", async () => {
    const unsupported = await GET(request("?entityType=major&entityId=cs"));
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ code: "UNSUPPORTED_ENTITY_TYPE" });

    const invalidId = await GET(request("?entityType=university&entityId="));
    expect(invalidId.status).toBe(400);
    expect(await invalidId.json()).toMatchObject({ code: "INVALID_ENTITY" });
  });

  it("returns an approved-fact profile without caching", async () => {
    const profile = createSchoolFactProfile("mit", [fact()]);
    aggregateMock.mockResolvedValue(profile);
    const response = await GET(request("?entityType=university&entityId=mit&academicYear=2025-2026"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, profile });
    expect(aggregateMock).toHaveBeenCalledWith("mit", "2025-2026");
  });

  it("fails closed when the fact layer cannot be aggregated", async () => {
    aggregateMock.mockRejectedValue(new Error('relation "facts" does not exist'));
    const response = await GET(request("?entityType=university&entityId=mit"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "INFORMATION_SCHEMA_NOT_READY",
    });
  });
});

describe("university profile integration contract", () => {
  it("mounts the approved-fact section above the legacy preview profile", () => {
    const view = read("src/components/university/UniversityDetailView.tsx");
    expect(view).toContain("<UniversityFactSection");
    expect(view.indexOf("<UniversityFactSection")).toBeLessThan(
      view.indexOf("<UniversityProfilePanel"),
    );
  });

  it("keeps fact provenance and explicit unavailable states in the UI", () => {
    const section = read("src/components/university/UniversityFactSection.tsx");
    const source = read("src/components/shared/SourcePopover.tsx");
    expect(section).toContain("/api/information/facts");
    expect(section).toContain("已审核事实层暂不可用");
    expect(section).toContain("尚未导入已审核事实");
    expect(section).toContain("查看信息动态");
    expect(source).toContain("事实来源");
    expect(source).toContain("事实版本");
  });
});
