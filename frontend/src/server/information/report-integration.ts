import type { Fact } from "@/domain/information/fact";
import {
  createApplicationDeadlineCalendar,
  isDeadlineFactField,
} from "@/server/information/aggregate-deadline";
import {
  buildCostProjectionFromApprovedFacts,
  type CostCenterAggregation,
} from "@/server/information/aggregate-cost";
import { listApprovedFacts } from "@/server/information/fact-repository";

export interface ReportSchoolRef {
  id?: string;
  name?: string;
  chineseName?: string;
}

export interface ReportSnapshotFact {
  id: string;
  factKey: string;
  entityId: string;
  fieldKey: string;
  academicYear: string | null;
  applicantScope: Fact["applicantScope"];
  revision: number;
  valueType: Fact["valueType"];
  valueNumber: number | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  valueRange: { min: number; max: number } | null;
  valueList: string[] | null;
  unit: Fact["unit"];
  currency: Fact["currency"];
  nullReason: Fact["nullReason"];
  confidence: Fact["confidence"];
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;
  reviewedAt: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface ReportFactSource {
  sourceId: string;
  sourceUrl: string;
  factCount: number;
  latestRetrievedAt: string;
}

export interface ReportSchoolInformation {
  school: ReportSchoolRef;
  entityId: string | null;
  identityStatus: "resolved" | "missing_id";
  facts: ReportSnapshotFact[];
  totalFacts: number;
  missingFacts: number;
  deadlineCoverage: ReturnType<
    typeof createApplicationDeadlineCalendar
  >["coverage"];
  costCoverage: {
    officialItems: number;
    missingItems: string[];
    academicYear: string;
  };
  sources: ReportFactSource[];
  missingCoreFields: string[];
}

export interface ReportInformationSnapshot {
  version: 1;
  generatedAt: string;
  academicYear: string | null;
  basis: "approved_facts_at_generation";
  schools: ReportSchoolInformation[];
  coverage: {
    schools: number;
    resolvedSchools: number;
    approvedFacts: number;
    missingFacts: number;
    deadlineFacts: number;
    costFacts: number;
  };
}

export interface WorkbenchFactCoverage {
  generatedAt: string;
  status: "ready" | "unavailable";
  approvedFacts: number;
  universities: number;
  deadlineFacts: number;
  costFacts: number;
  missingFacts: number;
  recentChanges: Array<{
    factId: string;
    fieldKey: string;
    revision: number;
    updatedAt: string;
    sourceUrl: string;
  }>;
  unavailableReason: string | null;
}

const CORE_FIELD_LABELS: Array<{ fieldKey: string; label: string }> = [
  { fieldKey: "admission.acceptance_rate", label: "录取率" },
  { fieldKey: "cost.tuition", label: "学费" },
  { fieldKey: "outcome.graduation_rate", label: "毕业率" },
];

function asIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function snapshotFact(fact: Fact): ReportSnapshotFact {
  return {
    id: fact.id,
    factKey: fact.factKey,
    entityId: fact.entityId,
    fieldKey: fact.fieldKey,
    academicYear: fact.academicYear ?? null,
    applicantScope: fact.applicantScope ?? null,
    revision: fact.currentRevision,
    valueType: fact.valueType,
    valueNumber: fact.valueNumber ?? null,
    valueText: fact.valueText ?? null,
    valueBoolean: fact.valueBoolean ?? null,
    valueRange: fact.valueRange ?? null,
    valueList: fact.valueList ?? null,
    unit: fact.unit ?? null,
    currency: fact.currency ?? null,
    nullReason: fact.nullReason ?? null,
    confidence: fact.confidence,
    sourceId: fact.sourceId,
    sourceUrl: fact.sourceUrl,
    retrievedAt: asIso(fact.retrievedAt),
    reviewedAt: fact.reviewedAt ? asIso(fact.reviewedAt) : null,
    notes: fact.notes ?? null,
    updatedAt: fact.updatedAt,
  };
}

function factSources(facts: readonly Fact[]): ReportFactSource[] {
  const bySource = new Map<string, ReportFactSource>();
  for (const fact of facts) {
    const key = `${fact.sourceId}\u0000${fact.sourceUrl}`;
    const current = bySource.get(key);
    const retrievedAt = asIso(fact.retrievedAt);
    if (!current) {
      bySource.set(key, {
        sourceId: fact.sourceId,
        sourceUrl: fact.sourceUrl,
        factCount: 1,
        latestRetrievedAt: retrievedAt,
      });
      continue;
    }
    current.factCount += 1;
    if (retrievedAt > current.latestRetrievedAt)
      current.latestRetrievedAt = retrievedAt;
  }
  return [...bySource.values()].sort(
    (left, right) => right.factCount - left.factCount,
  );
}

function costSummary(
  cost: CostCenterAggregation,
): ReportSchoolInformation["costCoverage"] {
  return {
    officialItems: cost.officialItems.length,
    missingItems:
      cost.projection.years[0]?.missingItems.map((item) => item.type) ?? [],
    academicYear: cost.academicYear,
  };
}

function missingCoreFields(facts: readonly Fact[]): string[] {
  const missing: string[] = [];
  for (const core of CORE_FIELD_LABELS) {
    const fact = facts.find(
      (candidate) => candidate.fieldKey === core.fieldKey,
    );
    if (!fact || fact.nullReason != null) missing.push(core.label);
  }
  const deadlineFacts = facts.filter((fact) =>
    isDeadlineFactField(fact.fieldKey),
  );
  if (
    deadlineFacts.length === 0 ||
    deadlineFacts.every((fact) => fact.nullReason != null)
  ) {
    missing.push("申请截止日期");
  }
  return missing;
}

export function createReportInformationSnapshot(
  schools: readonly ReportSchoolRef[],
  factsBySchool: ReadonlyMap<string, readonly Fact[]>,
  now: Date = new Date(),
): ReportInformationSnapshot {
  const schoolSnapshots = schools.map((school) => {
    const entityId = school.id?.trim() || null;
    const facts = entityId ? (factsBySchool.get(entityId) ?? []) : [];
    const deadline = createApplicationDeadlineCalendar(facts, now, null);
    const cost = buildCostProjectionFromApprovedFacts(facts, {
      entityId:
        entityId ?? school.name ?? school.chineseName ?? "unresolved-school",
      useDefaultAssumptions: true,
    });
    return {
      school,
      entityId,
      identityStatus: entityId
        ? ("resolved" as const)
        : ("missing_id" as const),
      facts: facts.map(snapshotFact),
      totalFacts: facts.length,
      missingFacts: facts.filter((fact) => fact.nullReason != null).length,
      deadlineCoverage: deadline.coverage,
      costCoverage: costSummary(cost),
      sources: factSources(facts),
      missingCoreFields: entityId ? missingCoreFields(facts) : ["学校实体 ID"],
    };
  });

  const allFacts = schoolSnapshots.flatMap((school) => school.facts);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    academicYear: null,
    basis: "approved_facts_at_generation",
    schools: schoolSnapshots,
    coverage: {
      schools: schoolSnapshots.length,
      resolvedSchools: schoolSnapshots.filter(
        (school) => school.entityId != null,
      ).length,
      approvedFacts: allFacts.length,
      missingFacts: allFacts.filter((fact) => fact.nullReason != null).length,
      deadlineFacts: allFacts.filter((fact) =>
        isDeadlineFactField(fact.fieldKey),
      ).length,
      costFacts: allFacts.filter(
        (fact) =>
          fact.fieldKey.startsWith("cost.") || fact.fieldKey.startsWith("aid."),
      ).length,
    },
  };
}

export async function buildReportInformationSnapshot(args: {
  schools: readonly ReportSchoolRef[];
  academicYear?: string;
  now?: Date;
}): Promise<ReportInformationSnapshot> {
  const factsBySchool = new Map<string, readonly Fact[]>();
  await Promise.all(
    args.schools.map(async (school) => {
      const entityId = school.id?.trim();
      if (!entityId) return;
      factsBySchool.set(
        entityId,
        await listApprovedFacts({
          entityType: "university",
          entityId,
          academicYear: args.academicYear?.trim() || undefined,
        }),
      );
    }),
  );
  return createReportInformationSnapshot(
    args.schools,
    factsBySchool,
    args.now ?? new Date(),
  );
}

export function mergeReportPayloadWithInformation(
  payload: unknown,
  information: ReportInformationSnapshot,
): Record<string, unknown> {
  const base =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  return { ...base, information };
}

export function buildWorkbenchFactCoverage(
  facts: readonly Fact[],
  now: Date = new Date(),
): WorkbenchFactCoverage {
  return {
    generatedAt: now.toISOString(),
    status: "ready",
    approvedFacts: facts.length,
    universities: new Set(facts.map((fact) => fact.entityId)).size,
    deadlineFacts: facts.filter((fact) => isDeadlineFactField(fact.fieldKey))
      .length,
    costFacts: facts.filter(
      (fact) =>
        fact.fieldKey.startsWith("cost.") || fact.fieldKey.startsWith("aid."),
    ).length,
    missingFacts: facts.filter((fact) => fact.nullReason != null).length,
    recentChanges: facts
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((fact) => ({
        factId: fact.id,
        fieldKey: fact.fieldKey,
        revision: fact.currentRevision,
        updatedAt: fact.updatedAt,
        sourceUrl: fact.sourceUrl,
      })),
    unavailableReason: null,
  };
}

export function unavailableWorkbenchFactCoverage(
  reason: string,
): WorkbenchFactCoverage {
  return {
    generatedAt: new Date().toISOString(),
    status: "unavailable",
    approvedFacts: 0,
    universities: 0,
    deadlineFacts: 0,
    costFacts: 0,
    missingFacts: 0,
    recentChanges: [],
    unavailableReason: reason,
  };
}
