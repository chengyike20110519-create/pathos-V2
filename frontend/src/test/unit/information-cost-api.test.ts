import { beforeEach, describe, expect, it, vi } from "vitest";

const listApprovedFactsMock = vi.hoisted(() =>
  vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
);

vi.mock("@/server/information/fact-repository", () => ({
  listApprovedFacts: listApprovedFactsMock,
}));

import type { Fact } from "@/domain/information/fact";
import {
  DEFAULT_COST_ACADEMIC_YEAR,
  aggregateUniversityCost,
  buildCostProjectionFromApprovedFacts,
} from "@/server/information/aggregate-cost";
import { DatabaseNotConfiguredError } from "@/server/db";
import { GET, POST } from "@/app/api/information/costs/route";

const NOW = "2026-10-15T08:00:00Z";

function approvedFact(extra: Partial<Fact> = {}): Fact {
  return {
    entityType: "university",
    entityId: "test-university",
    fieldKey: "cost.tuition",
    valueType: "currency",
    valueNumber: 50000,
    academicYear: DEFAULT_COST_ACADEMIC_YEAR,
    currency: "USD",
    applicantScope: "all",
    sourceId: "source-official",
    sourceUrl: "https://example.edu/costs",
    retrievedAt: NOW,
    reviewedAt: NOW,
    reviewStatus: "approved",
    confidence: "high",
    id: `fact_${Math.random().toString(36).slice(2, 8)}`,
    factKey: `key_${Math.random().toString(36).slice(2, 8)}`,
    currentRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  } as Fact;
}

function baseFacts(): Fact[] {
  return [
    approvedFact(),
    approvedFact({
      id: "fact_housing",
      fieldKey: "cost.housing",
      valueType: "range",
      valueNumber: null,
      valueRange: { min: 12000, max: 16000 },
      applicantScope: "international",
    }),
  ];
}

beforeEach(() => {
  listApprovedFactsMock.mockReset().mockResolvedValue([]);
});

describe("aggregate-cost", () => {
  it("uses approved USD facts as official values and keeps user assumptions separate", () => {
    const result = buildCostProjectionFromApprovedFacts(
      [
        ...baseFacts(),
        approvedFact({ id: "pending_food", fieldKey: "cost.food", valueNumber: 9000, reviewStatus: "pending" }),
      ],
      {
        entityId: "test-university",
        useDefaultAssumptions: true,
        userAssumptions: [{ type: "food", amount: 5000 }],
      },
    );

    expect(result.officialItems.map((item) => item.type)).toEqual(["tuition", "housing"]);
    expect(result.userAssumptionItems.map((item) => item.type)).toEqual(["food"]);
    expect(result.projection.baseYear.official.official).toMatchObject({
      min: 62000,
      median: 64000,
      max: 66000,
      basis: "provided_items",
    });
    expect(result.projection.baseYear.assumptions.assumptions).toMatchObject({
      min: 5000,
      median: 5000,
      max: 5000,
    });
    expect(result.projection.baseYear.missingItems).toHaveLength(5);
    expect(result.ignoredFacts).toContainEqual({
      factId: "pending_food",
      fieldKey: "cost.food",
      reason: "not_approved",
    });
  });

  it("does not turn an empty fact set into a zero-cost budget", () => {
    const result = buildCostProjectionFromApprovedFacts([], {
      entityId: "test-university",
      useDefaultAssumptions: true,
    });

    expect(result.officialItems).toEqual([]);
    expect(result.userAssumptionItems).toEqual([]);
    expect(result.projection.baseYear.missingItems).toHaveLength(8);
    expect(result.projection.total.usd).toMatchObject({
      min: 0,
      median: 0,
      max: 0,
      basis: "no_items",
    });
  });

  it("rejects non-USD or unsupported facts and prefers the international scope on duplicates", () => {
    const result = buildCostProjectionFromApprovedFacts(
      [
        approvedFact({ id: "cny", currency: "CNY" }),
        approvedFact({ id: "other", fieldKey: "cost.unknown", valueNumber: 1 }),
        approvedFact({ id: "all_scope", valueNumber: 51000 }),
        approvedFact({
          id: "international",
          fieldKey: "cost.tuition",
          applicantScope: "international",
          valueNumber: 52000,
        }),
      ],
      { entityId: "test-university", academicYear: "2026-27", useDefaultAssumptions: true },
    );

    expect(result.academicYear).toBe(DEFAULT_COST_ACADEMIC_YEAR);
    expect(result.officialItems).toHaveLength(1);
    expect(result.officialItems[0]).toMatchObject({ type: "tuition", amount: 52000 });
    expect(result.ignoredFacts.map((item) => item.reason)).toEqual(
      expect.arrayContaining(["unsupported_currency", "unsupported_field", "duplicate_scope"]),
    );
  });

  it("summarizes scholarship facts without treating them as cost items", () => {
    const result = buildCostProjectionFromApprovedFacts(
      [
        approvedFact({
          id: "scholarship_available",
          fieldKey: "aid.scholarship_available",
          valueType: "boolean",
          valueNumber: null,
          valueBoolean: true,
        }),
        approvedFact({
          id: "scholarship_amount",
          fieldKey: "aid.scholarship_average_amount",
          valueNumber: 15000,
        }),
      ],
      { entityId: "test-university", useDefaultAssumptions: true },
    );

    expect(result.scholarships.available).toBe(true);
    expect(result.scholarships.amount).toBe(15000);
    expect(result.projection.baseYear.missingItems).toHaveLength(8);
  });

  it("requires explicit assumptions unless defaults are explicitly enabled", () => {
    expect(() =>
      buildCostProjectionFromApprovedFacts([], { entityId: "test-university" }),
    ).toThrow(/inflationPercent is required/);
  });

  it("queries only approved current facts for the university", async () => {
    listApprovedFactsMock.mockResolvedValue(baseFacts());
    const result = await aggregateUniversityCost({
      entityId: " test-university ",
      academicYear: "2026/27",
      yearCount: 2,
      useDefaultAssumptions: true,
    });

    expect(listApprovedFactsMock).toHaveBeenCalledWith({
      entityType: "university",
      entityId: "test-university",
      academicYear: "2026-2027",
    });
    expect(result.projection.years.map((year) => year.academicYear)).toEqual([
      "2026-2027",
      "2027-2028",
    ]);
  });
});

describe("GET /api/information/costs", () => {
  it("returns a no-store projection with explicit defaults", async () => {
    listApprovedFactsMock.mockResolvedValue(baseFacts());
    const response = await GET(
      new Request("http://localhost/api/information/costs?entityId=test-university&useDefaultAssumptions=true"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.ok).toBe(true);
    expect(body.result.projection.baseYear.official.official.median).toBe(64000);
  });

  it("rejects implicit assumptions", async () => {
    const response = await GET(
      new Request("http://localhost/api/information/costs?entityId=test-university"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.code).toBe("INVALID_REQUEST");
    expect(listApprovedFactsMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the database is not configured", async () => {
    listApprovedFactsMock.mockRejectedValue(new DatabaseNotConfiguredError());
    const response = await GET(
      new Request("http://localhost/api/information/costs?entityId=test-university&useDefaultAssumptions=true"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.code).toBe("DATABASE_NOT_CONFIGURED");
  });

  it("returns 503 when the information migration is missing", async () => {
    listApprovedFactsMock.mockRejectedValue(new Error('relation "facts" does not exist'));
    const response = await GET(
      new Request("http://localhost/api/information/costs?entityId=test-university&useDefaultAssumptions=true"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("INFORMATION_SCHEMA_NOT_READY");
  });
});

describe("POST /api/information/costs", () => {
  it("accepts explicit scenario assumptions", async () => {
    listApprovedFactsMock.mockResolvedValue([]);
    const response = await POST(
      new Request("http://localhost/api/information/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: "test-university",
          inflationPercent: { low: 2, central: 4, high: 6 },
          exchangeRateCnyPerUsd: { low: 7, central: 7.2, high: 7.4 },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.result.projection.assumptions.inflation.default).toEqual({
      low: 0.02,
      central: 0.04,
      high: 0.06,
    });
  });

  it("rejects malformed JSON and partial scenarios", async () => {
    const invalidJson = await POST(
      new Request("http://localhost/api/information/costs", { method: "POST", body: "{" }),
    );
    expect(invalidJson.status).toBe(400);

    const partial = await POST(
      new Request("http://localhost/api/information/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: "test-university",
          inflationPercent: { low: 2, central: 4 },
          exchangeRateCnyPerUsd: { low: 7, central: 7.2, high: 7.4 },
        }),
      }),
    );
    expect(partial.status).toBe(400);
    expect(listApprovedFactsMock).not.toHaveBeenCalled();
  });
});
