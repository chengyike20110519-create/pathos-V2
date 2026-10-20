import { randomBytes } from "node:crypto";
import { getPool } from "@/server/db";
import {
  isSourceAuthority,
  isSourceDocumentStatus,
  isSourceAccessReviewStatus,
  isSourceFetchOutcome,
  isSourceType,
  type Source,
  type SourceDocument,
  type SourceDocumentDraft,
  type SourceDraft,
} from "@/domain/information/source";

const MAX_URL_LENGTH = 2048;

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("hex")}`;
}

function requireHttpUrl(value: string, label: string): string {
  if (value.length > MAX_URL_LENGTH) throw new Error(`${label} is too long`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
  return parsed.toString();
}

function toDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowToSource(row: Record<string, unknown>): Source {
  return {
    id: String(row.id),
    name: String(row.name),
    url: String(row.url),
    authority: row.authority as Source["authority"],
    sourceType: row.source_type as Source["sourceType"],
    publisher: row.publisher == null ? null : String(row.publisher),
    licenseNote: row.license_note == null ? null : String(row.license_note),
    parserName: String(row.parser_name ?? "generic"),
    rateLimitSeconds: Number(row.rate_limit_seconds ?? 3600),
    isActive: row.is_active === true,
    robotsReviewStatus: (row.robots_review_status ?? "pending") as Source["robotsReviewStatus"],
    termsReviewStatus: (row.terms_review_status ?? "pending") as Source["termsReviewStatus"],
    fetchEnabled: row.fetch_enabled === true,
    timeoutMs: Number(row.timeout_ms ?? 10000),
    maxResponseBytes: Number(row.max_response_bytes ?? 10485760),
    userAgent: String(row.user_agent ?? "PathOS-Information-Platform/1.0"),
    createdAt: toDate(row.created_at as Date | string),
    updatedAt: toDate(row.updated_at as Date | string),
  };
}

function rowToSourceDocument(row: Record<string, unknown>): SourceDocument {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    url: String(row.url),
    fetchedAt: toDate(row.fetched_at as Date | string),
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    fetchDurationMs: row.fetch_duration_ms == null ? null : Number(row.fetch_duration_ms),
    responseBytes: row.response_bytes == null ? null : Number(row.response_bytes),
    fetchStatus: row.fetch_status as SourceDocument["fetchStatus"],
    errorCode: row.error_code == null ? null : String(row.error_code),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    parserMetadata: normalizeMetadata(row.parser_metadata),
    fetchOutcome: (row.fetch_outcome ?? "changed") as SourceDocument["fetchOutcome"],
    finalUrl: row.final_url == null ? null : String(row.final_url),
    redirectCount: Number(row.redirect_count ?? 0),
    contentType: row.content_type == null ? null : String(row.content_type),
    createdAt: toDate(row.created_at as Date | string),
  };
}

export function assertSourceDraft(draft: SourceDraft): void {
  if (!draft.name.trim()) throw new Error("source name is required");
  requireHttpUrl(draft.url, "source url");
  if (!isSourceAuthority(draft.authority)) throw new Error("invalid source authority");
  if (!isSourceType(draft.sourceType)) throw new Error("invalid source type");
  if (draft.rateLimitSeconds != null && (!Number.isFinite(draft.rateLimitSeconds) || draft.rateLimitSeconds < 0)) {
    throw new Error("rateLimitSeconds must be a non-negative number");
  }
  if (draft.robotsReviewStatus != null && !isSourceAccessReviewStatus(draft.robotsReviewStatus)) {
    throw new Error("invalid robots review status");
  }
  if (draft.termsReviewStatus != null && !isSourceAccessReviewStatus(draft.termsReviewStatus)) {
    throw new Error("invalid terms review status");
  }
  if (draft.timeoutMs != null && (draft.timeoutMs < 250 || draft.timeoutMs > 60000)) {
    throw new Error("timeoutMs must be between 250 and 60000");
  }
  if (draft.maxResponseBytes != null && (draft.maxResponseBytes < 1024 || draft.maxResponseBytes > 52428800)) {
    throw new Error("maxResponseBytes must be between 1024 and 52428800");
  }
  if (draft.userAgent != null && (draft.userAgent.trim().length === 0 || draft.userAgent.length > 300)) {
    throw new Error("userAgent must be between 1 and 300 characters");
  }
}

export async function registerSource(draft: SourceDraft): Promise<Source> {
  assertSourceDraft(draft);
  const r = await getPool().query(
    `INSERT INTO sources (
       id, name, url, authority, source_type, publisher, license_note,
       parser_name, rate_limit_seconds, is_active, robots_review_status,
       terms_review_status, fetch_enabled, timeout_ms, max_response_bytes,
       user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (url) DO UPDATE SET
       name = EXCLUDED.name,
       authority = EXCLUDED.authority,
       source_type = EXCLUDED.source_type,
       publisher = EXCLUDED.publisher,
       license_note = EXCLUDED.license_note,
       parser_name = EXCLUDED.parser_name,
       rate_limit_seconds = EXCLUDED.rate_limit_seconds,
       is_active = EXCLUDED.is_active,
       robots_review_status = EXCLUDED.robots_review_status,
       terms_review_status = EXCLUDED.terms_review_status,
       fetch_enabled = EXCLUDED.fetch_enabled,
       timeout_ms = EXCLUDED.timeout_ms,
       max_response_bytes = EXCLUDED.max_response_bytes,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW()
     RETURNING *`,
    [
      newId("src"),
      draft.name.trim(),
      requireHttpUrl(draft.url, "source url"),
      draft.authority,
      draft.sourceType,
      draft.publisher ?? null,
      draft.licenseNote ?? null,
      draft.parserName ?? "generic",
      draft.rateLimitSeconds ?? 3600,
      draft.isActive ?? true,
      draft.robotsReviewStatus ?? "pending",
      draft.termsReviewStatus ?? "pending",
      draft.fetchEnabled ?? false,
      draft.timeoutMs ?? 10000,
      draft.maxResponseBytes ?? 10485760,
      draft.userAgent ?? "PathOS-Information-Platform/1.0",
    ],
  );
  const row = r.rows[0];
  if (!row) throw new Error("source registration returned no row");
  return rowToSource(row as Record<string, unknown>);
}

export async function getSource(id: string): Promise<Source | null> {
  if (!id || id.length > 64) return null;
  const r = await getPool().query(
    "SELECT * FROM sources WHERE id = $1",
    [id],
  );
  const row = r.rows[0];
  return row ? rowToSource(row as Record<string, unknown>) : null;
}

export async function getSourceByUrl(url: string): Promise<Source | null> {
  if (!url) return null;
  const r = await getPool().query(
    "SELECT * FROM sources WHERE url = $1",
    [requireHttpUrl(url, "source url")],
  );
  const row = r.rows[0];
  return row ? rowToSource(row as Record<string, unknown>) : null;
}

export async function listActiveSources(): Promise<Source[]> {
  const r = await getPool().query(
    "SELECT * FROM sources WHERE is_active = TRUE ORDER BY url",
  );
  return r.rows.map((row) => rowToSource(row as Record<string, unknown>));
}

export function assertSourceDocumentDraft(draft: SourceDocumentDraft): void {
  if (!draft.sourceId) throw new Error("sourceId is required");
  requireHttpUrl(draft.url, "document url");
  if (!isSourceDocumentStatus(draft.fetchStatus)) throw new Error("invalid source document status");
  if (!isSourceFetchOutcome(draft.fetchOutcome)) throw new Error("invalid fetch outcome");
  if (draft.fetchStatus === "succeeded" && draft.fetchOutcome !== "changed" && draft.fetchOutcome !== "unchanged") {
    throw new Error("successful fetch outcome must be changed or unchanged");
  }
  if (draft.fetchStatus === "failed" && draft.fetchOutcome !== "failed") {
    throw new Error("failed fetch must use failed outcome");
  }
  if (draft.fetchStatus === "blocked" && draft.fetchOutcome !== "blocked") {
    throw new Error("blocked fetch must use blocked outcome");
  }
  if (draft.fetchStatus === "succeeded" && !draft.contentHash) {
    throw new Error("successful source documents require contentHash");
  }
  if (draft.httpStatus != null && (!Number.isInteger(draft.httpStatus) || draft.httpStatus < 100 || draft.httpStatus > 599)) {
    throw new Error("httpStatus must be an integer from 100 to 599");
  }
  if (draft.fetchDurationMs != null && draft.fetchDurationMs < 0) {
    throw new Error("fetchDurationMs cannot be negative");
  }
  if (draft.responseBytes != null && draft.responseBytes < 0) {
    throw new Error("responseBytes cannot be negative");
  }
  if ((draft.redirectCount ?? 0) < 0) throw new Error("redirectCount cannot be negative");
}

export async function recordSourceDocument(draft: SourceDocumentDraft): Promise<SourceDocument> {
  assertSourceDocumentDraft(draft);
  const metadata = JSON.stringify(draft.parserMetadata ?? {});
  const r = await getPool().query(
    `INSERT INTO source_documents (
       id, source_id, url, http_status, content_hash, fetch_duration_ms,
       response_bytes, fetch_status, error_code, error_message, parser_metadata,
       fetch_outcome, final_url, redirect_count, content_type
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15)
     RETURNING *`,
    [
      newId("doc"),
      draft.sourceId,
      requireHttpUrl(draft.url, "document url"),
      draft.httpStatus ?? null,
      draft.contentHash ?? null,
      draft.fetchDurationMs ?? null,
      draft.responseBytes ?? null,
      draft.fetchStatus,
      draft.errorCode ?? null,
      draft.errorMessage ? draft.errorMessage.slice(0, 2000) : null,
      metadata,
      draft.fetchOutcome,
      draft.finalUrl ?? null,
      draft.redirectCount ?? 0,
      draft.contentType ?? null,
    ],
  );
  const row = r.rows[0];
  if (!row) throw new Error("source document insert returned no row");
  return rowToSourceDocument(row as Record<string, unknown>);
}

export async function getLatestSourceDocument(
  sourceId: string,
): Promise<SourceDocument | null> {
  if (!sourceId || sourceId.length > 64) return null;
  const r = await getPool().query(
    `SELECT *
       FROM source_documents
      WHERE source_id = $1
      ORDER BY fetched_at DESC, created_at DESC, id DESC
      LIMIT 1`,
    [sourceId],
  );
  const row = r.rows[0];
  return row ? rowToSourceDocument(row as Record<string, unknown>) : null;
}
