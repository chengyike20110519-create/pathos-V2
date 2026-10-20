import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fact } from "@/domain/information/fact";
import {
  COVERAGE_PRIORITY_FIELDS,
  createCoverageReport,
  type CoverageModelInput,
} from "@/domain/information/coverage";

type DbResult = { rows: unknown[]; rowCount: number };
const authMock = vi.hoisted(() => {
  class MockForbiddenError extends Error {
    readonly code = "FORBIDDEN";
    readonly status = 403;
  }
  return { ForbiddenError: MockForbiddenError, requireAdvisor: vi.fn() };
});
const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _p: unknown[]): Promise<DbResult> => Promise.resolve({ rows: [], rowCount: 0 })),
);

vi.mock("@/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db")>();
  return { ...actual, getPool: () => ({ query: queryMock }) };
});
vi.mock("@/lib/admin-auth", () => ({
  ForbiddenError: authMock.ForbiddenError,
  requireAdvisor: authMock.requireAdvisor,
}));

import { GET } from "@/app/api/admin/information/coverage/route";
import { buildInformationCoverageReport } from "@/server/information/coverage-service";

const ROOT = resolve(__dirname, "../../..");
const NOW = new Date("2026-10-15T08:00:00.000Z");
const DAY = 86_400_000;

function fact(extra: Partial<Fact> = {}): Fact {
  return {
    entityType: "university",
    entityId: "school-a",
    fieldKey: "admission.acceptance_rate",
    valueType: "percent",
    valueNumber: 6,
    academicYear: "2026-2027",
    applicantScope: "all",
    effectiveFrom: null,
    effectiveTo: null,
    sourceId: "source_a",
    sourceUrl: "https://example.edu/a",
    retrievedAt: new Date(NOW.getTime() - 10 * DAY).toISOString(),
    reviewedAt: NOW.toISOString(),
    reviewStatus: "approved",
    confidence: "high",
    nullReason: null,
    notes: null,
    id: "fact_1",
    factKey: "fact-key-1",
    currentRevision: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...extra,
  };
}

function school(id = "school-a"): CoverageModelInput["schools"][number] {
  return { id, name: `${id.toUpperCase()} University`, chineseName: null, previewOnly: true };
}

function model(extra: Partial<CoverageModelInput> = {}): CoverageModelInput {
  return {
    schools: [school()],
    facts: [],
    reviewTasks: [],
    sourceFailures: [],
    hotNoResultQueries: [],
    now: NOW,
    ...extra,
  };
}

function mockSuccessfulService(): void {
  queryMock.mockImplementation(async (sql: string, _params: unknown[]): Promise<DbResult> => {
    if (sql.includes("FROM universities") && sql.includes("national_ranking")) {
      return {
        rows: [{ id: "school-a", name: "School A University", chinese_name: "A 大学", preview_only: true }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM facts") && sql.includes("review_status = 'approved'")) {
      return {
        rows: [],
        rowCount: 0,
      };
    }
    if (sql.includes("FROM review_tasks")) {
      return {
        rows: [{
          task_id: "task_1",
          task_type: "new_fact",
          severity: "high",
          entity_id: "school-a",
          field_key: "cost.tuition",
          created_at: new Date(NOW.getTime() - 9 * DAY),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM source_documents")) {
      return {
        rows: [{
          source_id: "source_a",
          source_name: "School A official site",
          failure_count: 4,
          last_failed_at: new Date(NOW.getTime() - DAY),
          affected_school_ids: ["school-a"],
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM search_query_runs")) {
      return {
        rows: [{ query: "BS Nursing", requests: 5, last_seen_at: new Date(NOW.getTime() - DAY) }],
        rowCount: 1,
      };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
}

beforeEach(() => {
  queryMock.mockReset();
  authMock.requireAdvisor.mockReset();
  authMock.requireAdvisor.mockResolvedValue({ user: { id: "user_1" }, role: "advisor" });
});

describe("coverage taxonomy", () => {
  it("fixes the twelve decision fields and their domains", () => {
    expect(COVERAGE_PRIORITY_FIELDS).toHaveLength(12);
    expect(new Set(COVERAGE_PRIORITY_FIELDS.map((field) => field.fieldKey)).size).toBe(12);
    expect(COVERAGE_PRIORITY_FIELDS.filter((field) => field.domain === "cost").map((field) => field.fieldKey)).toEqual([
      "cost.tuition",
      "cost.fees",
      "cost.housing",
      "cost.food",
    ]);
  });

  it("separates explicit missing states instead of treating all gaps as zero", () => {
    const report = createCoverageReport(model({
      facts: [
        fact({ id: "covered", fieldKey: "admission.acceptance_rate", valueNumber: 6 }),
        fact({
          id: "not-reported",
          fieldKey: "admission.sat_25",
          valueNumber: null,
          nullReason: "not_reported",
        }),
        fact({
          id: "source-down",
          fieldKey: "cost.tuition",
          valueType: "currency",
          valueNumber: null,
          nullReason: "source_unavailable",
        }),
        fact({
          id: "review-needed",
          fieldKey: "admission.test_policy",
          valueType: "text",
          valueText: null,
          nullReason: "source_review_not_completed",
        }),
      ],
    }));
    const statuses = new Map(report.schools[0].cells.map((cell) => [cell.fieldKey, cell.status]));
    expect(statuses.get("admission.acceptance_rate")).toBe("covered");
    expect(statuses.get("admission.sat_25")).toBe("not_reported");
    expect(statuses.get("cost.tuition")).toBe("source_unavailable");
    expect(statuses.get("admission.test_policy")).toBe("not_collected");
    expect(report.totals.covered).toBe(1);
    expect(report.totals.notReported).toBe(1);
    expect(report.totals.sourceUnavailable).toBe(1);
    expect(report.totals.notCollected).toBe(9);
  });
});

describe("coverage computation", () => {
  it("uses only university approved facts that are currently effective", () => {
    const report = createCoverageReport(model({
      facts: [
        fact({ fieldKey: "admission.acceptance_rate", reviewStatus: "pending", valueNumber: 1 }),
        fact({ fieldKey: "admission.sat_25", entityType: "program", valueNumber: 2 }),
        fact({
          id: "expired",
          fieldKey: "admission.sat_75",
          valueNumber: 3,
          effectiveTo: new Date(NOW.getTime() - DAY).toISOString(),
        }),
        fact({ id: "effective", fieldKey: "admission.act_25", valueNumber: 4 }),
      ],
    }));
    expect(report.freshness.factCount).toBe(1);
    expect(report.schools[0].approvedFactCount).toBe(1);
    expect(report.schools[0].cells.find((cell) => cell.fieldKey === "admission.act_25")?.status).toBe("covered");
    expect(report.schools[0].cells.find((cell) => cell.fieldKey === "admission.sat_75")?.status).toBe("not_collected");
  });

  it("selects one deterministic fact per school field and measures approved-source freshness", () => {
    const report = createCoverageReport(model({
      facts: [
        fact({
          id: "older",
          fieldKey: "cost.tuition",
          valueType: "currency",
          valueNumber: 50_000,
          academicYear: "2024-2025",
          retrievedAt: new Date(NOW.getTime() - 370 * DAY).toISOString(),
          confidence: "low",
        }),
        fact({
          id: "newer",
          fieldKey: "cost.tuition",
          valueType: "currency",
          valueNumber: 58_000,
          academicYear: "2026-2027",
          retrievedAt: new Date(NOW.getTime() - 20 * DAY).toISOString(),
        }),
        fact({
          id: "deadline",
          fieldKey: "deadline.regular_decision",
          valueType: "date",
          valueText: "2027-01-01",
          retrievedAt: new Date(NOW.getTime() - 200 * DAY).toISOString(),
        }),
      ],
    }));
    expect(report.schools[0].cells.find((cell) => cell.fieldKey === "cost.tuition")?.ageDays).toBe(20);
    expect(report.schools[0].deadlineCovered).toBe(true);
    expect(report.schools[0].costCovered).toBe(true);
    expect(report.schools[0].staleFactCount).toBe(2);
    expect(report.freshness.current30Days).toBe(1);
    expect(report.freshness.olderThan365Days).toBe(1);
  });

  it("orders next data tasks by actionable gaps, review severity, stale facts, and failed sources", () => {
    const report = createCoverageReport(model({
      schools: [school("complete"), school("empty")],
      facts: COVERAGE_PRIORITY_FIELDS.map((field, index) =>
        fact({
          id: `complete-${index}`,
          entityId: "complete",
          fieldKey: field.fieldKey,
          valueType: field.domain === "admission" || field.domain === "outcome" ? "percent" : "currency",
          valueNumber: index + 1,
        }),
      ),
      reviewTasks: [{
        taskId: "task_1",
        taskType: "conflict",
        severity: "critical",
        entityId: "empty",
        fieldKey: "cost.tuition",
        createdAt: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      }],
      sourceFailures: [{
        sourceId: "source_a",
        sourceName: "Official site",
        failureCount: 3,
        lastFailedAt: NOW.toISOString(),
        affectedSchoolIds: ["empty"],
      }],
    }));
    expect(report.prioritizedTasks[0]).toMatchObject({
      schoolId: "empty",
      missingFieldKeys: COVERAGE_PRIORITY_FIELDS.map((field) => field.fieldKey),
      staleFactCount: 0,
      openReviewTaskCount: 1,
      failedSourceCount: 1,
    });
    expect(report.prioritizedTasks[0].score).toBeGreaterThan(report.prioritizedTasks[1].score);
    expect(report.reviewBacklog).toMatchObject({ openTasks: 1, critical: 1, high: 0 });
  });
});

describe("coverage service", () => {
  it("queries current approved facts and all quality inputs", async () => {
    mockSuccessfulService();
    const report = await buildInformationCoverageReport(NOW);
    expect(report.totals.schools).toBe(1);
    expect(report.reviewBacklog.openTasks).toBe(1);
    expect(report.sourceFailures[0]).toMatchObject({ sourceId: "source_a", failureCount: 4 });
    expect(report.hotNoResultQueries[0]).toMatchObject({ query: "BS Nursing", requests: 5 });

    const sql = queryMock.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("review_status = 'approved'");
    expect(sql).toContain("(effective_to IS NULL OR effective_to >= NOW())");
    expect(sql).toContain("(effective_from IS NULL OR effective_from <= NOW())");
    expect(sql).toContain("t.status IN ('pending', 'recheck')");
    expect(sql).toContain("d.fetch_status IN ('failed', 'blocked')");
    expect(sql).toContain("result_count = 0");
  });

  it("fails closed when an information migration is unavailable", async () => {
    queryMock.mockRejectedValue(new Error('relation "review_tasks" does not exist'));
    await expect(buildInformationCoverageReport(NOW)).rejects.toThrow("review_tasks");
  });
});

describe("GET /api/admin/information/coverage", () => {
  it("returns 401 and 403 through the advisor gate", async () => {
    authMock.requireAdvisor.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    const unauthenticated = await GET();
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("Cache-Control")).toBe("no-store");

    authMock.requireAdvisor.mockRejectedValueOnce(new authMock.ForbiddenError());
    const forbidden = await GET();
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns an uncached report for advisors and 503 on migration failure", async () => {
    mockSuccessfulService();
    const ok = await GET();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);

    queryMock.mockRejectedValueOnce(new Error('relation "search_query_runs" does not exist'));
    const unavailable = await GET();
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps the dashboard internal and aligned with PathOS UI tokens", async () => {
    const route = await readFile(resolve(ROOT, "src/app/api/admin/information/coverage/route.ts"), "utf8");
    const page = await readFile(resolve(ROOT, "src/app/admin/information/coverage/page.tsx"), "utf8");
    const view = await readFile(resolve(ROOT, "src/components/admin/CoverageDashboard.tsx"), "utf8");
    expect(route).toContain("requireAdvisor()");
    expect(page).toContain("redirect(\"/login?next=/admin/information/coverage\")");
    for (const token of ["surface-1", "border-soft", "text-cobalt", "h-control", "rounded-control", "PageMotion"]) {
      expect(view).toContain(token);
    }
  });
});
