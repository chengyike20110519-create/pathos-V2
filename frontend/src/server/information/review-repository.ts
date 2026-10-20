import { randomBytes } from "node:crypto";
import { getPool } from "@/server/db";
import {
  factStatusForAction,
  isReviewAction,
  isReviewSeverity,
  isReviewTaskStatus,
  isReviewTaskType,
  reviewTaskStatusForAction,
  type ReviewAction,
  type ReviewActionResult,
  type ReviewAudit,
  type ReviewSeverity,
  type ReviewTask,
  type ReviewTaskDraft,
  type ReviewTaskFactSnapshot,
  type ReviewTaskStatus,
  type ReviewTaskType,
} from "@/domain/information/review";
import type { FactEntityType, FactReviewStatus } from "@/domain/information/fact";

const TASK_SELECT = `SELECT
    t.id AS task_id, t.fact_id AS task_fact_id, t.task_type,
    t.severity, t.status, t.from_revision_id, t.to_revision_id,
    t.reason, t.assigned_to_user_id, t.resolved_at, t.metadata AS task_metadata,
    t.created_at AS task_created_at, t.updated_at AS task_updated_at,
    f.id AS fact_id, f.entity_type, f.entity_id, f.field_key,
    f.academic_year, f.current_revision, f.source_id, f.source_url,
    f.review_status
  FROM review_tasks t
  JOIN facts f ON f.id = t.fact_id`;

const ACTION_SELECT = `WITH locked_task AS (
    SELECT t.*, f.review_status AS fact_status_before
      FROM review_tasks t
      JOIN facts f ON f.id = t.fact_id
     WHERE t.id = $1
       AND t.status IN ('pending', 'recheck')
     ORDER BY t.id
     FOR UPDATE OF t
     LIMIT 1
  ), updated_task AS (
    UPDATE review_tasks
       SET status = $2,
           reason = $5,
           resolved_at = CASE WHEN $2 <> 'recheck' THEN NOW() ELSE NULL END,
           updated_at = NOW()
     WHERE id = $1
       AND status IN ('pending', 'recheck')
    RETURNING *
  ), updated_fact AS (
    UPDATE facts f
       SET review_status = $3,
           reviewed_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE NULL END,
           updated_at = NOW()
      FROM locked_task lt
     WHERE f.id = lt.fact_id
    RETURNING f.*
  ), updated_revision AS (
    UPDATE fact_revisions r
       SET review_status = $3,
           reviewed_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE NULL END
      FROM locked_task lt
      JOIN updated_fact uf ON uf.id = lt.fact_id
     WHERE r.fact_id = uf.id
       AND r.revision_number = uf.current_revision
    RETURNING r.id AS revision_id, r.revision_number
  ), inserted_audit AS (
    INSERT INTO review_actions (
      id, review_task_id, actor_user_id, action, reason,
      task_status_before, task_status_after, fact_status_before,
      fact_status_after, metadata
    )
    SELECT $6, ut.id, $4, $7, $5,
           lt.status, $2, lt.fact_status_before, $3,
           jsonb_build_object(
             'action', $7::text,
             'factStatus', $3::text,
             'currentRevisionNumber', ur.revision_number
           )
      FROM updated_task ut
      JOIN locked_task lt ON lt.id = ut.id
      LEFT JOIN updated_revision ur ON ur.revision_number IS NOT NULL
    RETURNING *
  )
  SELECT
    ut.id AS task_id, ut.fact_id AS task_fact_id, ut.task_type,
    ut.severity, ut.status, ut.from_revision_id, ut.to_revision_id,
    ut.reason, ut.assigned_to_user_id, ut.resolved_at,
    ut.metadata AS task_metadata, ut.created_at AS task_created_at,
    ut.updated_at AS task_updated_at,
    f.id AS fact_id, f.entity_type, f.entity_id, f.field_key,
    f.academic_year, f.current_revision, f.source_id, f.source_url,
    f.review_status,
    ia.id AS audit_id, ia.actor_user_id, ia.action,
    ia.task_status_before, ia.task_status_after,
    ia.fact_status_before, ia.fact_status_after,
    ia.reason AS audit_reason,
    ia.metadata AS audit_metadata, ia.created_at AS audit_created_at
  FROM updated_task ut
  JOIN facts f ON f.id = ut.fact_id
  CROSS JOIN inserted_audit ia`;

export class ReviewTaskStateError extends Error {
  readonly code = "INVALID_REVIEW_STATE";
  readonly status = 409;
  constructor(readonly currentStatus: ReviewTaskStatus) {
    super(`Review task is ${currentStatus}, not pending or recheck.`);
    this.name = "ReviewTaskStateError";
  }
}

export interface ReviewTaskQuery {
  status?: ReviewTaskStatus;
  taskType?: ReviewTaskType;
  factId?: string;
  limit?: number;
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("hex")}`;
}

function toIso(value: unknown): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value as string);
  return date.toISOString();
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertId(value: string, label: string): void {
  if (!value.trim() || value.trim().length > 64) {
    throw new Error(`${label} is required and must be at most 64 characters`);
  }
}

export function assertReviewTaskDraft(draft: ReviewTaskDraft): void {
  assertId(draft.factId, "factId");
  if (!isReviewTaskType(draft.taskType)) throw new Error("invalid review task type");
  if (draft.severity != null && !isReviewSeverity(draft.severity)) {
    throw new Error("invalid review severity");
  }
  for (const [key, value] of [
    ["fromRevisionId", draft.fromRevisionId],
    ["toRevisionId", draft.toRevisionId],
    ["assignedToUserId", draft.assignedToUserId],
  ] as const) {
    if (value != null && value.trim().length > 64) {
      throw new Error(`${key} must be at most 64 characters`);
    }
  }
  if (draft.reason != null && draft.reason.trim().length > 2000) {
    throw new Error("review reason must be at most 2000 characters");
  }
  if (
    draft.metadata !== undefined &&
    (typeof draft.metadata !== "object" || draft.metadata === null || Array.isArray(draft.metadata))
  ) {
    throw new Error("review metadata must be an object");
  }
}

function rowToTask(row: Record<string, unknown>): ReviewTask {
  const fact: ReviewTaskFactSnapshot = {
    id: String(row.fact_id),
    entityType: row.entity_type as FactEntityType,
    entityId: String(row.entity_id),
    fieldKey: String(row.field_key),
    academicYear: row.academic_year == null ? null : String(row.academic_year),
    currentRevision: Number(row.current_revision),
    sourceId: String(row.source_id),
    sourceUrl: String(row.source_url),
    reviewStatus: row.review_status as FactReviewStatus,
  };
  return {
    id: String(row.task_id),
    factId: String(row.task_fact_id),
    taskType: row.task_type as ReviewTaskType,
    severity: row.severity as ReviewSeverity,
    status: row.status as ReviewTaskStatus,
    fromRevisionId: row.from_revision_id == null ? null : String(row.from_revision_id),
    toRevisionId: row.to_revision_id == null ? null : String(row.to_revision_id),
    reason: row.reason == null ? null : String(row.reason),
    assignedToUserId: row.assigned_to_user_id == null ? null : String(row.assigned_to_user_id),
    metadata: metadata(row.task_metadata),
    resolvedAt: row.resolved_at == null ? null : toIso(row.resolved_at),
    createdAt: toIso(row.task_created_at),
    updatedAt: toIso(row.task_updated_at),
    fact,
  };
}

function rowToActionResult(row: Record<string, unknown>): ReviewActionResult {
  const task = rowToTask(row);
  const audit: ReviewAudit = {
    id: String(row.audit_id),
    taskId: task.id,
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    action: row.action as ReviewAction,
    taskStatusBefore: row.task_status_before as ReviewTaskStatus,
    taskStatusAfter: row.task_status_after as ReviewTaskStatus,
    factStatusBefore: row.fact_status_before as FactReviewStatus,
    factStatusAfter: row.fact_status_after as FactReviewStatus,
    reason: String(row.audit_reason ?? ""),
    metadata: metadata(row.audit_metadata),
    createdAt: toIso(row.audit_created_at),
  };
  return { task, audit };
}

export async function createReviewTask(draft: ReviewTaskDraft): Promise<ReviewTask> {
  assertReviewTaskDraft(draft);
  const params = [
    newId("rev_task"),
    draft.factId.trim(),
    draft.taskType,
    draft.severity ?? "medium",
    draft.fromRevisionId?.trim() || null,
    draft.toRevisionId?.trim() || null,
    draft.reason?.trim() || null,
    draft.assignedToUserId?.trim() || null,
    JSON.stringify(draft.metadata ?? {}),
  ];
  const r = await getPool().query(
    `INSERT INTO review_tasks (
       id, fact_id, task_type, severity, from_revision_id, to_revision_id,
       reason, assigned_to_user_id, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING id`,
    params,
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("review task insert returned no row");
  const task = await getReviewTask(String(row.id));
  if (!task) throw new Error("review task insert returned no task");
  return task;
}

export async function getReviewTask(id: string): Promise<ReviewTask | null> {
  if (!id || id.length > 64) return null;
  const r = await getPool().query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  const row = r.rows[0] as Record<string, unknown> | undefined;
  return row ? rowToTask(row) : null;
}

export async function listReviewTasks(query: ReviewTaskQuery = {}): Promise<ReviewTask[]> {
  if (query.status != null && !isReviewTaskStatus(query.status)) {
    throw new Error("invalid review task status");
  }
  if (query.taskType != null && !isReviewTaskType(query.taskType)) {
    throw new Error("invalid review task type");
  }
  if (query.factId != null && (!query.factId || query.factId.length > 64)) {
    throw new Error("factId is required and must be at most 64 characters");
  }

  const where: string[] = [];
  const params: unknown[] = [];
  {
    params.push(query.status ?? "pending");
    where.push(`t.status = $${params.length}`);
  }
  if (query.taskType) {
    params.push(query.taskType);
    where.push(`t.task_type = $${params.length}`);
  }
  if (query.factId) {
    params.push(query.factId);
    where.push(`t.fact_id = $${params.length}`);
  }
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 200);
  params.push(limit);
  const r = await getPool().query(
    `${TASK_SELECT}
      WHERE ${where.join(" AND ")}
      ORDER BY CASE t.severity
          WHEN 'critical' THEN 0 WHEN 'high' THEN 1
          WHEN 'medium' THEN 2 ELSE 3 END,
        t.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return r.rows.map((row) => rowToTask(row as Record<string, unknown>));
}

export async function applyReviewAction(
  taskId: string,
  action: ReviewAction,
  actorUserId: string,
  reason: string,
): Promise<ReviewActionResult | null> {
  assertId(taskId, "taskId");
  assertId(actorUserId, "actorUserId");
  if (!isReviewAction(action)) throw new Error("invalid review action");
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 2000) {
    throw new Error("review reason is required and must be at most 2000 characters");
  }

  const taskStatus = reviewTaskStatusForAction(action);
  const factStatus = factStatusForAction(action);
  const r = await getPool().query(
    ACTION_SELECT,
    [taskId, taskStatus, factStatus, actorUserId, normalizedReason, newId("rev_audit"), action],
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (row) return rowToActionResult(row);

  const existing = await getReviewTask(taskId);
  if (!existing) return null;
  throw new ReviewTaskStateError(existing.status);
}
