import { getPool } from "@/server/db";
import {
  FACT_ENTITY_TYPES,
  type FactConfidence,
  type FactEntityType,
} from "@/domain/information/fact";

export const INFORMATION_EVENT_TYPES = [
  "admission_policy",
  "deadline",
  "cost",
  "new_program",
  "program_discontinued",
  "scholarship",
  "ranking",
  "requirement",
  "official_announcement",
] as const;
export type InformationEventType = (typeof INFORMATION_EVENT_TYPES)[number];
export type InformationFeedEventType =
  | InformationEventType
  | "application_change"
  | "campus_update"
  | "other";

export const INFORMATION_EVENT_URGENCIES = [
  "expired",
  "critical",
  "high",
  "medium",
  "low",
  "none",
] as const;
export type InformationEventUrgency = (typeof INFORMATION_EVENT_URGENCIES)[number];

export interface InformationEventSource {
  id: string;
  name: string;
  url: string;
  authority: string;
}

export interface InformationEventFact {
  id: string;
  fieldKey: string;
  reviewStatus: "approved";
  confidence: FactConfidence;
  retrievedAt: string;
}

export interface InformationEvent {
  recordKind: "approved_event";
  id: string;
  eventType: InformationEventType;
  title: string;
  summary: string;
  whatChanged: string;
  whyItMatters: string;
  actionSteps: string[];
  entityType: FactEntityType;
  entityId: string;
  entityName: string | null;
  universityId: string | null;
  universityName: string | null;
  universityNameZh: string | null;
  fieldKey: string | null;
  previousValue: unknown;
  newValue: unknown;
  audience: string[];
  importance: "low" | "medium" | "high" | "critical";
  actionDeadline: string | null;
  publishedAt: string;
  createdAt: string;
  source: InformationEventSource;
  fact: InformationEventFact;
  urgency: InformationEventUrgency;
}

export interface PreviewNewsRecord {
  recordKind: "preview_news";
  id: string;
  eventType: InformationEventType | "application_change" | "campus_update" | "other";
  title: string;
  titleEn: string | null;
  summary: string | null;
  whatChanged: string | null;
  whyItMatters: string | null;
  actionSteps: string[];
  entityType: FactEntityType;
  entityId: string | null;
  entityName: string | null;
  universityId: string | null;
  universityName: string | null;
  universityNameZh: string | null;
  fieldKey: null;
  previousValue: unknown;
  newValue: unknown;
  audience: string[];
  importance: "low" | "medium" | "high";
  actionDeadline: string | null;
  publishedAt: string;
  source: InformationEventSource;
  sourceStatus: string;
  urgency: InformationEventUrgency;
  isApproved: false;
}

export type InformationFeedRecord = InformationEvent | PreviewNewsRecord;

export interface InformationFeedQuery {
  entityType?: FactEntityType;
  entityId?: string;
  eventType?: InformationFeedEventType;
  urgency?: InformationEventUrgency;
  limit?: number;
}

export interface InformationFeed {
  events: InformationEvent[];
  previewNews: PreviewNewsRecord[];
  previewFallback: boolean;
  coverage: {
    approvedEvents: number;
    previewNews: number;
  };
}

export class InformationSchemaNotReadyError extends Error {
  readonly code = "INFORMATION_SCHEMA_NOT_READY";
  readonly status = 503;

  constructor(message = "信息平台迁移尚未执行，机会动态事实层暂不可用。") {
    super(message);
    this.name = "InformationSchemaNotReadyError";
  }
}

const EVENT_SELECT = `
  e.id, e.event_type, e.title, e.summary, e.what_changed, e.why_it_matters,
  e.action_steps, e.entity_type, e.entity_id, e.field_key, e.previous_value,
  e.new_value, e.audience, e.importance, e.action_deadline, e.published_at,
  e.created_at, s.id AS source_id, s.name AS source_name, e.source_url,
  s.authority AS source_authority, f.id AS fact_id, f.field_key AS fact_field_key,
  f.review_status, f.confidence, f.retrieved_at, u.id AS university_id,
  u.name AS university_name, u.chinese_name AS university_name_zh
`;

function isPgMissingTable(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01",
  );
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function requiredIso(value: unknown, field: string): string {
  const iso = toIso(value);
  if (iso == null) throw new Error(`invalid ${field} value in information event`);
  return iso;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function entityType(value: unknown): FactEntityType {
  if (FACT_ENTITY_TYPES.includes(value as FactEntityType)) {
    return value as FactEntityType;
  }
  return "opportunity";
}

export function deriveEventUrgency(
  actionDeadline: string | null,
  now: Date = new Date(),
): InformationEventUrgency {
  if (actionDeadline == null) return "none";
  const deadline = new Date(actionDeadline).getTime();
  const current = now.getTime();
  if (Number.isNaN(deadline)) return "none";
  const days = (deadline - current) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "high";
  if (days <= 90) return "medium";
  return "low";
}

function mapEventRow(row: Record<string, unknown>, now: Date): InformationEvent {
  const actionDeadline = toIso(row.action_deadline);
  return {
    recordKind: "approved_event",
    id: String(row.id),
    eventType: row.event_type as InformationEventType,
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    whatChanged: String(row.what_changed ?? ""),
    whyItMatters: String(row.why_it_matters ?? ""),
    actionSteps: stringArray(row.action_steps),
    entityType: entityType(row.entity_type),
    entityId: String(row.entity_id ?? ""),
    entityName: row.university_name != null ? String(row.university_name) : String(row.entity_id ?? ""),
    universityId: row.university_id == null ? null : String(row.university_id),
    universityName: row.university_name == null ? null : String(row.university_name),
    universityNameZh: row.university_name_zh == null ? null : String(row.university_name_zh),
    fieldKey: row.field_key == null ? null : String(row.field_key),
    previousValue: row.previous_value ?? null,
    newValue: row.new_value ?? null,
    audience: stringArray(row.audience),
    importance: row.importance as InformationEvent["importance"],
    actionDeadline,
    publishedAt: requiredIso(row.published_at, "publishedAt"),
    createdAt: requiredIso(row.created_at, "createdAt"),
    source: {
      id: String(row.source_id),
      name: String(row.source_name ?? "未知来源"),
      url: String(row.source_url ?? ""),
      authority: String(row.source_authority ?? ""),
    },
    fact: {
      id: String(row.fact_id),
      fieldKey: String(row.fact_field_key ?? ""),
      reviewStatus: "approved",
      confidence: row.confidence as FactConfidence,
      retrievedAt: requiredIso(row.retrieved_at, "retrievedAt"),
    },
    urgency: deriveEventUrgency(actionDeadline, now),
  };
}

function mapPreviewNewsRow(row: Record<string, unknown>, now: Date): PreviewNewsRecord {
  const actionDeadline = toIso(row.action_deadline);
  const universityId = row.university_id == null ? null : String(row.university_id);
  return {
    recordKind: "preview_news",
    id: String(row.id),
    eventType: row.event_type as PreviewNewsRecord["eventType"],
    title: String(row.title ?? ""),
    titleEn: row.title_en == null ? null : String(row.title_en),
    summary: row.summary == null ? null : String(row.summary),
    whatChanged: row.what_changed == null ? null : String(row.what_changed),
    whyItMatters: row.why_it_matters == null ? null : String(row.why_it_matters),
    actionSteps: stringArray(row.action_steps),
    entityType: "university",
    entityId: universityId,
    entityName: row.university_name == null ? universityId : String(row.university_name),
    universityId,
    universityName: row.university_name == null ? null : String(row.university_name),
    universityNameZh: row.university_name_zh == null ? null : String(row.university_name_zh),
    fieldKey: null,
    previousValue: null,
    newValue: null,
    audience: stringArray(row.audience),
    importance: row.importance as PreviewNewsRecord["importance"],
    actionDeadline,
    publishedAt: requiredIso(row.published_at, "preview publishedAt"),
    source: {
      id: `legacy_news:${String(row.source ?? "")}`,
      name: String(row.source ?? "Preview 来源"),
      url: String(row.url ?? ""),
      authority: "",
    },
    sourceStatus: String(row.source_status ?? "source_review_not_completed"),
    urgency: deriveEventUrgency(actionDeadline, now),
    isApproved: false,
  };
}

function recordMatches(
  record: InformationFeedRecord,
  query: InformationFeedQuery,
): boolean {
  if (query.entityType && record.entityType !== query.entityType) return false;
  if (query.entityId && record.entityId !== query.entityId) return false;
  if (query.eventType && record.eventType !== query.eventType) return false;
  if (query.urgency && record.urgency !== query.urgency) return false;
  return true;
}

export function filterInformationFeedRecords(
  records: InformationFeedRecord[],
  query: InformationFeedQuery,
): InformationFeedRecord[] {
  return records.filter((record) => recordMatches(record, query));
}

async function readPreviewNews(
  query: InformationFeedQuery,
  limit: number,
  now: Date,
): Promise<PreviewNewsRecord[]> {
  try {
    const result = await getPool().query(
      `SELECT a.id, a.university_id, u.name AS university_name,
              u.chinese_name AS university_name_zh, a.title, a.title_en,
              a.summary, a.what_changed, a.why_it_matters, a.action_steps,
              a.event_type, a.audience, a.source, a.url, a.published_at,
              a.action_deadline, a.importance, a.source_status
         FROM news_articles a
         LEFT JOIN universities u ON u.id = a.university_id
        ORDER BY a.published_at DESC
        LIMIT ${limit}`,
    );
    return result.rows
      .map((row) => mapPreviewNewsRow(row as Record<string, unknown>, now))
      .filter((record) => recordMatches(record, query));
  } catch (error) {
    // news_articles is a legacy compatibility read model. The information
    // schema itself has already been verified by the primary query above.
    if (isPgMissingTable(error)) return [];
    throw error;
  }
}

async function hasPublishedApprovedEvents(): Promise<boolean> {
  try {
    const result = await getPool().query(
      `SELECT 1
         FROM information_events e
         JOIN facts f ON f.id = e.fact_id
        WHERE e.is_published = TRUE
          AND e.published_at IS NOT NULL
          AND f.review_status = 'approved'
          AND (f.effective_to IS NULL OR f.effective_to >= NOW())
          AND (f.effective_from IS NULL OR f.effective_from <= NOW())
        LIMIT 1`,
    );
    return result.rows.length > 0;
  } catch (error) {
    if (isPgMissingTable(error)) throw new InformationSchemaNotReadyError();
    throw error;
  }
}

export async function getInformationFeed(
  query: InformationFeedQuery = {},
  now: Date = new Date(),
): Promise<InformationFeed> {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const conditions = [
    "e.is_published = TRUE",
    "e.published_at IS NOT NULL",
    "f.review_status = 'approved'",
    "(f.effective_to IS NULL OR f.effective_to >= NOW())",
    "(f.effective_from IS NULL OR f.effective_from <= NOW())",
  ];
  const params: unknown[] = [];
  if (query.entityType) {
    params.push(query.entityType);
    conditions.push(`e.entity_type = $${params.length}`);
  }
  if (query.entityId) {
    params.push(query.entityId);
    conditions.push(`e.entity_id = $${params.length}`);
  }
  if (query.eventType) {
    params.push(query.eventType);
    conditions.push(`e.event_type = $${params.length}`);
  }

  let result;
  try {
    result = await getPool().query(
      `SELECT ${EVENT_SELECT}
         FROM information_events e
         JOIN facts f ON f.id = e.fact_id
         JOIN sources s ON s.id = e.source_id
         LEFT JOIN universities u
           ON e.entity_type = 'university' AND u.id = e.entity_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY e.published_at DESC, e.created_at DESC
        LIMIT ${limit}`,
      params,
    );
  } catch (error) {
    if (isPgMissingTable(error)) throw new InformationSchemaNotReadyError();
    throw error;
  }

  const events = result.rows
    .map((row) => mapEventRow(row as Record<string, unknown>, now))
    .filter((event) => recordMatches(event, query));
  const shouldUsePreviewFallback = events.length === 0 &&
    !(await hasPublishedApprovedEvents());
  const previewNews = shouldUsePreviewFallback
    ? await readPreviewNews(query, limit, now)
    : [];

  return {
    events,
    previewNews,
    previewFallback: shouldUsePreviewFallback,
    coverage: {
      approvedEvents: events.length,
      previewNews: previewNews.length,
    },
  };
}
