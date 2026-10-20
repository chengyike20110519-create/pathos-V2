import type { FactEntityType, FactReviewStatus } from "@/domain/information/fact";

export const REVIEW_TASK_TYPES = [
  "new_fact",
  "value_change",
  "conflict",
  "source_failure",
  "stale_fact",
] as const;
export type ReviewTaskType = (typeof REVIEW_TASK_TYPES)[number];

export const REVIEW_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const REVIEW_TASK_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "recheck",
  "stale",
  "resolved",
] as const;
export type ReviewTaskStatus = (typeof REVIEW_TASK_STATUSES)[number];

export const REVIEW_ACTIONS = ["approve", "reject", "stale", "recheck"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export interface ReviewTaskDraft {
  factId: string;
  taskType: ReviewTaskType;
  severity?: ReviewSeverity;
  fromRevisionId?: string | null;
  toRevisionId?: string | null;
  reason?: string | null;
  assignedToUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReviewTaskFactSnapshot {
  id: string;
  entityType: FactEntityType;
  entityId: string;
  fieldKey: string;
  academicYear: string | null;
  currentRevision: number;
  sourceId: string;
  sourceUrl: string;
  reviewStatus: FactReviewStatus;
}

export interface ReviewTask extends ReviewTaskDraft {
  id: string;
  taskType: ReviewTaskType;
  severity: ReviewSeverity;
  fromRevisionId: string | null;
  toRevisionId: string | null;
  reason: string | null;
  assignedToUserId: string | null;
  metadata: Record<string, unknown>;
  status: ReviewTaskStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fact: ReviewTaskFactSnapshot;
}

export interface ReviewAudit {
  id: string;
  taskId: string;
  actorUserId: string | null;
  action: ReviewAction;
  taskStatusBefore: ReviewTaskStatus;
  taskStatusAfter: ReviewTaskStatus;
  factStatusBefore: FactReviewStatus;
  factStatusAfter: FactReviewStatus;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewActionResult {
  task: ReviewTask;
  audit: ReviewAudit;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isReviewTaskType(value: unknown): value is ReviewTaskType {
  return includes(REVIEW_TASK_TYPES, value);
}

export function isReviewSeverity(value: unknown): value is ReviewSeverity {
  return includes(REVIEW_SEVERITIES, value);
}

export function isReviewTaskStatus(value: unknown): value is ReviewTaskStatus {
  return includes(REVIEW_TASK_STATUSES, value);
}

export function isReviewAction(value: unknown): value is ReviewAction {
  return includes(REVIEW_ACTIONS, value);
}

export function reviewTaskStatusForAction(action: ReviewAction): ReviewTaskStatus {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return action;
}

export function factStatusForAction(action: ReviewAction): FactReviewStatus {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "stale") return "stale";
  return "pending";
}
