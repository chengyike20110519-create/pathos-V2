import { describe, expect, it } from "vitest";

import {
  COST_ITEM_TYPES,
  DIRECT_COST_ITEM_TYPES,
  INDIRECT_COST_ITEM_TYPES,
  aggregateAnnualCost,
  buildCostAssumptionNotes,
  getCostItemGroup,
  isCostItemType,
  listMissingCostItems,
  projectCosts,
  validateCostItems,
  validateCostProjectionInput,
  type CostItem,
  type CostProjectionInput,
} from "@/domain/information/cost";

const BASE_YEAR = "2026-2027";

function officialItem(
  type: CostItem["type"],
  amount: number | { min: number; max: number },
): CostItem {
  return {
    type,
    academicYear: BASE_YEAR,
    currency: "USD",
    origin: "official",
    amount,
    source: {
      name: "University Cost of Attendance",
      url: "https://example.edu/costs",
      retrievedAt: "2026-10-01T00:00:00Z",
    },
  };
}

function assumedItem(
  type: CostItem["type"],
  amount: number | { min: number; max: number },
): CostItem {
  return {
    type,
    academicYear: BASE_YEAR,
    currency: "USD",
    origin: "regional_estimate",
    amount,
    source: {
      name: "Regional Cost Estimate",
      url: "https://example.org/regional-costs",
      retrievedAt: "2026-10-01T00:00:00Z",
    },
  };
}

function completeItems(): CostItem[] {
  return [
    officialItem("tuition", 50000),
    officialItem("fees", 1000),
    officialItem("insurance", 2000),
    officialItem("books", 600),
    assumedItem("housing", { min: 12000, max: 16000 }),
    assumedItem("food", 5000),
    assumedItem("transportation", 800),
    assumedItem("personal", 1200),
  ];
}

function projectionInput(items: CostItem[]): CostProjectionInput {
  return {
    items,
    assumptions: {
      baseAcademicYear: BASE_YEAR,
      yearCount: 4,
      inflation: {
        default: { low: 0.03, central: 0.05, high: 0.07 },
        byItem: {
          tuition: { low: 0.04, central: 0.06, high: 0.08 },
        },
      },
      exchangeRate: {
        cnyPerUsd: { low: 7.1, central: 7.2, high: 7.3 },
        quotedAt: "2026-10-14T00:00:00Z",
        sourceName: "Central Bank",
        sourceUrl: "https://example.org/fx",
      },
    },
  };
}

describe("cost taxonomy", () => {
  it("keeps cost item types and direct/indirect groups closed", () => {
    expect(COST_ITEM_TYPES).toHaveLength(8);
    for (const type of COST_ITEM_TYPES) expect(isCostItemType(type)).toBe(true);
    expect(isCostItemType("scholarship")).toBe(false);
    expect([...DIRECT_COST_ITEM_TYPES, ...INDIRECT_COST_ITEM_TYPES].sort()).toEqual(
      [...COST_ITEM_TYPES].sort(),
    );
    expect(getCostItemGroup("tuition")).toBe("direct");
    expect(getCostItemGroup("housing")).toBe("indirect");
  });

  it("reports absent cost types instead of adding zero-valued placeholders", () => {
    const missing = listMissingCostItems([officialItem("tuition", 50000)]);
    expect(missing.map((item) => item.type)).toEqual([
      "fees",
      "housing",
      "food",
      "insurance",
      "books",
      "transportation",
      "personal",
    ]);
    expect(missing.every((item) => item.reason === "not_provided")).toBe(true);
  });
});

describe("annual cost aggregation", () => {
  it("separates official values from assumption values and direct from indirect costs", () => {
    const result = aggregateAnnualCost(completeItems(), BASE_YEAR);

    expect(result.official.official).toMatchObject({
      min: 53600,
      median: 53600,
      max: 53600,
      basis: "provided_items",
    });
    expect(result.assumptions.assumptions).toMatchObject({
      min: 19000,
      median: 21000,
      max: 23000,
    });
    expect(result.direct.combined).toMatchObject({ median: 53600 });
    expect(result.indirect.combined).toMatchObject({
      min: 19000,
      median: 21000,
      max: 23000,
    });
    expect(result.combined.combined).toMatchObject({
      min: 72600,
      median: 74600,
      max: 76600,
    });
    expect(result.missingItems).toEqual([]);
    expect(result.isComplete).toBe(true);
  });

  it("marks an empty bucket as no_items rather than treating it as an explicit zero", () => {
    const result = aggregateAnnualCost([officialItem("tuition", 0)], BASE_YEAR);

    expect(result.official.combined).toMatchObject({ min: 0, basis: "provided_items" });
    expect(result.assumptions.combined).toMatchObject({ min: 0, basis: "no_items" });
    expect(result.missingItems).toHaveLength(7);
    expect(result.isComplete).toBe(false);
  });

  it("normalizes academic-year aliases before filtering and projecting", () => {
    const tuition = {
      ...officialItem("tuition", 50000),
      academicYear: "2026-27",
    };
    const annual = aggregateAnnualCost([tuition], "2026/27");
    expect(annual.academicYear).toBe(BASE_YEAR);
    expect(annual.official.combined.median).toBe(50000);

    const projected = projectCosts({
      items: [tuition],
      assumptions: {
        ...projectionInput([]).assumptions,
        baseAcademicYear: "2026-27",
        yearCount: 2,
      },
    });
    expect(projected.years.map((year) => year.academicYear)).toEqual([
      BASE_YEAR,
      "2027-2028",
    ]);
  });

  it("annotates every non-official input in the annual output", () => {
    const result = aggregateAnnualCost(completeItems(), BASE_YEAR);
    expect(result.assumptionNotes).toContain(
      "housing uses regional estimate values, not an official value",
    );
    expect(result.assumptionNotes).toContain("food uses regional estimate values, not an official value");
  });
});

describe("multi-year projection", () => {
  it("projects item-specific inflation and outputs USD and CNY ranges", () => {
    const result = projectCosts(projectionInput(completeItems()));

    expect(result.years.map((year) => year.academicYear)).toEqual([
      "2026-2027",
      "2027-2028",
      "2028-2029",
      "2029-2030",
    ]);
    expect(result.years[0].range.usd).toMatchObject({
      min: 72600,
      median: 74600,
      max: 76600,
    });
    expect(result.years[0].range.cny).toMatchObject({
      min: roundMoney(72600 * 7.1),
      median: roundMoney(74600 * 7.2),
      max: roundMoney(76600 * 7.3),
      currency: "CNY",
    });

    const year2 = result.years[1];
    expect(year2.scenarios.central.official).toMatchObject({
      median: roundMoney(50000 * 1.06 + 1000 * 1.05 + 2000 * 1.05 + 600 * 1.05),
    });
    expect(year2.scenarios.high.official.median).toBeGreaterThan(
      year2.scenarios.central.official.median,
    );
    expect(year2.scenarios.central.assumptions.median).toBeGreaterThan(
      result.years[0].scenarios.central.assumptions.median,
    );
    expect(year2.missingItems).toEqual([]);
  });

  it("keeps the same missing list in every projected year", () => {
    const result = projectCosts(projectionInput([officialItem("tuition", 50000)]));
    expect(result.baseYear.missingItems).toHaveLength(7);
    expect(result.years.every((year) => year.missingItems.length === 7)).toBe(true);
  });

  it("makes inflation, exchange-rate source, and assumed values explicit", () => {
    const result = projectCosts(projectionInput(completeItems()));
    expect(result.assumptionNotes).toContain(
      "Inflation scenarios: low 3.00%, central 5.00%, high 7.00% per year",
    );
    expect(result.assumptionNotes).toContain(
      "tuition inflation: low 4.00%, central 6.00%, high 8.00% per year",
    );
    expect(result.assumptionNotes).toContain(
      "Exchange rate assumption: 7.1-7.3 CNY/USD (central 7.2), quoted at 2026-10-14T00:00:00Z, source Central Bank",
    );
    expect(buildCostAssumptionNotes(completeItems(), projectionInput(completeItems()).assumptions)).toEqual(
      result.assumptionNotes,
    );
  });
});

describe("cost model validation", () => {
  it("requires a source for official values", () => {
    const item = officialItem("tuition", 50000);
    delete item.source;
    const result = validateCostItems([item]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain("source is required");
  });

  it("rejects malformed amount ranges and duplicate item origins", () => {
    const badRange = officialItem("tuition", { min: 2000, max: 1000 });
    const duplicate: CostItem = {
      ...officialItem("tuition", 51000),
      source: {
        name: "Second source",
        url: "https://example.org/costs",
        retrievedAt: "2026-10-01T00:00:00Z",
      },
    };
    const result = validateCostItems([badRange, duplicate]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.join("\n")).toContain("min cannot exceed max");
      expect(result.errors.join("\n")).toContain("duplicates tuition");
    }
  });

  it("does not invent missing inflation or exchange-rate assumptions", () => {
    const input = projectionInput([officialItem("tuition", 50000)]);
    delete (input.assumptions.inflation as { default?: unknown }).default;
    delete (input.assumptions as { exchangeRate?: unknown }).exchangeRate;
    const result = validateCostProjectionInput(input);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors).toContain("assumptions.inflation.default is required");
      expect(result.errors).toContain("assumptions.exchangeRate.cnyPerUsd is required");
    }
  });

  it("requires all projected items to use the declared base academic year", () => {
    const input = projectionInput([officialItem("tuition", 50000)]);
    const mismatched = projectionInput([]).assumptions;
    mismatched.baseAcademicYear = "2027-2028";
    const result = validateCostProjectionInput({ items: input.items, assumptions: mismatched });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain("must match assumptions.baseAcademicYear");
  });
});

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
