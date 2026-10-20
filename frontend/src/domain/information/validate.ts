import {
  hasFactValue,
  validateFactValue,
  type FactDraft,
  type FactValueType,
} from "@/domain/information/fact";

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function issue(code: string, message: string, field?: string): ValidationIssue {
  return { code, message, field };
}

export function validateFieldBounds(
  fieldKey: string,
  valueType: FactValueType,
  draft: Pick<FactDraft, "valueNumber" | "valueRange">,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (valueType === "percent") {
    const value = draft.valueNumber;
    if (value != null && (value < 0 || value > 100)) {
      issues.push(issue("PERCENT_OUT_OF_RANGE", "percent must be between 0 and 100", fieldKey));
    }
  }
  if (valueType === "currency" && draft.valueNumber != null && draft.valueNumber < 0) {
    issues.push(issue("NEGATIVE_CURRENCY", "currency cannot be negative", fieldKey));
  }
  if (fieldKey.startsWith("admission.sat_") && draft.valueRange) {
    const { min, max } = draft.valueRange;
    if (min < 400 || max > 1600) {
      issues.push(issue("SAT_OUT_OF_RANGE", "SAT range must remain between 400 and 1600", fieldKey));
    }
  }
  if (fieldKey.startsWith("admission.act_") && draft.valueRange) {
    const { min, max } = draft.valueRange;
    if (min < 1 || max > 36) {
      issues.push(issue("ACT_OUT_OF_RANGE", "ACT range must remain between 1 and 36", fieldKey));
    }
  }
  return issues;
}

export function validateFactDraft(draft: FactDraft): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!draft.entityId.trim()) issues.push(issue("ENTITY_ID_REQUIRED", "entityId is required"));
  if (!draft.fieldKey.trim()) issues.push(issue("FIELD_KEY_REQUIRED", "fieldKey is required"));
  if (!draft.sourceId.trim()) issues.push(issue("SOURCE_REQUIRED", "sourceId is required"));
  if (!/^https?:\/\//.test(draft.sourceUrl)) {
    issues.push(issue("SOURCE_URL_REQUIRED", "sourceUrl must be http(s)"));
  }
  if (!draft.retrievedAt) {
    issues.push(issue("RETRIEVED_AT_REQUIRED", "retrievedAt is required"));
  }

  if (draft.nullReason != null && hasFactValue(draft)) {
    issues.push(issue("NULL_REASON_WITH_VALUE", "a missing fact cannot carry a value"));
  }
  if (draft.nullReason == null) {
    const valueResult = validateFactValue(draft.valueType, draft);
    if (!valueResult.ok) issues.push(issue("INVALID_VALUE", valueResult.error, draft.fieldKey));
  }

  if (draft.valueType === "currency" && draft.valueNumber != null && draft.currency !== "USD" && draft.currency !== "CNY") {
    issues.push(issue("CURRENCY_REQUIRED", "currency facts require USD or CNY", draft.fieldKey));
  }
  issues.push(...validateFieldBounds(draft.fieldKey, draft.valueType, draft));

  if (draft.effectiveFrom && draft.effectiveTo) {
    const from = new Date(draft.effectiveFrom).getTime();
    const to = new Date(draft.effectiveTo).getTime();
    if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
      issues.push(issue("EFFECTIVE_PERIOD_REVERSED", "effectiveFrom is after effectiveTo", draft.fieldKey));
    }
  }

  return { ok: issues.length === 0, issues };
}
