import type { Fact, FactNullReason } from "@/domain/information/fact";

export type CoverageCellStatus =
  | "covered"
  | "not_reported"
  | "not_collected"
  | "source_unavailable";

export type CoverageDomain = "admission" | "cost" | "outcome" | "deadline";

export interface CoveragePriorityField {
  fieldKey: string;
  label: string;
  domain: CoverageDomain;
  weight: number;
}

export const COVERAGE_PRIORITY_FIELDS: readonly CoveragePriorityField[] = [
  { fieldKey: "admission.acceptance_rate", label: "录取率", domain: "admission", weight: 4 },
  { fieldKey: "admission.sat_25", label: "SAT 25%", domain: "admission", weight: 3 },
  { fieldKey: "admission.sat_75", label: "SAT 75%", domain: "admission", weight: 3 },
  { fieldKey: "admission.act_25", label: "ACT 25%", domain: "admission", weight: 2 },
  { fieldKey: "admission.act_75", label: "ACT 75%", domain: "admission", weight: 2 },
  { fieldKey: "admission.test_policy", label: "标化政策", domain: "admission", weight: 3 },
  { fieldKey: "cost.tuition", label: "学费", domain: "cost", weight: 5 },
  { fieldKey: "cost.fees", label: "学杂费", domain: "cost", weight: 3 },
  { fieldKey: "cost.housing", label: "住宿费", domain: "cost", weight: 3 },
  { fieldKey: "cost.food", label: "餐饮费", domain: "cost", weight: 2 },
  { fieldKey: "outcome.graduation_rate", label: "毕业率", domain: "outcome", weight: 3 },
  { fieldKey: "outcome.retention_rate", label: "大一保留率", domain: "outcome", weight: 2 },
];

export const COVERAGE_STALE_DAYS = 180;

export interface CoverageSchoolInput {
  id: string;
  name: string;
  chineseName: string | null;
  previewOnly: boolean;
}

export interface CoverageReviewTaskInput {
  taskId: string;
  taskType: string;
  severity: "low" | "medium" | "high" | "critical";
  entityId: string | null;
  fieldKey: string | null;
  createdAt: string;
}

export interface CoverageSourceFailureInput {
  sourceId: string;
  sourceName: string;
  failureCount: number;
  lastFailedAt: string;
  affectedSchoolIds: string[];
}

export interface CoverageHotNoResultInput {
  query: string;
  requests: number;
  lastSeenAt: string;
}

export interface CoverageModelInput {
  schools: readonly CoverageSchoolInput[];
  facts: readonly Fact[];
  reviewTasks: readonly CoverageReviewTaskInput[];
  sourceFailures: readonly CoverageSourceFailureInput[];
  hotNoResultQueries: readonly CoverageHotNoResultInput[];
  now?: Date;
}

export interface CoverageCell {
  fieldKey: string;
  label: string;
  domain: CoverageDomain;
  status: CoverageCellStatus;
  sourceUrl: string | null;
  sourceId: string | null;
  academicYear: string | null;
  retrievedAt: string | null;
  reviewedAt: string | null;
  ageDays: number | null;
}

export interface CoverageSchoolRow {
  id: string;
  name: string;
  chineseName: string | null;
  displayName: string;
  previewOnly: boolean;
  cells: CoverageCell[];
  coveredCount: number;
  missingCount: number;
  coverageRate: number;
  deadlineCovered: boolean;
  costCovered: boolean;
  approvedFactCount: number;
  sourceAgeDays: number | null;
  staleFactCount: number;
  openReviewTaskCount: number;
  criticalReviewTaskCount: number;
  highReviewTaskCount: number;
  oldestReviewTaskAgeDays: number | null;
  failedSourceCount: number;
}

export interface CoverageFieldSummary {
  fieldKey: string;
  label: string;
  domain: CoverageDomain;
  covered: number;
  notReported: number;
  notCollected: number;
  sourceUnavailable: number;
  coverageRate: number;
}

export type FreshnessBucket =
  | "current_30_days"
  | "current_90_days"
  | "aging_180_days"
  | "stale_365_days"
  | "older_than_365_days";

export interface CoverageFreshness {
  factCount: number;
  medianAgeDays: number | null;
  current30Days: number;
  current90Days: number;
  aging180Days: number;
  stale365Days: number;
  olderThan365Days: number;
  latestReviewedAt: string | null;
}

export interface CoverageReviewBacklog {
  openTasks: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  oldestTaskAgeDays: number | null;
  byType: Array<{ taskType: string; count: number }>;
}

export interface CoverageTask {
  schoolId: string;
  schoolName: string;
  score: number;
  reasons: string[];
  missingFieldKeys: string[];
  staleFactCount: number;
  openReviewTaskCount: number;
  failedSourceCount: number;
}

export interface CoverageReport {
  version: 1;
  generatedAt: string;
  basis: "approved_current_facts";
  priorityFields: readonly CoveragePriorityField[];
  totals: {
    schools: number;
    cells: number;
    covered: number;
    notReported: number;
    notCollected: number;
    sourceUnavailable: number;
    coverageRate: number;
    deadlineCoveredSchools: number;
    costCoveredSchools: number;
  };
  freshness: CoverageFreshness;
  fieldSummaries: CoverageFieldSummary[];
  schools: CoverageSchoolRow[];
  reviewBacklog: CoverageReviewBacklog;
  sourceFailures: CoverageSourceFailureInput[];
  hotNoResultQueries: CoverageHotNoResultInput[];
  prioritizedTasks: CoverageTask[];
}

const SCOPE_PRIORITY: Record<string, number> = {
  international: 0,
  all: 1,
  undergraduate: 2,
  graduate: 3,
};

const CONFIDENCE_PRIORITY: Record<Fact["confidence"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const STATUS_ACTION_WEIGHT: Record<CoverageCellStatus, number> = {
  covered: 0,
  not_reported: 0.15,
  not_collected: 1,
  source_unavailable: 1.1,
};

const SEVERITY_WEIGHT: Record<CoverageReviewTaskInput["severity"], number> = {
  critical: 10,
  high: 6,
  medium: 3,
  low: 1,
};

export function coverageStatusForFact(fact: Fact | undefined): CoverageCellStatus {
  if (!fact) return "not_collected";
  if (fact.nullReason == null) return "covered";
  return nullReasonStatus(fact.nullReason);
}

function nullReasonStatus(reason: FactNullReason): CoverageCellStatus {
  if (reason === "not_reported" || reason === "not_applicable") return "not_reported";
  if (reason === "source_unavailable" || reason === "source_blocked") {
    return "source_unavailable";
  }
  return "not_collected";
}

export function isDeadlineCoverageField(fieldKey: string): boolean {
  return fieldKey.startsWith("deadline.") ||
    fieldKey === "program.application_deadline" ||
    fieldKey === "program.fall_deadline" ||
    fieldKey === "program.spring_deadline";
}

export function isCostCoverageField(fieldKey: string): boolean {
  return fieldKey.startsWith("cost.");
}

function factHasValue(fact: Fact): boolean {
  return fact.valueNumber != null ||
    fact.valueText != null ||
    fact.valueBoolean != null ||
    fact.valueRange != null ||
    fact.valueList != null;
}

function compareFacts(left: Fact, right: Fact): number {
  const leftYear = left.academicYear ?? "";
  const rightYear = right.academicYear ?? "";
  if (leftYear !== rightYear) return rightYear.localeCompare(leftYear);

  const leftScope = SCOPE_PRIORITY[left.applicantScope ?? "all"] ?? 99;
  const rightScope = SCOPE_PRIORITY[right.applicantScope ?? "all"] ?? 99;
  if (leftScope !== rightScope) return leftScope - rightScope;

  const leftRetrieved = factTime(left.retrievedAt);
  const rightRetrieved = factTime(right.retrievedAt);
  if (leftRetrieved !== rightRetrieved) {
    return rightRetrieved - leftRetrieved;
  }

  const leftConfidence = CONFIDENCE_PRIORITY[left.confidence];
  const rightConfidence = CONFIDENCE_PRIORITY[right.confidence];
  if (leftConfidence !== rightConfidence) return leftConfidence - rightConfidence;
  return right.currentRevision - left.currentRevision;
}

function ageDays(iso: string, now: Date): number | null {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor((now.getTime() - value) / 86_400_000));
}

function factIso(value: Fact["retrievedAt"] | Fact["reviewedAt"]): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function factTime(value: Fact["retrievedAt"]): number {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCurrentlyEffective(fact: Fact, now: Date): boolean {
  const from = fact.effectiveFrom == null ? null : factTime(fact.effectiveFrom);
  const to = fact.effectiveTo == null ? null : (
    fact.effectiveTo instanceof Date ? fact.effectiveTo.getTime() : Date.parse(fact.effectiveTo)
  );
  if (from != null && Number.isFinite(from) && from > now.getTime()) return false;
  if (to != null && Number.isFinite(to) && to < now.getTime()) return false;
  return true;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function displayName(school: CoverageSchoolInput): string {
  return school.chineseName ? `${school.chineseName} / ${school.name}` : school.name;
}

function freshnessBucket(age: number): FreshnessBucket {
  if (age <= 30) return "current_30_days";
  if (age <= 90) return "current_90_days";
  if (age <= 180) return "aging_180_days";
  if (age <= 365) return "stale_365_days";
  return "older_than_365_days";
}

function emptyFieldSummary(field: CoveragePriorityField, schools: number): CoverageFieldSummary {
  return {
    fieldKey: field.fieldKey,
    label: field.label,
    domain: field.domain,
    covered: 0,
    notReported: 0,
    notCollected: 0,
    sourceUnavailable: 0,
    coverageRate: 0,
  };
}

function schoolScore(
  row: CoverageSchoolRow,
  cells: readonly CoverageCell[],
): CoverageTask {
  const missingFieldKeys: string[] = [];
  let weightedGap = 0;
  const fieldWeight = new Map(COVERAGE_PRIORITY_FIELDS.map((field) => [field.fieldKey, field.weight]));
  for (const cell of cells) {
    if (cell.status === "covered") continue;
    missingFieldKeys.push(cell.fieldKey);
    weightedGap += (fieldWeight.get(cell.fieldKey) ?? 1) * STATUS_ACTION_WEIGHT[cell.status];
  }

  const staleScore = Math.min(12, row.staleFactCount * 2);
  const reviewScore = Math.min(
    20,
    row.criticalReviewTaskCount * SEVERITY_WEIGHT.critical +
      row.highReviewTaskCount * SEVERITY_WEIGHT.high,
  );
  const sourceScore = Math.min(8, row.failedSourceCount * 4);
  const reasons: string[] = [];
  if (missingFieldKeys.length > 0) reasons.push(`补齐 ${missingFieldKeys.length} 个优先字段`);
  if (row.staleFactCount > 0) reasons.push(`刷新 ${row.staleFactCount} 条超 180 天事实`);
  if (row.openReviewTaskCount > 0) reasons.push(`处理 ${row.openReviewTaskCount} 条审核任务`);
  if (row.failedSourceCount > 0) reasons.push(`排查 ${row.failedSourceCount} 个失败来源`);
  if (reasons.length === 0) reasons.push("保持周更巡检");

  return {
    schoolId: row.id,
    schoolName: row.displayName,
    score: Math.round((weightedGap + staleScore + reviewScore + sourceScore) * 10) / 10,
    reasons,
    missingFieldKeys,
    staleFactCount: row.staleFactCount,
    openReviewTaskCount: row.openReviewTaskCount,
    failedSourceCount: row.failedSourceCount,
  };
}

export function createCoverageReport(input: CoverageModelInput): CoverageReport {
  const now = input.now ?? new Date();
  const currentFacts = input.facts.filter(
    (fact) =>
      fact.entityType === "university" &&
      fact.reviewStatus === "approved" &&
      isCurrentlyEffective(fact, now),
  );
  const factsBySchool = new Map<string, Fact[]>();
  for (const fact of currentFacts) {
    const list = factsBySchool.get(fact.entityId);
    if (list) list.push(fact);
    else factsBySchool.set(fact.entityId, [fact]);
  }

  const tasksBySchool = new Map<string, CoverageReviewTaskInput[]>();
  const typeCounts = new Map<string, number>();
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let oldestTaskAge: number | null = null;
  for (const task of input.reviewTasks) {
    if (task.entityId) {
      const list = tasksBySchool.get(task.entityId);
      if (list) list.push(task);
      else tasksBySchool.set(task.entityId, [task]);
    }
    typeCounts.set(task.taskType, (typeCounts.get(task.taskType) ?? 0) + 1);
    if (task.severity === "critical") critical += 1;
    else if (task.severity === "high") high += 1;
    else if (task.severity === "medium") medium += 1;
    else low += 1;
    const age = ageDays(task.createdAt, now);
    if (age != null && (oldestTaskAge == null || age > oldestTaskAge)) oldestTaskAge = age;
  }

  const failedSourcesBySchool = new Map<string, number>();
  for (const failure of input.sourceFailures) {
    for (const schoolId of failure.affectedSchoolIds) {
      failedSourcesBySchool.set(schoolId, (failedSourcesBySchool.get(schoolId) ?? 0) + 1);
    }
  }

  const fieldCounts = COVERAGE_PRIORITY_FIELDS.map((field) =>
    emptyFieldSummary(field, input.schools.length),
  );
  const rows = input.schools.map((school) => {
    const facts = factsBySchool.get(school.id) ?? [];
    const selectedByField = new Map<string, Fact>();
    for (const field of COVERAGE_PRIORITY_FIELDS) {
      const candidates = facts.filter((fact) => fact.fieldKey === field.fieldKey);
      const selected = candidates.slice().sort(compareFacts)[0];
      if (selected) selectedByField.set(field.fieldKey, selected);
    }

    const cells = COVERAGE_PRIORITY_FIELDS.map((field) => {
      const fact = selectedByField.get(field.fieldKey);
      const retrievedAt = fact ? factIso(fact.retrievedAt) : null;
      const reviewedAt = fact ? factIso(fact.reviewedAt) : null;
      const retrievedAge = retrievedAt ? ageDays(retrievedAt, now) : null;
      return {
        fieldKey: field.fieldKey,
        label: field.label,
        domain: field.domain,
        status: coverageStatusForFact(fact),
        sourceUrl: fact?.sourceUrl ?? null,
        sourceId: fact?.sourceId ?? null,
        academicYear: fact?.academicYear ?? null,
        retrievedAt,
        reviewedAt,
        ageDays: retrievedAge,
      };
    });

    const coveredCount = cells.filter((cell) => cell.status === "covered").length;
    const ages = facts
      .map((fact) => {
        const retrievedAt = factIso(fact.retrievedAt);
        return retrievedAt == null ? null : ageDays(retrievedAt, now);
      })
      .filter((age): age is number => age != null);
    const tasks = tasksBySchool.get(school.id) ?? [];
    return {
      id: school.id,
      name: school.name,
      chineseName: school.chineseName,
      displayName: displayName(school),
      previewOnly: school.previewOnly,
      cells,
      coveredCount,
      missingCount: cells.length - coveredCount,
      coverageRate: cells.length === 0 ? 0 : coveredCount / cells.length,
      deadlineCovered: facts.some((fact) => isDeadlineCoverageField(fact.fieldKey) && factHasValue(fact)),
      costCovered: facts.some((fact) => isCostCoverageField(fact.fieldKey) && factHasValue(fact)),
      approvedFactCount: facts.length,
      sourceAgeDays: ages.length === 0 ? null : Math.min(...ages),
      staleFactCount: ages.filter((age) => age > COVERAGE_STALE_DAYS).length,
      openReviewTaskCount: tasks.length,
      criticalReviewTaskCount: tasks.filter((task) => task.severity === "critical").length,
      highReviewTaskCount: tasks.filter((task) => task.severity === "high").length,
      oldestReviewTaskAgeDays: tasks.length === 0
        ? null
        : Math.max(...tasks.map((task) => ageDays(task.createdAt, now) ?? 0)),
      failedSourceCount: failedSourcesBySchool.get(school.id) ?? 0,
    } satisfies CoverageSchoolRow;
  });

  rows.forEach((row) => {
    row.cells.forEach((cell, index) => {
      const summary = fieldCounts[index];
      if (cell.status === "covered") summary.covered += 1;
      else if (cell.status === "not_reported") summary.notReported += 1;
      else if (cell.status === "source_unavailable") summary.sourceUnavailable += 1;
      else summary.notCollected += 1;
    });
  });
  fieldCounts.forEach((summary) => {
    summary.coverageRate = input.schools.length === 0 ? 0 : summary.covered / input.schools.length;
  });

  const allAges = currentFacts
    .map((fact) => {
      const retrievedAt = factIso(fact.retrievedAt);
      return retrievedAt == null ? null : ageDays(retrievedAt, now);
    })
    .filter((age): age is number => age != null);
  const buckets = new Map<FreshnessBucket, number>([
    ["current_30_days", 0],
    ["current_90_days", 0],
    ["aging_180_days", 0],
    ["stale_365_days", 0],
    ["older_than_365_days", 0],
  ]);
  allAges.forEach((age) => {
    buckets.set(freshnessBucket(age), (buckets.get(freshnessBucket(age)) ?? 0) + 1);
  });
  const reviewedDates = currentFacts
    .map((fact) => factIso(fact.reviewedAt))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left));

  const totals = {
    schools: rows.length,
    cells: COVERAGE_PRIORITY_FIELDS.length * rows.length,
    covered: fieldCounts.reduce((sum, field) => sum + field.covered, 0),
    notReported: fieldCounts.reduce((sum, field) => sum + field.notReported, 0),
    notCollected: fieldCounts.reduce((sum, field) => sum + field.notCollected, 0),
    sourceUnavailable: fieldCounts.reduce((sum, field) => sum + field.sourceUnavailable, 0),
    coverageRate: 0,
    deadlineCoveredSchools: rows.filter((row) => row.deadlineCovered).length,
    costCoveredSchools: rows.filter((row) => row.costCovered).length,
  };
  totals.coverageRate = totals.cells === 0 ? 0 : totals.covered / totals.cells;

  return {
    version: 1,
    generatedAt: now.toISOString(),
    basis: "approved_current_facts",
    priorityFields: COVERAGE_PRIORITY_FIELDS,
    totals,
    freshness: {
      factCount: currentFacts.length,
      medianAgeDays: median(allAges),
      current30Days: buckets.get("current_30_days") ?? 0,
      current90Days: buckets.get("current_90_days") ?? 0,
      aging180Days: buckets.get("aging_180_days") ?? 0,
      stale365Days: buckets.get("stale_365_days") ?? 0,
      olderThan365Days: buckets.get("older_than_365_days") ?? 0,
      latestReviewedAt: reviewedDates[0] ?? null,
    },
    fieldSummaries: fieldCounts,
    schools: rows.slice().sort((left, right) => {
      if (left.coverageRate !== right.coverageRate) return left.coverageRate - right.coverageRate;
      return left.displayName.localeCompare(right.displayName);
    }),
    reviewBacklog: {
      openTasks: input.reviewTasks.length,
      critical,
      high,
      medium,
      low,
      oldestTaskAgeDays: oldestTaskAge,
      byType: [...typeCounts.entries()]
        .map(([taskType, count]) => ({ taskType, count }))
        .sort((left, right) => right.count - left.count || left.taskType.localeCompare(right.taskType)),
    },
    sourceFailures: input.sourceFailures.slice().sort(
      (left, right) => right.failureCount - left.failureCount ||
        right.lastFailedAt.localeCompare(left.lastFailedAt),
    ),
    hotNoResultQueries: input.hotNoResultQueries.slice().sort(
      (left, right) => right.requests - left.requests || left.query.localeCompare(right.query),
    ),
    prioritizedTasks: rows
      .map((row) => schoolScore(row, row.cells))
      .sort((left, right) => right.score - left.score || left.schoolName.localeCompare(right.schoolName))
      .slice(0, 25),
  };
}
