import { describe, expect, it } from "vitest";
import type { FactDraft } from "@/domain/information/fact";
import { validateFactDraft } from "@/domain/information/validate";

function draft(extra: Partial<FactDraft> = {}): FactDraft {
  return {
    entityType: "university",
    entityId: "mit",
    fieldKey: "cost.tuition",
    valueType: "currency",
    valueNumber: 58000,
    currency: "USD",
    sourceId: "src_1",
    sourceUrl: "https://example.edu/tuition",
    retrievedAt: "2026-10-15T00:00:00Z",
    confidence: "high",
    ...extra,
  };
}

describe("validateFactDraft", () => {
  it("accepts a complete normalized fact", () => {
    const result = validateFactDraft(draft());
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("requires currency units for currency facts", () => {
    const result = validateFactDraft(draft({ currency: null }));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "CURRENCY_REQUIRED" }));
  });

  it("validates SAT and ACT bounds", () => {
    const sat = validateFactDraft(draft({
      fieldKey: "admission.sat_25",
      valueType: "range",
      valueNumber: undefined,
      currency: undefined,
      valueRange: { min: 390, max: 1600 },
    }));
    expect(sat.issues).toContainEqual(expect.objectContaining({ code: "SAT_OUT_OF_RANGE" }));

    const act = validateFactDraft(draft({
      fieldKey: "admission.act_25",
      valueType: "range",
      valueNumber: undefined,
      currency: undefined,
      valueRange: { min: 1, max: 37 },
    }));
    expect(act.issues).toContainEqual(expect.objectContaining({ code: "ACT_OUT_OF_RANGE" }));
  });

  it("rejects a missing fact that still carries a value", () => {
    const result = validateFactDraft(draft({
      valueNumber: undefined,
      currency: undefined,
      nullReason: "not_reported",
      valueText: "not available",
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "NULL_REASON_WITH_VALUE" }));
  });

  it("rejects reversed effective periods and bad source identity", () => {
    const result = validateFactDraft(draft({
      sourceId: " ",
      sourceUrl: "example.edu",
      effectiveFrom: "2027-01-02",
      effectiveTo: "2027-01-01",
    }));
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["SOURCE_REQUIRED", "SOURCE_URL_REQUIRED", "EFFECTIVE_PERIOD_REVERSED"]),
    );
  });
});
