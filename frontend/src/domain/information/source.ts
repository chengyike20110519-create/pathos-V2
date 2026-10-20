export const SOURCE_AUTHORITIES = ["A", "B", "C", "D", "E", "F"] as const;
export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];

export const SOURCE_TYPES = [
  "official_html",
  "pdf",
  "csv",
  "json_api",
  "common_data_set",
  "ipeds",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_DOCUMENT_STATUSES = ["succeeded", "failed", "blocked"] as const;
export type SourceDocumentStatus = (typeof SOURCE_DOCUMENT_STATUSES)[number];

export const SOURCE_ACCESS_REVIEW_STATUSES = [
  "pending",
  "allowed",
  "disallowed",
  "not_applicable",
] as const;
export type SourceAccessReviewStatus = (typeof SOURCE_ACCESS_REVIEW_STATUSES)[number];

export const SOURCE_FETCH_OUTCOMES = [
  "changed",
  "unchanged",
  "failed",
  "blocked",
] as const;
export type SourceFetchOutcome = (typeof SOURCE_FETCH_OUTCOMES)[number];

export interface SourceDraft {
  name: string;
  url: string;
  authority: SourceAuthority;
  sourceType: SourceType;
  publisher?: string | null;
  licenseNote?: string | null;
  parserName?: string;
  rateLimitSeconds?: number;
  isActive?: boolean;
  robotsReviewStatus?: SourceAccessReviewStatus;
  termsReviewStatus?: SourceAccessReviewStatus;
  fetchEnabled?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
  userAgent?: string;
}

export interface Source extends Required<
  Pick<SourceDraft, "name" | "url" | "authority" | "sourceType" | "rateLimitSeconds" | "isActive">
> {
  id: string;
  publisher: string | null;
  licenseNote: string | null;
  parserName: string;
  robotsReviewStatus: SourceAccessReviewStatus;
  termsReviewStatus: SourceAccessReviewStatus;
  fetchEnabled: boolean;
  timeoutMs: number;
  maxResponseBytes: number;
  userAgent: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceDocumentDraft {
  sourceId: string;
  url: string;
  httpStatus?: number | null;
  contentHash?: string | null;
  fetchDurationMs?: number | null;
  responseBytes?: number | null;
  fetchStatus: SourceDocumentStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  parserMetadata?: Record<string, unknown>;
  fetchOutcome: SourceFetchOutcome;
  finalUrl?: string | null;
  redirectCount?: number;
  contentType?: string | null;
}

export interface SourceDocument extends SourceDocumentDraft {
  id: string;
  sourceId: string;
  fetchedAt: string;
  createdAt: string;
  parserMetadata: Record<string, unknown>;
  fetchOutcome: SourceFetchOutcome;
  finalUrl: string | null;
  redirectCount: number;
  contentType: string | null;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isSourceAuthority(value: unknown): value is SourceAuthority {
  return includes(SOURCE_AUTHORITIES, value);
}

export function isSourceType(value: unknown): value is SourceType {
  return includes(SOURCE_TYPES, value);
}

export function isSourceDocumentStatus(value: unknown): value is SourceDocumentStatus {
  return includes(SOURCE_DOCUMENT_STATUSES, value);
}

export function isSourceAccessReviewStatus(
  value: unknown,
): value is SourceAccessReviewStatus {
  return includes(SOURCE_ACCESS_REVIEW_STATUSES, value);
}

export function isSourceFetchOutcome(value: unknown): value is SourceFetchOutcome {
  return includes(SOURCE_FETCH_OUTCOMES, value);
}
