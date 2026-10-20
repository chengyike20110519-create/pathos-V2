export const FACT_ENTITY_TYPES = [
  "university",
  "program",
  "major",
  "location",
  "scholarship",
  "opportunity",
] as const;
export type FactEntityType = (typeof FACT_ENTITY_TYPES)[number];

export const FACT_VALUE_TYPES = [
  "number",
  "currency",
  "percent",
  "date",
  "text",
  "boolean",
  "enum",
  "range",
  "list",
] as const;
export type FactValueType = (typeof FACT_VALUE_TYPES)[number];

export const FACT_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "stale",
] as const;
export type FactReviewStatus = (typeof FACT_REVIEW_STATUSES)[number];

export const FACT_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type FactConfidence = (typeof FACT_CONFIDENCE_LEVELS)[number];

export const FACT_APPLICANT_SCOPES = [
  "all",
  "international",
  "undergraduate",
  "graduate",
] as const;
export type FactApplicantScope = (typeof FACT_APPLICANT_SCOPES)[number];

export const FACT_NULL_REASONS = [
  "not_reported",
  "not_applicable",
  "source_blocked",
  "source_unavailable",
  "source_review_not_completed",
  "requires_manual_review",
] as const;
export type FactNullReason = (typeof FACT_NULL_REASONS)[number];

export interface FactValue {
  valueNumber?: number | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueRange?: { min: number; max: number } | null;
  valueList?: string[] | null;
}

export interface FactIdentity {
  entityType: FactEntityType;
  entityId: string;
  fieldKey: string;
  academicYear?: string | null;
  applicantScope?: FactApplicantScope | null;
}

export interface FactDraft extends FactIdentity, FactValue {
  valueType: FactValueType;
  unit?: string | null;
  currency?: "USD" | "CNY" | null;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  sourceId: string;
  sourceDocumentId?: string | null;
  sourceUrl: string;
  retrievedAt: string | Date;
  reviewedAt?: string | Date | null;
  reviewStatus?: FactReviewStatus;
  confidence: FactConfidence;
  nullReason?: FactNullReason | null;
  notes?: string | null;
  changeReason?: string | null;
}

export interface Fact extends FactDraft {
  id: string;
  factKey: string;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface FactRevision extends FactDraft {
  id: string;
  factId: string;
  revisionNumber: number;
  createdAt: string;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isFactEntityType(value: unknown): value is FactEntityType {
  return includes(FACT_ENTITY_TYPES, value);
}

export function isFactValueType(value: unknown): value is FactValueType {
  return includes(FACT_VALUE_TYPES, value);
}

export function isFactReviewStatus(value: unknown): value is FactReviewStatus {
  return includes(FACT_REVIEW_STATUSES, value);
}

export function isFactConfidence(value: unknown): value is FactConfidence {
  return includes(FACT_CONFIDENCE_LEVELS, value);
}

export function isFactApplicantScope(value: unknown): value is FactApplicantScope {
  return includes(FACT_APPLICANT_SCOPES, value);
}

export function isFactNullReason(value: unknown): value is FactNullReason {
  return includes(FACT_NULL_REASONS, value);
}

export function hasFactValue(draft: FactValue): boolean {
  return (
    draft.valueNumber != null ||
    draft.valueText != null ||
    draft.valueBoolean != null ||
    draft.valueRange != null ||
    draft.valueList != null
  );
}

export function validateFactValue(
  valueType: FactValueType,
  draft: FactValue,
): { ok: true } | { ok: false; error: string } {
  if (valueType === "range") {
    if (!draft.valueRange) return { ok: false, error: "range fact requires valueRange" };
    if (draft.valueRange.min > draft.valueRange.max) {
      return { ok: false, error: "range min cannot exceed max" };
    }
    return { ok: true };
  }
  if (draft.valueRange != null) return { ok: false, error: "valueRange is only valid for range facts" };
  if (valueType === "list") {
    if (!Array.isArray(draft.valueList) || draft.valueList.length === 0) {
      return { ok: false, error: "list fact requires a non-empty valueList" };
    }
    return { ok: true };
  }
  if (draft.valueList != null) return { ok: false, error: "valueList is only valid for list facts" };
  if (valueType === "number" || valueType === "currency" || valueType === "percent") {
    if (typeof draft.valueNumber !== "number" || !Number.isFinite(draft.valueNumber)) {
      return { ok: false, error: `${valueType} fact requires numeric valueNumber` };
    }
    if (valueType === "percent" && (draft.valueNumber < 0 || draft.valueNumber > 100)) {
      return { ok: false, error: "percent must be between 0 and 100" };
    }
    if (draft.valueText != null || draft.valueBoolean != null) {
      return { ok: false, error: `${valueType} fact cannot mix value types` };
    }
    return { ok: true };
  }
  if (typeof draft.valueNumber === "number") {
    return { ok: false, error: `${valueType} fact cannot use valueNumber` };
  }
  if (valueType === "boolean") {
    if (typeof draft.valueBoolean !== "boolean") {
      return { ok: false, error: "boolean fact requires valueBoolean" };
    }
    if (draft.valueText != null) return { ok: false, error: "boolean fact cannot use valueText" };
    return { ok: true };
  }
  if (draft.valueBoolean != null) return { ok: false, error: `${valueType} fact cannot use valueBoolean` };
  if (typeof draft.valueText !== "string" || draft.valueText.trim().length === 0) {
    return { ok: false, error: `${valueType} fact requires valueText` };
  }
  return { ok: true };
}
