import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fact } from "@/domain/information/fact";
import {
  buildReportInformationSnapshot,
  buildWorkbenchFactCoverage,
  createReportInformationSnapshot,
  mergeReportPayloadWithInformation,
} from "@/server/information/report-integration";

const listApprovedFactsMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/information/fact-repository", () => ({
  listApprovedFacts: listApprovedFactsMock,
}));

function fact(extra: Partial<Fact> = {}): Fact {
  return {
    id: "fact_1",
    factKey: "fact-key-1",
    entityType: "university",
    entityId: "school-1",
    fieldKey: "profile.city",
    valueType: "text",
    valueNumber: null,
    valueText: "Boston",
    valueBoolean: null,
    valueRange: null,
    valueList: null,
    unit: null,
    currency: null,
    academicYear: "2026-2027",
    effectiveFrom: null,
    effectiveTo: null,
    applicantScope: "all",
    sourceId: "source_official",
    sourceDocumentId: null,
    sourceUrl: "https://school.example/facts",
    retrievedAt: "2026-10-01T10:00:00.000Z",
    reviewedAt: "2026-10-02T10:00:00.000Z",
    reviewStatus: "approved",
    confidence: "high",
    nullReason: null,
    notes: null,
    currentRevision: 3,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-03T10:00:00.000Z",
    ...extra,
  } as Fact;
}

beforeEach(() => {
  listApprovedFactsMock.mockReset();
});

describe("report information snapshots", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");

  it("freezes fact revision, source, value, and null gaps at generation time", () => {
    const facts = [
      fact({
        fieldKey: "admission.acceptance_rate",
        valueType: "percent",
        valueText: null,
        valueNumber: 12,
      }),
      fact({
        id: "fact_missing",
        factKey: "fact-key-missing",
        fieldKey: "cost.tuition",
        valueType: "currency",
        valueNumber: null,
        nullReason: "not_reported",
      }),
    ];
    const snapshot = createReportInformationSnapshot(
      [{ id: "school-1", name: "Example University" }],
      new Map([["school-1", facts]]),
      now,
    );

    expect(snapshot.basis).toBe("approved_facts_at_generation");
    expect(snapshot.generatedAt).toBe(now.toISOString());
    expect(snapshot.coverage.approvedFacts).toBe(2);
    expect(snapshot.coverage.missingFacts).toBe(1);
    expect(snapshot.schools[0].facts[0]).toMatchObject({
      id: "fact_1",
      revision: 3,
      sourceId: "source_official",
      sourceUrl: "https://school.example/facts",
      valueNumber: 12,
    });
    expect(snapshot.schools[0].missingCoreFields).toContain("申请截止日期");
    expect(snapshot.schools[0].missingCoreFields).toContain("毕业率");
    expect(snapshot.schools[0].missingCoreFields).toContain("学费");
  });

  it("keeps a school with no approved facts explicitly missing instead of fabricating values", () => {
    const snapshot = createReportInformationSnapshot(
      [{ name: "No ID University" }],
      new Map(),
      now,
    );

    expect(snapshot.coverage.resolvedSchools).toBe(0);
    expect(snapshot.schools[0].identityStatus).toBe("missing_id");
    expect(snapshot.schools[0].totalFacts).toBe(0);
    expect(snapshot.schools[0].missingCoreFields).toContain("学校实体 ID");
    expect(snapshot.schools[0].facts).toEqual([]);
  });

  it("derives deadline and cost coverage from the same approved fact layer", () => {
    const facts = [
      fact({
        id: "deadline_1",
        factKey: "deadline-key",
        fieldKey: "deadline.regular_decision",
        valueType: "date",
        valueText: "2026-12-01",
      }),
      fact({
        id: "tuition_1",
        factKey: "tuition-key",
        fieldKey: "cost.tuition",
        valueType: "currency",
        valueText: null,
        valueNumber: 50000,
        currency: "USD",
      }),
    ];
    const snapshot = createReportInformationSnapshot(
      [{ id: "school-1" }],
      new Map([["school-1", facts]]),
      now,
    );

    expect(snapshot.coverage.deadlineFacts).toBe(1);
    expect(snapshot.coverage.costFacts).toBe(1);
    expect(snapshot.schools[0].deadlineCoverage.scheduled).toBe(1);
    expect(snapshot.schools[0].costCoverage.officialItems).toBe(1);
    expect(snapshot.schools[0].costCoverage.academicYear).toBe("2026-2027");
  });

  it("queries approved university facts for every resolvable school id", async () => {
    listApprovedFactsMock.mockResolvedValue([]);
    await buildReportInformationSnapshot({
      schools: [{ id: "school-1" }, { id: "school-2" }, { name: "name-only" }],
      academicYear: "2026-2027",
      now,
    });

    expect(listApprovedFactsMock).toHaveBeenCalledTimes(2);
    expect(listApprovedFactsMock).toHaveBeenCalledWith({
      entityType: "university",
      entityId: "school-1",
      academicYear: "2026-2027",
    });
  });

  it("merges the snapshot into an AI payload without overwriting existing report fields", () => {
    const snapshot = createReportInformationSnapshot([], new Map(), now);
    const payload = mergeReportPayloadWithInformation(
      { summary: "existing summary", recommended: [{ id: "school-1" }] },
      snapshot,
    );

    expect(payload.summary).toBe("existing summary");
    expect(payload.recommended).toEqual([{ id: "school-1" }]);
    expect(payload.information).toBe(snapshot);
  });
});

describe("workbench fact coverage", () => {
  it("counts approved facts and exposes recent revisions with sources", () => {
    const coverage = buildWorkbenchFactCoverage(
      [
        fact({
          id: "newer",
          fieldKey: "deadline.regular_decision",
          valueType: "date",
          valueText: "2026-12-01",
          updatedAt: "2026-10-05T10:00:00.000Z",
        }),
        fact({
          id: "older",
          fieldKey: "cost.tuition",
          valueType: "currency",
          valueText: null,
          valueNumber: 50000,
          currency: "USD",
          updatedAt: "2026-10-01T10:00:00.000Z",
        }),
        fact({
          id: "missing",
          fieldKey: "outcome.graduation_rate",
          valueType: "percent",
          valueNumber: null,
          nullReason: "not_reported",
          updatedAt: "2026-09-01T10:00:00.000Z",
        }),
      ],
      new Date("2026-10-15T12:00:00.000Z"),
    );

    expect(coverage).toMatchObject({
      status: "ready",
      approvedFacts: 3,
      universities: 1,
      deadlineFacts: 1,
      costFacts: 1,
      missingFacts: 1,
    });
    expect(coverage.recentChanges.map((change) => change.factId)).toEqual([
      "newer",
      "older",
      "missing",
    ]);
  });
});
