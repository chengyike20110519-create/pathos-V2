import { createHash, randomBytes } from "node:crypto";
import { getPool } from "@/server/db";
import {
  isFactApplicantScope,
  isFactConfidence,
  isFactEntityType,
  isFactNullReason,
  isFactReviewStatus,
  isFactValueType,
  validateFactValue,
  hasFactValue,
  type Fact,
  type FactApplicantScope,
  type FactConfidence,
  type FactDraft,
  type FactEntityType,
  type FactRevision,
  type FactReviewStatus,
  type FactValueType,
} from "@/domain/information/fact";

const FACT_SELECT_COLUMNS = `id, fact_key, entity_type, entity_id, field_key,
  value_type, value_number, value_text, value_boolean, value_range_min,
  value_range_max, value_list, unit, currency, academic_year, effective_from,
  effective_to, applicant_scope, source_id, source_document_id, source_url,
  retrieved_at, reviewed_at, review_status, confidence, null_reason, notes,
  current_revision, created_at, updated_at`;

const REVISION_SELECT_COLUMNS = `id, fact_id, revision_number, entity_type,
  entity_id, field_key, value_type, value_number, value_text, value_boolean,
  value_range_min, value_range_max, value_list, unit, currency, academic_year,
  effective_from, effective_to, applicant_scope, source_id,
  source_document_id, source_url, retrieved_at, reviewed_at, review_status,
  confidence, null_reason, notes, change_reason, created_at`;

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("hex")}`;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid date value");
  return date;
}

function toIso(value: unknown): string {
  return toDate(value as Date | string | null)?.toISOString() ?? "";
}

function numeric(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function list(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.map((item) => String(item));
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildFactKey(draft: FactDraft): string {
  return createHash("sha256")
    .update(
      [
        draft.entityType,
        draft.entityId.trim().toLowerCase(),
        draft.fieldKey.trim().toLowerCase(),
        draft.academicYear?.trim().toLowerCase() ?? "",
        draft.applicantScope ?? "all",
      ].join("\u0000"),
    )
    .digest("hex");
}

export function assertFactDraft(draft: FactDraft): void {
  if (!isFactEntityType(draft.entityType)) throw new Error("invalid fact entity type");
  if (!draft.entityId.trim()) throw new Error("fact entityId is required");
  if (!draft.fieldKey.trim() || draft.fieldKey.length > 160) {
    throw new Error("fact fieldKey is required and must be at most 160 characters");
  }
  if (!isFactValueType(draft.valueType)) throw new Error("invalid fact value type");
  if (!isFactConfidence(draft.confidence)) throw new Error("invalid fact confidence");
  if (draft.reviewStatus != null && !isFactReviewStatus(draft.reviewStatus)) {
    throw new Error("invalid fact review status");
  }
  if (draft.applicantScope != null && !isFactApplicantScope(draft.applicantScope)) {
    throw new Error("invalid applicant scope");
  }
  if (draft.nullReason != null && !isFactNullReason(draft.nullReason)) {
    throw new Error("invalid null reason");
  }
  if (!draft.sourceId.trim()) throw new Error("sourceId is required");
  if (!draft.sourceUrl.trim()) throw new Error("sourceUrl is required");
  if (!toDate(draft.retrievedAt)) throw new Error("retrievedAt is required");
  if (draft.effectiveFrom && draft.effectiveTo) {
    const from = toDate(draft.effectiveFrom);
    const to = toDate(draft.effectiveTo);
    if (from && to && from > to) throw new Error("effectiveFrom cannot be after effectiveTo");
  }
  if (draft.nullReason != null) {
    if (hasFactValue(draft)) throw new Error("a null-reason fact cannot also carry a value");
  } else {
    const result = validateFactValue(draft.valueType, draft);
    if (!result.ok) throw new Error(result.error);
  }
}

function rowToFact(row: Record<string, unknown>): Fact {
  return {
    id: String(row.id),
    factKey: String(row.fact_key),
    entityType: row.entity_type as FactEntityType,
    entityId: String(row.entity_id),
    fieldKey: String(row.field_key),
    valueType: row.value_type as FactValueType,
    valueNumber: numeric(row.value_number),
    valueText: row.value_text == null ? null : String(row.value_text),
    valueBoolean: row.value_boolean == null ? null : row.value_boolean === true,
    valueRange:
      row.value_range_min == null || row.value_range_max == null
        ? null
        : { min: Number(row.value_range_min), max: Number(row.value_range_max) },
    valueList: list(row.value_list),
    unit: row.unit == null ? null : String(row.unit),
    currency: row.currency == null ? null : (row.currency as Fact["currency"]),
    academicYear: row.academic_year == null ? null : String(row.academic_year),
    effectiveFrom: toIso(row.effective_from) || null,
    effectiveTo: toIso(row.effective_to) || null,
    applicantScope: row.applicant_scope == null ? null : (row.applicant_scope as FactApplicantScope),
    sourceId: String(row.source_id),
    sourceDocumentId: row.source_document_id == null ? null : String(row.source_document_id),
    sourceUrl: String(row.source_url),
    retrievedAt: toIso(row.retrieved_at),
    reviewedAt: toIso(row.reviewed_at) || null,
    reviewStatus: row.review_status as FactReviewStatus,
    confidence: row.confidence as FactConfidence,
    nullReason: row.null_reason == null ? null : (row.null_reason as Fact["nullReason"]),
    notes: row.notes == null ? null : String(row.notes),
    currentRevision: Number(row.current_revision ?? 1),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToRevision(row: Record<string, unknown>): FactRevision {
  return {
    id: String(row.id),
    factId: String(row.fact_id),
    revisionNumber: Number(row.revision_number),
    entityType: row.entity_type as FactEntityType,
    entityId: String(row.entity_id),
    fieldKey: String(row.field_key),
    valueType: row.value_type as FactValueType,
    valueNumber: numeric(row.value_number),
    valueText: row.value_text == null ? null : String(row.value_text),
    valueBoolean: row.value_boolean == null ? null : row.value_boolean === true,
    valueRange:
      row.value_range_min == null || row.value_range_max == null
        ? null
        : { min: Number(row.value_range_min), max: Number(row.value_range_max) },
    valueList: list(row.value_list),
    unit: row.unit == null ? null : String(row.unit),
    currency: row.currency == null ? null : (row.currency as FactRevision["currency"]),
    academicYear: row.academic_year == null ? null : String(row.academic_year),
    effectiveFrom: toIso(row.effective_from) || null,
    effectiveTo: toIso(row.effective_to) || null,
    applicantScope: row.applicant_scope == null ? null : (row.applicant_scope as FactApplicantScope),
    sourceId: String(row.source_id),
    sourceDocumentId: row.source_document_id == null ? null : String(row.source_document_id),
    sourceUrl: String(row.source_url),
    retrievedAt: toIso(row.retrieved_at),
    reviewedAt: toIso(row.reviewed_at) || null,
    reviewStatus: row.review_status as FactReviewStatus,
    confidence: row.confidence as FactConfidence,
    nullReason: row.null_reason == null ? null : (row.null_reason as FactRevision["nullReason"]),
    notes: row.notes == null ? null : String(row.notes),
    changeReason: row.change_reason == null ? null : String(row.change_reason),
    createdAt: toIso(row.created_at),
  };
}

export interface UpsertFactResult {
  fact: Fact;
  revision: FactRevision;
}

export async function upsertFact(draft: FactDraft): Promise<UpsertFactResult> {
  assertFactDraft(draft);
  const factId = newId("fact");
  const revisionId = newId("frev");
  const factKey = buildFactKey(draft);
  const valueList = draft.valueList ? JSON.stringify(draft.valueList) : null;
  const params: unknown[] = [
    factId,
    factKey,
    draft.entityType,
    draft.entityId.trim(),
    draft.fieldKey.trim(),
    draft.valueType,
    draft.valueNumber ?? null,
    draft.valueText ?? null,
    draft.valueBoolean ?? null,
    draft.valueRange?.min ?? null,
    draft.valueRange?.max ?? null,
    valueList,
    draft.unit ?? null,
    draft.currency ?? null,
    draft.academicYear?.trim() || null,
    toDate(draft.effectiveFrom),
    toDate(draft.effectiveTo),
    draft.applicantScope ?? null,
    draft.sourceId.trim(),
    draft.sourceDocumentId ?? null,
    draft.sourceUrl.trim(),
    toDate(draft.retrievedAt),
    toDate(draft.reviewedAt),
    draft.reviewStatus ?? "pending",
    draft.confidence,
    draft.nullReason ?? null,
    draft.notes ?? null,
    revisionId,
    draft.changeReason?.trim() || null,
  ];

  const r = await getPool().query(
    `WITH upserted AS (
       INSERT INTO facts (
         id, fact_key, entity_type, entity_id, field_key, value_type,
         value_number, value_text, value_boolean, value_range_min, value_range_max,
         value_list, unit, currency, academic_year, effective_from, effective_to,
         applicant_scope, source_id, source_document_id, source_url, retrieved_at,
         reviewed_at, review_status, confidence, null_reason, notes, current_revision
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,
         $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,1
       )
       ON CONFLICT (fact_key) DO UPDATE SET
         value_type = EXCLUDED.value_type,
         value_number = EXCLUDED.value_number,
         value_text = EXCLUDED.value_text,
         value_boolean = EXCLUDED.value_boolean,
         value_range_min = EXCLUDED.value_range_min,
         value_range_max = EXCLUDED.value_range_max,
         value_list = EXCLUDED.value_list,
         unit = EXCLUDED.unit,
         currency = EXCLUDED.currency,
         academic_year = EXCLUDED.academic_year,
         effective_from = EXCLUDED.effective_from,
         effective_to = EXCLUDED.effective_to,
         applicant_scope = EXCLUDED.applicant_scope,
         source_id = EXCLUDED.source_id,
         source_document_id = EXCLUDED.source_document_id,
         source_url = EXCLUDED.source_url,
         retrieved_at = EXCLUDED.retrieved_at,
         reviewed_at = EXCLUDED.reviewed_at,
         review_status = EXCLUDED.review_status,
         confidence = EXCLUDED.confidence,
         null_reason = EXCLUDED.null_reason,
         notes = EXCLUDED.notes,
         current_revision = facts.current_revision + 1,
         updated_at = NOW()
       RETURNING *
     ), inserted_revision AS (
       INSERT INTO fact_revisions (
         id, fact_id, revision_number, entity_type, entity_id, field_key,
         value_type, value_number, value_text, value_boolean, value_range_min,
         value_range_max, value_list, unit, currency, academic_year,
         effective_from, effective_to, applicant_scope, source_id,
         source_document_id, source_url, retrieved_at, reviewed_at,
         review_status, confidence, null_reason, notes, change_reason
       )
       SELECT $28, id, current_revision, $3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,
              $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$29
         FROM upserted
       RETURNING *
     )
     SELECT i.*, u.current_revision, u.created_at AS fact_created_at,
            u.updated_at AS fact_updated_at
       FROM inserted_revision i
       JOIN upserted u ON u.id = i.fact_id`,
    params,
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("fact upsert returned no row");
  const revision = rowToRevision(row);
  const fact: Fact = {
    ...draft,
    entityId: draft.entityId.trim(),
    fieldKey: draft.fieldKey.trim(),
    academicYear: draft.academicYear?.trim() || null,
    sourceId: draft.sourceId.trim(),
    sourceUrl: draft.sourceUrl.trim(),
    reviewedAt: toDate(draft.reviewedAt)?.toISOString() ?? null,
    reviewStatus: draft.reviewStatus ?? "pending",
    id: revision.factId,
    factKey,
    currentRevision: Number(row.current_revision ?? revision.revisionNumber),
    createdAt: toIso(row.fact_created_at),
    updatedAt: toIso(row.fact_updated_at),
  };
  return { fact, revision };
}

export async function createFact(draft: FactDraft): Promise<UpsertFactResult> {
  return upsertFact(draft);
}

export async function updateFact(draft: FactDraft): Promise<UpsertFactResult> {
  return upsertFact(draft);
}

export async function getFact(id: string): Promise<Fact | null> {
  if (!id || id.length > 64) return null;
  const r = await getPool().query(
    `SELECT ${FACT_SELECT_COLUMNS} FROM facts WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return row ? rowToFact(row as Record<string, unknown>) : null;
}

export async function setFactReviewStatus(
  id: string,
  status: FactReviewStatus,
): Promise<Fact | null> {
  if (!id || id.length > 64) return null;
  if (!isFactReviewStatus(status)) return null;
  const r = await getPool().query(
    `WITH updated_fact AS (
       UPDATE facts
          SET review_status = $2,
              reviewed_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *
     ), updated_revision AS (
       UPDATE fact_revisions r
          SET review_status = $2,
              reviewed_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END
         FROM updated_fact f
        WHERE r.fact_id = f.id
          AND r.revision_number = f.current_revision
        RETURNING r.*
     )
     SELECT ${FACT_SELECT_COLUMNS} FROM updated_fact`,
    [id, status],
  );
  const row = r.rows[0];
  return row ? rowToFact(row as Record<string, unknown>) : null;
}

export interface ApprovedFactQuery {
  entityType?: FactEntityType;
  entityId?: string;
  academicYear?: string;
}

export async function listApprovedFacts(query: ApprovedFactQuery = {}): Promise<Fact[]> {
  const where: string[] = [
    "review_status = 'approved'",
    "(effective_to IS NULL OR effective_to >= NOW())",
    "(effective_from IS NULL OR effective_from <= NOW())",
  ];
  const params: unknown[] = [];
  if (query.entityType) {
    params.push(query.entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (query.entityId) {
    params.push(query.entityId);
    where.push(`entity_id = $${params.length}`);
  }
  if (query.academicYear) {
    params.push(query.academicYear);
    where.push(`academic_year = $${params.length}`);
  }
  const r = await getPool().query(
    `SELECT ${FACT_SELECT_COLUMNS}
       FROM facts
      WHERE ${where.join(" AND ")}
      ORDER BY entity_type, entity_id, field_key, academic_year NULLS LAST`,
    params,
  );
  return r.rows.map((row) => rowToFact(row as Record<string, unknown>));
}

export async function listFactRevisions(factId: string): Promise<FactRevision[]> {
  if (!factId || factId.length > 64) return [];
  const r = await getPool().query(
    `SELECT ${REVISION_SELECT_COLUMNS}
       FROM fact_revisions
      WHERE fact_id = $1
      ORDER BY revision_number DESC`,
    [factId],
  );
  return r.rows.map((row) => rowToRevision(row as Record<string, unknown>));
}

export { metadata as normalizeFactMetadata };
