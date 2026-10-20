import { describe, expect, it } from "vitest";
import {
  detectFactConflicts,
  diffFact,
  diffFacts,
  factSlotKey,
  factValueKey,
  type ComparableFact,
} from "@/server/information/fact-differ";

function fact(extra: Partial<ComparableFact> = {}): ComparableFact {
  return {
    entityType: "university",
    entityId: "mit",
    fieldKey: "admission.acceptance_rate",
    valueType: "percent",
    valueNumber: 4.5,
    academicYear: "2025-2026",
    applicantScope: "all",
    sourceId: "src_1",
    sourceUrl: "https://example.edu/admissions",
    ...extra,
  };
}

describe("fact keys", () => {
  it("normalizes slot identity and list value identity", () => {
    expect(factSlotKey(fact({ entityId: " MIT " }))).toBe(factSlotKey(fact()));
    expect(factSlotKey(fact({ applicantScope: "international" }))).not.toBe(factSlotKey(fact()));
    expect(factValueKey(fact({ valueType: "list", valueNumber: undefined, valueList: ["BS", "MS"] })))
      .toBe(factValueKey(fact({ valueType: "list", valueNumber: undefined, valueList: ["MS", "bs"] })));
  });
});

describe("diffFact", () => {
  it("returns new_fact when no current value exists", () => {
    expect(diffFact(null, fact()).status).toBe("new_fact");
  });

  it("returns unchanged for same value and source", () => {
    expect(diffFact(fact(), fact()).status).toBe("unchanged");
  });

  it("returns source_update when the value is stable but source changes", () => {
    const diff = diffFact(fact(), fact({ sourceId: "src_2", sourceUrl: "https://example.edu/cds" }));
    expect(diff.status).toBe("source_update");
  });

  it("returns proposed_change when normalized values differ", () => {
    const diff = diffFact(fact(), fact({ valueNumber: 4.8 }));
    expect(diff).toMatchObject({
      status: "proposed_change",
      current: expect.objectContaining({ valueNumber: 4.5 }),
      incoming: expect.objectContaining({ valueNumber: 4.8 }),
    });
  });

  it("refuses to compare different fact slots", () => {
    expect(() => diffFact(fact(), fact({ fieldKey: "cost.tuition" }))).toThrow(/different slots/);
  });
});

describe("diffFacts", () => {
  it("diffs by stable slot and preserves incoming order", () => {
    const diffs = diffFacts(
      [fact()],
      [fact({ fieldKey: "cost.tuition", valueType: "currency", valueNumber: 1 }), fact()],
    );
    expect(diffs.map((diff) => diff.status)).toEqual(["new_fact", "unchanged"]);
  });
});

describe("detectFactConflicts", () => {
  it("groups same-slot different-value facts as conflicts", () => {
    const conflicts = detectFactConflicts([
      fact(),
      fact({ valueNumber: 4.8 }),
      fact({ sourceId: "src_2", academicYear: "2026-2027" }),
      fact({ sourceId: "src_2" }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].facts).toHaveLength(3);
    expect(conflicts[0].values).toHaveLength(2);
  });
});
