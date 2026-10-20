export const COST_ITEM_TYPES = [
  "tuition",
  "fees",
  "housing",
  "food",
  "insurance",
  "books",
  "transportation",
  "personal",
] as const;
export type CostItemType = (typeof COST_ITEM_TYPES)[number];

export const DIRECT_COST_ITEM_TYPES = ["tuition", "fees", "insurance", "books"] as const;
export const INDIRECT_COST_ITEM_TYPES = [
  "housing",
  "food",
  "transportation",
  "personal",
] as const;
export type CostItemGroup = "direct" | "indirect";

export const COST_VALUE_ORIGINS = [
  "official",
  "regional_estimate",
  "user_assumption",
] as const;
export type CostValueOrigin = (typeof COST_VALUE_ORIGINS)[number];

export const COST_CURRENCIES = ["USD"] as const;
export type CostCurrency = (typeof COST_CURRENCIES)[number];
export type CostMoneyCurrency = CostCurrency | "CNY";
export type CostSummaryGroup = CostItemGroup | "all";
export type CostMoneyRangeBasis = "provided_items" | "no_items";

export interface CostMoneyRange {
  min: number;
  median: number;
  max: number;
  currency: CostMoneyCurrency;
  basis: CostMoneyRangeBasis;
}

export interface CostAmountRange {
  min: number;
  max: number;
}

export interface CostSource {
  name: string;
  url: string;
  retrievedAt: string | Date;
}

export interface CostItem {
  type: CostItemType;
  academicYear: string;
  currency: CostCurrency;
  origin: CostValueOrigin;
  amount: number | CostAmountRange;
  source?: CostSource;
  note?: string;
}

export interface CostMissingItem {
  type: CostItemType;
  group: CostItemGroup;
  reason: "not_provided";
}

export interface CostScenarioRates {
  low: number;
  central: number;
  high: number;
}

export interface CostInflationAssumptions {
  default: CostScenarioRates;
  byItem?: Partial<Record<CostItemType, CostScenarioRates>>;
}

export interface CostExchangeRateAssumption {
  cnyPerUsd: CostScenarioRates;
  quotedAt: string | Date;
  sourceName: string;
  sourceUrl: string;
}

export interface CostProjectionAssumptions {
  baseAcademicYear: string;
  yearCount: number;
  inflation: CostInflationAssumptions;
  exchangeRate: CostExchangeRateAssumption;
}

export interface CostProjectionInput {
  items: CostItem[];
  assumptions: CostProjectionAssumptions;
}

export interface CostGroupSummary {
  group: CostSummaryGroup;
  official: CostMoneyRange;
  assumptions: CostMoneyRange;
  combined: CostMoneyRange;
}

export interface CostAnnualScenario {
  scenario: "low" | "central" | "high";
  official: CostMoneyRange;
  assumptions: CostMoneyRange;
  direct: CostMoneyRange;
  indirect: CostMoneyRange;
  combined: CostMoneyRange;
}

export interface CostAnnualProjection {
  academicYear: string;
  yearOffset: number;
  inflationFactor: number;
  scenarios: {
    low: CostAnnualScenario;
    central: CostAnnualScenario;
    high: CostAnnualScenario;
  };
  range: {
    usd: CostMoneyRange;
    cny: CostMoneyRange;
  };
  missingItems: CostMissingItem[];
}

export interface CostAnnualAggregation {
  academicYear: string;
  official: CostGroupSummary;
  assumptions: CostGroupSummary;
  direct: CostGroupSummary;
  indirect: CostGroupSummary;
  combined: CostGroupSummary;
  missingItems: CostMissingItem[];
  assumptionNotes: string[];
  isComplete: boolean;
}

export interface CostProjectionResult {
  baseYear: CostAnnualAggregation;
  assumptions: CostProjectionAssumptions;
  assumptionNotes: string[];
  years: CostAnnualProjection[];
  total: {
    usd: CostMoneyRange;
    cny: CostMoneyRange;
  };
}

export type CostModelValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isCostItemType(value: unknown): value is CostItemType {
  return includes(COST_ITEM_TYPES, value);
}

export function isCostValueOrigin(value: unknown): value is CostValueOrigin {
  return includes(COST_VALUE_ORIGINS, value);
}

export function getCostItemGroup(type: CostItemType): CostItemGroup {
  return (DIRECT_COST_ITEM_TYPES as readonly string[]).includes(type) ? "direct" : "indirect";
}

export function isAssumedCostOrigin(origin: CostValueOrigin): boolean {
  return origin !== "official";
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateScenarioRates(
  rates: CostScenarioRates,
  label: string,
  allowZero: boolean,
  errors: string[],
): void {
  for (const key of ["low", "central", "high"] as const) {
    const value = rates[key];
    if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
      errors.push(`${label}.${key} must be a finite ${allowZero ? "non-negative" : "positive"} number`);
    }
  }
  if (
    Number.isFinite(rates.low) &&
    Number.isFinite(rates.central) &&
    Number.isFinite(rates.high) &&
    !(rates.low <= rates.central && rates.central <= rates.high)
  ) {
    errors.push(`${label} must be ordered low <= central <= high`);
  }
}

export function validateCostItems(items: CostItem[]): CostModelValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();

  items.forEach((item, index) => {
    const label = `items[${index}]`;
    if (!isCostItemType(item.type)) {
      errors.push(`${label}.type is not a supported cost item type`);
    }
    if (typeof item.academicYear !== "string" || item.academicYear.trim().length === 0) {
      errors.push(`${label}.academicYear is required`);
    } else {
      try {
        normalizeAcademicYear(item.academicYear);
      } catch {
        errors.push(`${label}.academicYear is invalid`);
      }
    }
    if (item.currency !== "USD") {
      errors.push(`${label}.currency must be USD`);
    }
    if (!isCostValueOrigin(item.origin)) {
      errors.push(`${label}.origin is not a supported cost value origin`);
    }
    if (typeof item.amount === "number") {
      if (!isFiniteNonNegativeNumber(item.amount)) {
        errors.push(`${label}.amount must be a finite non-negative number`);
      }
    } else if (item.amount && typeof item.amount === "object") {
      const { min, max } = item.amount;
      if (!isFiniteNonNegativeNumber(min) || !isFiniteNonNegativeNumber(max)) {
        errors.push(`${label}.amount range values must be finite non-negative numbers`);
      } else if (min > max) {
        errors.push(`${label}.amount min cannot exceed max`);
      }
    } else {
      errors.push(`${label}.amount is required`);
    }

    const key = `${item.type}|${item.origin}|${item.academicYear}`;
    if (seen.has(key)) {
      errors.push(`${label} duplicates ${item.type} (${item.origin}, ${item.academicYear})`);
    }
    seen.add(key);

    if (item.origin === "official" && !item.source) {
      errors.push(`${label}.source is required for official cost values`);
    }
    if (item.source) {
      if (!item.source.name || !item.source.url || !item.source.retrievedAt) {
        errors.push(`${label}.source requires name, url, and retrievedAt`);
      }
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export function validateCostProjectionInput(input: CostProjectionInput): CostModelValidationResult {
  const errors: string[] = [];
  const itemsResult = validateCostItems(input.items);
  if (!itemsResult.ok) errors.push(...itemsResult.errors);

  const assumptions = input.assumptions;
  if (!assumptions.baseAcademicYear?.trim()) {
    errors.push("assumptions.baseAcademicYear is required");
  } else {
    try {
      normalizeAcademicYear(assumptions.baseAcademicYear);
    } catch {
      errors.push("assumptions.baseAcademicYear is invalid");
    }
  }
  if (!Number.isInteger(assumptions.yearCount) || assumptions.yearCount < 1 || assumptions.yearCount > 10) {
    errors.push("assumptions.yearCount must be an integer from 1 through 10");
  }
  if (!assumptions.inflation?.default) {
    errors.push("assumptions.inflation.default is required");
  } else {
    validateScenarioRates(assumptions.inflation.default, "assumptions.inflation.default", true, errors);
  }
  if (assumptions.inflation?.byItem) {
    for (const [type, rates] of Object.entries(assumptions.inflation.byItem)) {
      if (!isCostItemType(type)) {
        errors.push(`assumptions.inflation.byItem.${type} is not a supported cost item type`);
      }
      if (rates) validateScenarioRates(rates, `assumptions.inflation.byItem.${type}`, true, errors);
    }
  }
  if (!assumptions.exchangeRate?.cnyPerUsd) {
    errors.push("assumptions.exchangeRate.cnyPerUsd is required");
  } else {
    validateScenarioRates(
      assumptions.exchangeRate.cnyPerUsd,
      "assumptions.exchangeRate.cnyPerUsd",
      false,
      errors,
    );
    if (!assumptions.exchangeRate.quotedAt) {
      errors.push("assumptions.exchangeRate.quotedAt is required");
    }
    if (!assumptions.exchangeRate.sourceName || !assumptions.exchangeRate.sourceUrl) {
      errors.push("assumptions.exchangeRate sourceName and sourceUrl are required");
    }
  }
  if (itemsResult.ok) {
    for (const [index, item] of input.items.entries()) {
      if (item.academicYear !== assumptions.baseAcademicYear) {
        errors.push(`items[${index}].academicYear must match assumptions.baseAcademicYear`);
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

function amountRange(amount: number | CostAmountRange): CostAmountRange {
  return typeof amount === "number" ? { min: amount, max: amount } : amount;
}

function medianRange(range: CostAmountRange): number {
  return (range.min + range.max) / 2;
}

function money(min: number, median: number, max: number): CostMoneyRange {
  return {
    min: roundMoney(Math.max(min, 0)),
    median: roundMoney(Math.max(median, 0)),
    max: roundMoney(Math.max(max, 0)),
    currency: "USD",
    basis: "provided_items",
  };
}

function cnyMoney(min: number, median: number, max: number): CostMoneyRange {
  return {
    min: roundMoney(Math.max(min, 0)),
    median: roundMoney(Math.max(median, 0)),
    max: roundMoney(Math.max(max, 0)),
    currency: "CNY",
    basis: "provided_items",
  };
}

function addRanges(a: CostMoneyRange | null, b: CostMoneyRange | null): CostMoneyRange | null {
  if (!a) return b;
  if (!b) return a;
  return {
    min: a.min + b.min,
    median: a.median + b.median,
    max: a.max + b.max,
    currency: "USD",
    basis: a.basis === "provided_items" || b.basis === "provided_items" ? "provided_items" : "no_items",
  };
}

function scaleAmount(range: CostAmountRange, factor: number): CostAmountRange {
  return { min: range.min * factor, max: range.max * factor };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyMoney(): CostMoneyRange {
  return { min: 0, median: 0, max: 0, currency: "USD", basis: "no_items" };
}

function itemMoney(item: { amount: number | CostAmountRange }): CostMoneyRange {
  const range = amountRange(item.amount);
  return money(range.min, medianRange(range), range.max);
}

function summarizeItems(items: CostItem[], group: CostItemGroup): CostMoneyRange {
  return summarizeValuedItems(items, group);
}

function summarizeValuedItems(
  items: ReadonlyArray<{ type: CostItemType; amount: number | CostAmountRange }>,
  group: CostItemGroup,
): CostMoneyRange {
  return items
    .filter((item) => getCostItemGroup(item.type) === group)
    .reduce<CostMoneyRange | null>((total, item) => addRanges(total, itemMoney(item)), null) ?? emptyMoney();
}

function groupSummary(items: CostItem[], group: CostItemGroup): CostGroupSummary {
  const officialItems = items.filter((item) => item.origin === "official");
  const assumptionItems = items.filter((item) => isAssumedCostOrigin(item.origin));
  const official = summarizeItems(officialItems, group);
  const assumptions = summarizeItems(assumptionItems, group);
  const combined = addRanges(official, assumptions) ?? emptyMoney();
  return { group, official, assumptions, combined };
}

function scenarioSummary(
  items: CostItem[],
  scenario: "low" | "central" | "high",
  inflation: CostInflationAssumptions,
  yearOffset: number,
): Pick<CostAnnualScenario, "official" | "assumptions" | "direct" | "indirect" | "combined"> {
  const adjusted = items.map((item) => {
    const rates = inflation.byItem?.[item.type] ?? inflation.default;
    const rate = rates[scenario];
    const factor = Math.pow(1 + rate, yearOffset);
    const original = amountRange(item.amount);
    return { type: item.type, amount: scaleAmount(original, factor) };
  });
  const adjustedWithType = adjusted.map((item, index) => ({ ...item, origin: items[index].origin }));
  const officialItems = adjustedWithType.filter((item) => item.origin === "official");
  const assumptionItems = adjustedWithType.filter((item) => item.origin !== "official");
  const direct = summarizeValuedItems(adjusted, "direct");
  const indirect = summarizeValuedItems(adjusted, "indirect");
  const official = addRanges(
    summarizeValuedItems(officialItems, "direct"),
    summarizeValuedItems(officialItems, "indirect"),
  ) ?? emptyMoney();
  const assumptionTotal = addRanges(
    summarizeValuedItems(assumptionItems, "direct"),
    summarizeValuedItems(assumptionItems, "indirect"),
  ) ?? emptyMoney();
  return {
    official,
    assumptions: assumptionTotal,
    direct,
    indirect,
    combined: addRanges(direct, indirect) ?? emptyMoney(),
  };
}

export function listMissingCostItems(items: CostItem[]): CostMissingItem[] {
  const present = new Set(items.map((item) => item.type));
  return COST_ITEM_TYPES
    .filter((type) => !present.has(type))
    .map((type) => ({
      type,
      group: getCostItemGroup(type),
      reason: "not_provided" as const,
    }));
}

export function buildCostAssumptionNotes(
  items: CostItem[],
  assumptions: CostProjectionAssumptions,
): string[] {
  const notes: string[] = [];
  const assumedItems = items.filter((item) => isAssumedCostOrigin(item.origin));
  for (const item of assumedItems) {
    notes.push(`${item.type} uses ${item.origin.replace("_", " ")} values, not an official value`);
  }
  notes.push(
    `Inflation scenarios: low ${formatRate(assumptions.inflation.default.low)}, central ${formatRate(
      assumptions.inflation.default.central,
    )}, high ${formatRate(assumptions.inflation.default.high)} per year`,
  );
  for (const [type, rates] of Object.entries(assumptions.inflation.byItem ?? {})) {
    if (!rates) continue;
    notes.push(
      `${type} inflation: low ${formatRate(rates.low)}, central ${formatRate(rates.central)}, high ${formatRate(
        rates.high,
      )} per year`,
    );
  }
  notes.push(
    `Exchange rate assumption: ${assumptions.exchangeRate.cnyPerUsd.low}-${
      assumptions.exchangeRate.cnyPerUsd.high
    } CNY/USD (central ${assumptions.exchangeRate.cnyPerUsd.central}), quoted at ${
      assumptions.exchangeRate.quotedAt
    }, source ${assumptions.exchangeRate.sourceName}`,
  );
  return notes;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

export function aggregateAnnualCost(items: CostItem[], academicYear: string): CostAnnualAggregation {
  const validation = validateCostItems(items);
  if (!validation.ok) {
    throw new Error(`Invalid cost items: ${validation.errors.join("; ")}`);
  }
  const normalizedYear = normalizeAcademicYear(academicYear);
  const normalizedItems = items.map((item) => ({
    ...item,
    academicYear: normalizeAcademicYear(item.academicYear),
  }));
  const yearItems = normalizedItems.filter((item) => item.academicYear === normalizedYear);
  const missingItems = listMissingCostItems(yearItems);
  return {
    academicYear: normalizedYear,
    official: overallSummary(yearItems),
    assumptions: overallAssumptionSummary(yearItems),
    direct: groupSummary(yearItems, "direct"),
    indirect: groupSummary(yearItems, "indirect"),
    combined: overallSummary(yearItems),
    missingItems,
    assumptionNotes: buildAnnualAssumptionNotes(yearItems),
    isComplete: missingItems.length === 0,
  };
}

function overallSummary(items: CostItem[]): CostGroupSummary {
  const officialItems = items.filter((item) => item.origin === "official");
  const assumptionItems = items.filter((item) => isAssumedCostOrigin(item.origin));
  const official = addRanges(
    summarizeItems(officialItems, "direct"),
    summarizeItems(officialItems, "indirect"),
  ) ?? emptyMoney();
  const assumptions = addRanges(
    summarizeItems(assumptionItems, "direct"),
    summarizeItems(assumptionItems, "indirect"),
  ) ?? emptyMoney();
  return {
    group: "all",
    official,
    assumptions,
    combined: addRanges(official, assumptions) ?? emptyMoney(),
  };
}

function overallAssumptionSummary(items: CostItem[]): CostGroupSummary {
  const assumptions = addSummaries(items, "assumption");
  return { group: "all", official: emptyMoney(), assumptions, combined: assumptions };
}

function addSummaries(
  items: CostItem[],
  selector: "official" | "assumption" | "all",
): CostMoneyRange {
  const selected = items.filter((item) => {
    if (selector === "all") return true;
    if (selector === "official") return item.origin === "official";
    return isAssumedCostOrigin(item.origin);
  });
  return addRanges(summarizeItems(selected, "direct"), summarizeItems(selected, "indirect")) ?? emptyMoney();
}

function buildAnnualAssumptionNotes(items: CostItem[]): string[] {
  return items
    .filter((item) => isAssumedCostOrigin(item.origin))
    .map((item) => `${item.type} uses ${item.origin.replace("_", " ")} values, not an official value`);
}

function nextAcademicYear(academicYear: string, offset: number): string {
  const match = /^(\d{4})-(\d{4})$/.exec(academicYear);
  if (!match) return `${academicYear}+${offset}`;
  const start = Number(match[1]) + offset;
  return `${start}-${start + 1}`;
}

function annualScenario(
  scenario: "low" | "central" | "high",
  items: CostItem[],
  inflation: CostInflationAssumptions,
  yearOffset: number,
): CostAnnualScenario {
  return {
    scenario,
    ...scenarioSummary(items, scenario, inflation, yearOffset),
  };
}

function rangeFromScenarios(scenarios: CostAnnualScenario[]): CostMoneyRange {
  if (scenarios.length === 0) return emptyMoney();
  if (scenarios.every((scenario) => scenario.combined.basis === "no_items")) return emptyMoney();
  return money(
    Math.min(...scenarios.map((scenario) => scenario.combined.min)),
    scenarios.find((scenario) => scenario.scenario === "central")?.combined.median ?? 0,
    Math.max(...scenarios.map((scenario) => scenario.combined.max)),
  );
}

function cnyRangeFromScenarios(
  scenarios: CostAnnualScenario[],
  exchangeRate: CostScenarioRates,
): CostMoneyRange {
  const usd = rangeFromScenarios(scenarios);
  return cnyMoney(
    usd.min * exchangeRate.low,
    usd.median * exchangeRate.central,
    usd.max * exchangeRate.high,
  );
}

export function projectCosts(input: CostProjectionInput): CostProjectionResult {
  const validation = validateCostProjectionInput(input);
  if (!validation.ok) {
    throw new Error(`Invalid cost projection: ${validation.errors.join("; ")}`);
  }

  const { assumptions: rawAssumptions } = input;
  const assumptions: CostProjectionAssumptions = {
    ...rawAssumptions,
    baseAcademicYear: normalizeAcademicYear(rawAssumptions.baseAcademicYear),
  };
  const items = input.items.map((item) => ({
    ...item,
    academicYear: normalizeAcademicYear(item.academicYear),
  }));
  const baseYear = aggregateAnnualCost(items, assumptions.baseAcademicYear);
  const years: CostAnnualProjection[] = [];
  let totalLow = 0;
  let totalMedian = 0;
  let totalHigh = 0;

  for (let offset = 0; offset < assumptions.yearCount; offset += 1) {
    const scenarios = {
      low: annualScenario("low", items, assumptions.inflation, offset),
      central: annualScenario("central", items, assumptions.inflation, offset),
      high: annualScenario("high", items, assumptions.inflation, offset),
    };
    const usd = rangeFromScenarios([scenarios.low, scenarios.central, scenarios.high]);
    const cny = cnyRangeFromScenarios(
      [scenarios.low, scenarios.central, scenarios.high],
      assumptions.exchangeRate.cnyPerUsd,
    );
    years.push({
      academicYear: nextAcademicYear(assumptions.baseAcademicYear, offset),
      yearOffset: offset,
      inflationFactor: Math.pow(1 + assumptions.inflation.default.central, offset),
      scenarios,
      range: { usd, cny },
      missingItems: baseYear.missingItems,
    });
    totalLow += usd.min;
    totalMedian += usd.median;
    totalHigh += usd.max;
  }

  const hasProvidedItems = years.some((year) => year.range.usd.basis === "provided_items");
  return {
    baseYear,
    assumptions,
    assumptionNotes: buildCostAssumptionNotes(items, assumptions),
    years,
    total: hasProvidedItems
      ? {
          usd: money(totalLow, totalMedian, totalHigh),
          cny: cnyMoney(
            totalLow * assumptions.exchangeRate.cnyPerUsd.low,
            totalMedian * assumptions.exchangeRate.cnyPerUsd.central,
            totalHigh * assumptions.exchangeRate.cnyPerUsd.high,
          ),
        }
      : {
          usd: emptyMoney(),
          cny: { min: 0, median: 0, max: 0, currency: "CNY", basis: "no_items" },
        },
  };
}
import { normalizeAcademicYear } from "@/domain/information/normalize";
