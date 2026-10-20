import type {
  FactApplicantScope,
  FactEntityType,
  FactValueType,
} from "@/domain/information/fact";

export interface ComparableFact {
  entityType: FactEntityType;
  entityId: string;
  fieldKey: string;
  valueType: FactValueType;
  valueNumber?: number | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueRange?: { min: number; max: number } | null;
  valueList?: string[] | null;
  academicYear?: string | null;
  applicantScope?: FactApplicantScope | null;
  sourceId: string;
  sourceUrl: string;
}

export type FactDiffStatus =
  | "new_fact"
  | "unchanged"
  | "proposed_change"
  | "source_update"
  | "conflict";

export interface FactDiff {
  status: FactDiffStatus;
  current: ComparableFact | null;
  incoming: ComparableFact;
  reason: string;
}

export function factSlotKey(fact: Pick<
  ComparableFact,
  "entityType" | "entityId" | "fieldKey" | "academicYear" | "applicantScope"
>): string {
  return [
    fact.entityType,
    fact.entityId.trim().toLowerCase(),
    fact.fieldKey.trim().toLowerCase(),
    fact.academicYear?.trim().toLowerCase() ?? "",
    fact.applicantScope ?? "all",
  ].join("\u0000");
}

export function factValueKey(fact: Pick<
  ComparableFact,
  "valueType" | "valueNumber" | "valueText" | "valueBoolean" | "valueRange" | "valueList"
>): string {
  const list = fact.valueList
    ? [...fact.valueList].map((value) => value.trim().toLowerCase()).sort()
    : null;
  return JSON.stringify([
    fact.valueType,
    fact.valueNumber ?? null,
    fact.valueText?.trim() ?? null,
    fact.valueBoolean ?? null,
    fact.valueRange ? [fact.valueRange.min, fact.valueRange.max] : null,
    list,
  ]);
}

function sameSource(current: ComparableFact, incoming: ComparableFact): boolean {
  return current.sourceId === incoming.sourceId;
}

export function diffFact(
  current: ComparableFact | null,
  incoming: ComparableFact,
): FactDiff {
  if (!current) {
    return { status: "new_fact", current: null, incoming, reason: "no current fact occupies this slot" };
  }
  if (factSlotKey(current) !== factSlotKey(incoming)) {
    throw new Error("cannot compare facts from different slots");
  }
  if (factValueKey(current) === factValueKey(incoming)) {
    return {
      status: sameSource(current, incoming) ? "unchanged" : "source_update",
      current,
      incoming,
      reason: sameSource(current, incoming)
        ? "value and source are unchanged"
        : "value is unchanged but the source reference changed",
    };
  }
  return {
    status: "proposed_change",
    current,
    incoming,
    reason: "normalized value differs from the current fact",
  };
}

export function diffFacts(
  currentFacts: ComparableFact[],
  incomingFacts: ComparableFact[],
): FactDiff[] {
  const bySlot = new Map(currentFacts.map((fact) => [factSlotKey(fact), fact]));
  return incomingFacts.map((incoming) => diffFact(bySlot.get(factSlotKey(incoming)) ?? null, incoming));
}

export interface FactConflict {
  slotKey: string;
  facts: ComparableFact[];
  values: string[];
}

export function detectFactConflicts(facts: ComparableFact[]): FactConflict[] {
  const groups = new Map<string, Map<string, ComparableFact[]>>();
  for (const fact of facts) {
    const slot = factSlotKey(fact);
    const value = factValueKey(fact);
    if (!groups.has(slot)) groups.set(slot, new Map());
    const values = groups.get(slot)!;
    if (!values.has(value)) values.set(value, []);
    values.get(value)!.push(fact);
  }
  const conflicts: FactConflict[] = [];
  for (const [slotKey, values] of groups) {
    if (values.size <= 1) continue;
    conflicts.push({
      slotKey,
      facts: [...values.values()].flat(),
      values: [...values.keys()],
    });
  }
  return conflicts;
}
