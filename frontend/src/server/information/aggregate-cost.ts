import {
  COST_ITEM_TYPES,
  isCostItemType,
  projectCosts,
  type CostAmountRange,
  type CostItem,
  type CostItemType,
  type CostProjectionAssumptions,
  type CostProjectionResult,
  type CostScenarioRates,
} from "@/domain/information/cost";
import type { Fact, FactApplicantScope } from "@/domain/information/fact";
import { normalizeAcademicYear } from "@/domain/information/normalize";
import { listApprovedFacts } from "@/server/information/fact-repository";

export const DEFAULT_COST_ACADEMIC_YEAR = "2026-2027";
export const DEFAULT_COST_INFLATION_PERCENT: CostScenarioRates = {
  low: 3,
  central: 5,
  high: 7,
};
export const DEFAULT_COST_EXCHANGE_RATE_CNY_PER_USD: CostScenarioRates = {
  low: 7.1,
  central: 7.2,
  high: 7.3,
};

const COST_FIELD_KEYS: Partial<Record<string, CostItemType>> = {
  "cost.tuition": "tuition",
  "cost.fees": "fees",
  "cost.housing": "housing",
  "cost.food": "food",
  "cost.insurance": "insurance",
  "cost.books": "books",
  "cost.transportation": "transportation",
  "cost.personal": "personal",
};

const SCOPE_PRIORITY: Record<FactApplicantScope, number> = {
  international: 0,
  undergraduate: 1,
  graduate: 2,
  all: 3,
};

export interface CostUserAssumptionInput {
  type: CostItemType;
  amount: number | CostAmountRange;
}

export interface CostCenterRequest {
  entityId: string;
  academicYear?: string;
  yearCount?: number;
  inflationPercent?: CostScenarioRates;
  exchangeRateCnyPerUsd?: CostScenarioRates;
  useDefaultAssumptions?: boolean;
  userAssumptions?: CostUserAssumptionInput[];
}

export interface CostIgnoredFact {
  factId: string;
  fieldKey: string;
  reason:
    | "not_approved"
    | "unsupported_field"
    | "wrong_year"
    | "missing_value"
    | "unsupported_currency"
    | "duplicate_scope";
}

export interface CostScholarshipSummary {
  available: boolean | null;
  amount: number | CostAmountRange | null;
  facts: Fact[];
}

export interface CostCenterAggregation {
  entityId: string;
  academicYear: string;
  projection: CostProjectionResult;
  officialItems: CostItem[];
  userAssumptionItems: CostItem[];
  ignoredFacts: CostIgnoredFact[];
  scholarships: CostScholarshipSummary;
}

function sourceName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Approved source";
  }
}

function amountFromFact(fact: Fact): number | CostAmountRange | null {
  if (fact.valueType === "range") {
    return fact.valueRange ?? null;
  }
  if (fact.valueType === "currency" && fact.valueNumber != null) return fact.valueNumber;
  return null;
}

function latestAcademicYear(facts: readonly Fact[]): string {
  const years = facts
    .map((fact) => fact.academicYear)
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return normalizeAcademicYear(value);
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));
  return years.sort((left, right) => right.localeCompare(left))[0] ?? DEFAULT_COST_ACADEMIC_YEAR;
}

function preferredFact(left: Fact, right: Fact): Fact {
  const leftScope = SCOPE_PRIORITY[left.applicantScope ?? "all"];
  const rightScope = SCOPE_PRIORITY[right.applicantScope ?? "all"];
  if (leftScope !== rightScope) return leftScope < rightScope ? left : right;
  return new Date(left.retrievedAt).getTime() >= new Date(right.retrievedAt).getTime() ? left : right;
}

export function buildCostProjectionFromApprovedFacts(
  inputFacts: readonly Fact[],
  request: CostCenterRequest,
): CostCenterAggregation {
  if (!request.inflationPercent && !request.useDefaultAssumptions) {
    throw new Error("inflationPercent is required unless useDefaultAssumptions is true");
  }
  if (!request.exchangeRateCnyPerUsd && !request.useDefaultAssumptions) {
    throw new Error("exchangeRateCnyPerUsd is required unless useDefaultAssumptions is true");
  }

  const baseAcademicYear = normalizeAcademicYear(
    request.academicYear?.trim() || latestAcademicYear(inputFacts),
  );
  const inflationPercent = request.inflationPercent ?? DEFAULT_COST_INFLATION_PERCENT;
  const exchangeRate = request.exchangeRateCnyPerUsd ?? DEFAULT_COST_EXCHANGE_RATE_CNY_PER_USD;
  const assumptions: CostProjectionAssumptions = {
    baseAcademicYear,
    yearCount: request.yearCount ?? 4,
    inflation: {
      default: {
        low: inflationPercent.low / 100,
        central: inflationPercent.central / 100,
        high: inflationPercent.high / 100,
      },
    },
    exchangeRate: {
      cnyPerUsd: exchangeRate,
      quotedAt: new Date().toISOString(),
      sourceName: request.exchangeRateCnyPerUsd
        ? "用户输入汇率"
        : "PathOS 默认规划假设（非实时汇率）",
      sourceUrl: request.exchangeRateCnyPerUsd
        ? "user://cost-center"
        : "local://pathos/default-cost-assumptions",
    },
  };

  const ignoredFacts: CostIgnoredFact[] = [];
  const costFactsByType = new Map<CostItemType, Fact[]>();
  const scholarshipFacts: Fact[] = [];

  for (const fact of inputFacts) {
    if (fact.reviewStatus !== "approved") {
      ignoredFacts.push({ factId: fact.id, fieldKey: fact.fieldKey, reason: "not_approved" });
      continue;
    }
    if (fact.fieldKey.startsWith("aid.")) {
      scholarshipFacts.push(fact);
      continue;
    }

    const type = COST_FIELD_KEYS[fact.fieldKey];
    if (!type) {
      ignoredFacts.push({ factId: fact.id, fieldKey: fact.fieldKey, reason: "unsupported_field" });
      continue;
    }
    let factYear: string | null = null;
    try {
      factYear = fact.academicYear ? normalizeAcademicYear(fact.academicYear) : null;
    } catch {
      factYear = null;
    }
    if (factYear !== baseAcademicYear) {
      ignoredFacts.push({ factId: fact.id, fieldKey: fact.fieldKey, reason: "wrong_year" });
      continue;
    }
    if (amountFromFact(fact) == null || fact.nullReason != null) {
      ignoredFacts.push({ factId: fact.id, fieldKey: fact.fieldKey, reason: "missing_value" });
      continue;
    }
    if (fact.currency !== "USD") {
      ignoredFacts.push({ factId: fact.id, fieldKey: fact.fieldKey, reason: "unsupported_currency" });
      continue;
    }
    costFactsByType.set(type, [...(costFactsByType.get(type) ?? []), fact]);
  }

  const officialItems: CostItem[] = [];
  for (const type of COST_ITEM_TYPES) {
    const candidates = costFactsByType.get(type) ?? [];
    if (candidates.length === 0) continue;
    const selected = candidates.reduce(preferredFact);
    for (const candidate of candidates) {
      if (candidate.id !== selected.id) {
        ignoredFacts.push({
          factId: candidate.id,
          fieldKey: candidate.fieldKey,
          reason: "duplicate_scope",
        });
      }
    }
    const amount = amountFromFact(selected);
    if (amount == null) continue;
    officialItems.push({
      type,
      academicYear: baseAcademicYear,
      currency: "USD",
      origin: "official",
      amount,
      source: {
        name: sourceName(selected.sourceUrl),
        url: selected.sourceUrl,
        retrievedAt: selected.retrievedAt,
      },
      note: selected.notes ?? undefined,
    });
  }

  const userAssumptionItems: CostItem[] = [];
  for (const assumption of request.userAssumptions ?? []) {
    if (!isCostItemType(assumption?.type)) throw new Error("invalid user cost assumption type");
    if (costFactsByType.has(assumption.type)) continue;
    userAssumptionItems.push({
      type: assumption.type,
      academicYear: baseAcademicYear,
      currency: "USD",
      origin: "user_assumption",
      amount: assumption.amount,
    });
  }

  const availableFact = scholarshipFacts.find(
    (fact) => fact.fieldKey === "aid.scholarship_available" && fact.valueBoolean != null,
  );
  const amountFact = scholarshipFacts.find(
    (fact) =>
      (fact.fieldKey === "aid.scholarship_amount" ||
        fact.fieldKey === "aid.scholarship_average_amount") &&
      (fact.valueNumber != null || fact.valueRange != null),
  );

  return {
    entityId: request.entityId.trim(),
    academicYear: baseAcademicYear,
    projection: projectCosts({
      items: [...officialItems, ...userAssumptionItems],
      assumptions,
    }),
    officialItems,
    userAssumptionItems,
    ignoredFacts,
    scholarships: {
      available: availableFact?.valueBoolean ?? null,
      amount: amountFact ? amountFromFact(amountFact) : null,
      facts: scholarshipFacts,
    },
  };
}

export async function aggregateUniversityCost(
  request: CostCenterRequest,
): Promise<CostCenterAggregation> {
  const entityId = request.entityId.trim();
  if (!entityId || entityId.length > 160) throw new Error("invalid university id");
  const academicYear = request.academicYear?.trim()
    ? normalizeAcademicYear(request.academicYear)
    : undefined;
  const facts = await listApprovedFacts({
    entityType: "university",
    entityId,
    academicYear,
  });
  return buildCostProjectionFromApprovedFacts(facts, {
    ...request,
    entityId,
    academicYear,
  });
}
