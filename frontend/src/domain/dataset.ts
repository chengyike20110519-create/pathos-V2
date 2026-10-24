import type { GuidePreview } from "@/lib/guide-preview";
import type { TimeSeriesPoint } from "@/types/timeseries";

// PathOS — domain types for the data layer.
// These describe records the backend data source is expected to provide.
// The legacy `frontend/src/lib/types.ts` types (legacy UI shapes) are kept
// for backward compatibility in components that still depend on them; new
// code should import from this file instead.

export type DisplayTier = "live_verified" | "cached" | "preview" | "quarantined";

export type ProvenanceStatus =
  | "live_verified_exact"
  | "live_verified_normalized"
  | "live_unavailable"
  | "source_review_not_completed"
  | "page_changed"
  | "archived_source";

export interface DatasetManifest {
  contractVersion?: string;
  datasetVersion?: string;
  view?: "preview";
  sourceCheckpoint?: string;
  sourceLimited?: boolean;
  incomplete?: boolean;
  notFinal?: boolean;
  enabledFeatures?: string[];
  disabledFeatures?: string[];
  schemaVersion: string;
  generatedAt: string;
  sourceCommit: string;
  previewOnly: boolean;
  counts: {
    universities: number;
    regionMetrics: number;
    news: number;
  };
  statusDictionary?: Record<string, ProvenanceStatusLabel>;
}

export interface ProvenanceStatusLabel {
  consumerLabel: string;
  technicalLabel?: string;
  icon?: string;
  tone?: "neutral" | "info" | "warn" | "danger" | "success";
  description?: string;
}

export interface SourceReference {
  url: string;
  retrievedAt?: string;
  cachedSnapshotAt?: string;
  cacheTtlSeconds?: number;
  anchor?: string;
  status: ProvenanceStatus;
}

/**
 * `UniversitySummary` is the small, list-safe shape that the map, the
 * calculator, the compare panel, and search all consume. Region-only
 * attributes (safety / Chinese-community / employment / cost-of-living)
 * are NOT here — those come from `RegionMetricRecord`. Cost here is the
 * school's own published tuition band; everything else is region-scoped.
 *
 * The `rankingSummary` / `costSummary` / `qualitySummary` blocks are the
 * recommended contract shape; the legacy top-level fields (`city`,
 * `state`, `rankingTier`, `rankingBand`, etc.) remain on the type only
 * as a transition aid for code paths that haven't migrated yet. New
 * components MUST consume the nested blocks, not the legacy ones.
 *
 * `nullableFields` is a manifest of which fields are missing for this
 * row so the UI can decide whether to render an empty-state ("数据补充中")
 * or skip the row entirely (e.g. exclude from Calculator totals).
 */
export interface UniversitySummary {
  id: string;
  name: string;
  /** Recommended-shape Chinese name (preferred). */
  nameZh: string;
  /** Legacy alias of `nameZh`. Kept so existing consumers compile. */
  chineseName: string;
  aliases?: string[];

  // ── Recommended-shape blocks (preferred) ────────────────────────
  latitude: number | null;
  longitude: number | null;
  rankingSummary?: {
    nationalRank?: number | null;
    rankingTier?: "top20" | "top50" | "top100" | "other";
    rankingLabel?: string;
  };
  costSummary?: {
    minimumUsd?: number | null;
    maximumUsd?: number | null;
    displayLabel?: string;
    comparisonSafe?: boolean;
  };
  /** Compact enrollment snapshot for list view (map, calculator, search). */
  enrollmentSummary?: {
    undergraduate?: number | null;
    graduate?: number | null;
    total?: number | null;
    referenceYear?: number | null;
  };
  studentFacultyRatio?: number;
  qualitySummary?: {
    coveragePercent?: number;
    warningCodes?: string[];
  };
  /** List view program tags (e.g. "Computer Science", "Mechanical Engineering")
   *  extracted from the upstream preview bundle. Surfaced by the topic
   *  dashboards so parents/teachers can spot CS / Engineering / Liberal Arts
   *  strong schools without drilling into the per-school detail page. The
   *  detail page exposes the full programs[] array; this summary field is
   *  intentionally names-only. */
  topPrograms?: readonly string[];
  /** Flat admissions / outcomes snapshot. Populated by db:enrich from
   *  university_details. acceptanceRate is stored as a percent (0-100),
   *  not a ratio. sat25/sat75 are the sum of math and reading middle-50. */
  acceptanceRate?: number | null;
  sat25?: number | null;
  sat75?: number | null;
  graduationRate?: number | null;
  retentionRate?: number | null;
  /** Institution ownership type from the verified preview record. */
  schoolType?: string;

  // ── Legacy fields (transition aid only) ──────────────────────────
  /** @deprecated Use `rankingSummary.rankingTier`. */
  rankingTier?: "top20" | "top50" | "top100" | "other";
  /** @deprecated Use `rankingSummary.rankingLabel`. */
  rankingBand?: string;
  /** @deprecated Use `rankingSummary.nationalRank`. */
  nationalRanking?: number | null;
  /** @deprecated Use `rankingSummary.nationalRank`'s year context. */
  rankingYear?: number;
  /** @deprecated Region-scoped data; fetch via RegionMetricRecord. */
  city?: string;
  /** @deprecated Region-scoped data; fetch via RegionMetricRecord. */
  state?: string;
  /** @deprecated Region-scoped data; fetch via RegionMetricRecord. */
  stateFips?: string;
  /** @deprecated Region-scoped data; fetch via RegionMetricRecord. */
  country?: string;

  displayTier: DisplayTier;
  previewOnly: boolean;
  datasetVersion: string;
  sourceCommit?: string;
  nullableFields: string[];
  /** Compact preview extracted from the IECG docx-driven CollegeGuide
   *  for the same university, if the upstream bundle has a linked
   *  profile. Surfaced by map markers, hover tooltips, calculator,
   *  assessment and guide cards so parents/counselors see facts
   *  instead of '数据补充中'. Optional — only present when the
   *  upstream bundle contains a matching CollegeGuide. */
  guidePreview?: GuidePreview;
  officialResearch?: OfficialResearchSnapshot;
}

export interface UniversityDetail extends UniversitySummary {
  programs: Program[];
  topProgramIds: string[];
  ranking: RankingMembership[];
  cost: CostRecord[];
  studentFacultyRatio?: number;
  history?: string;
  anecdotes?: Anecdote[];
  notableAttendance?: NotableAttendance[];
  people: Person[];
  nearbyTowns: NearbyTown[];
  sources: SourceReference[];
  warnings: string[];
  qualityBadges: QualityBadge[];
  previewMetadata?: PreviewMetadata;
  /** Auditable institution-level facts from the official US Department of Education College Scorecard snapshot. */
  officialResearch?: OfficialResearchSnapshot;
  /** Facts manually confirmed against official university pages. */
  confirmedFacts?: ConfirmedFact[];
  programSpotlights?: ProgramSpotlight[];
  /** Shared editorial content used by map, discovery and profile surfaces. */
  sharedContent?: UniversitySharedContent;
  /** Curated campus images with explicit provenance and review state. */
  campusImages?: CampusImageRecord[];
  /** Optional v2 series. Missing means the source has not published a series yet. */
  timeSeries?: TimeSeriesPoint[];
}

export interface UniversitySharedContent {
  overviewZh: string | null;
  overviewStatus: "reviewed" | "pending" | "rejected";
  motto: string | null;
  mottoZh: string | null;
  mottoStatus: "confirmed" | "candidate" | "pending" | "rejected";
  mottoSourceUrl: string | null;
  mottoSourceType: string | null;
  mottoCheckedOn: string | null;
  programSpotlights: unknown[];
  sourceRefs: unknown[];
}

export interface CampusImageRecord {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  label: string;
  sourceUrl: string;
  publisher: string;
  licenseStatus: "verified" | "pending_review" | "not_suitable";
  reviewStatus: "approved" | "pending" | "rejected";
  checkedOn: string;
  displayOrder: number;
}

export interface OfficialResearchSnapshot {
  provider: string;
  retrievedOn: string | null;
  sourceUrl: string | null;
  officialName: string | null;
  accreditationAgency: string | null;
  acceptanceRate: number | null;
  graduationRate: number | null;
  retentionRate: number | null;
  undergraduateEnrollment: number | null;
  satReading25: number | null;
  satReading75: number | null;
  satMath25: number | null;
  satMath75: number | null;
  act25: number | null;
  act75: number | null;
  tuitionInState: number | null;
  tuitionOutOfState: number | null;
  netPrice: number | null;
}

export interface ConfirmedFact {
  universityId: string;
  factType: string;
  fact: Record<string, unknown>;
  status: string;
  sourceUrl: string;
  confirmedOn: string;
}

export interface PreviewField<T = unknown> {
  value: T | null;
  status: string;
  referenceYear: number | string | null;
  scope: string | null;
  unit: string | null;
  sourceIds: string[];
  warnings: string[];
  nullReason?: string | null;
}

export const MAJOR_DIRECTORY_STATUSES = [
  "source_limited", "not_reported",
  "verified_official_undergraduate_majors", "verified_official_catalog",
  "verified_official_undergraduate_options", "verified_official_undergraduate_degree_charts",
  "verified_official_undergraduate_programs", "official_catalog_observed_partial_scope",
  "official_degree_search_observed_partial_scope",
] as const;

export interface PreviewMetadata {
  allMajors?: Array<{
    name: string;
    displayName: string;
    degreeType: string | null;
    listType: string | null;
    sourceIds: string[];
    status: string;
    warnings: string[];
    degreePaths?: string[];
    officialUrl?: string;
    officialUrls?: string[];
    officialProgramCodes?: string[];
    officialProgramLabels?: string[];
    programType?: string;
  }>;
  allMajorsStatus?: {
    status: typeof MAJOR_DIRECTORY_STATUSES[number];
    nullReason: string | null;
    sourceScope?: string;
    referenceYear?: number | string;
    checkedOn?: string;
    officialProgramRecords?: number;
    directoryEntries?: number;
  };
  enrollment: {
    undergraduate: PreviewField<number>;
    graduate: PreviewField<number>;
    total: PreviewField<number>;
  };
  admissions: {
    acceptanceRate: PreviewField<number>;
    graduationRate: PreviewField<number>;
    retentionRate: PreviewField<number>;
    sat: PreviewField<unknown>;
    act: PreviewField<unknown>;
    testPolicy: PreviewField<unknown>;
    englishPolicy: PreviewField<unknown>;
  };
  geography: {
    geographyScope: "place" | "county";
    place: PreviewField<string>;
    county: PreviewField<string>;
    cbsa?: unknown;
  };
  programPeopleGaps: Array<{
    slotId: string;
    programName: string;
    status: "source_review_not_completed";
    displayLabel: string;
    displayAsNone: false;
  }>;
}

export interface Program {
  id: string;
  name: string;
  category?: string;
  rank?: number;
  membership?: "top" | "notable";
  displayTier: DisplayTier;
  sourceUrls?: string[];
}

/** Reviewed editorial highlights, distinct from mere program membership. */
export interface ProgramSpotlight {
  name: string;
  nameZh?: string;
  kind: "distinctive" | "strength";
  reason: string;
  sourceUrl: string;
  checkedOn: string;
  rankingYear?: number;
  educationLevel?: "undergraduate";
  rankingPublisher?: string;
  rankingScope?: "national_undergraduate_program" | "doctoral_institution_engineering_specialty";
  rank?: number;
  tied?: boolean | null;
  publishedOn?: string;
}

export interface RankingMembership {
  system: "QS" | "ARWU" | "USNews" | "THE";
  year: number;
  position: number | string;
  scope?: "global" | "national";
  sourceUrl?: string;
  displayTier: DisplayTier;
}

export interface CostRecord {
  amount: number;
  currency: "RMB";
  scope: "in_state" | "out_of_state" | "international" | "unknown";
  year: number;
  components: {
    tuition?: boolean;
    roomBoard?: boolean;
    mandatoryFees?: boolean;
  };
  sourceUrl?: string;
  status: ProvenanceStatus;
}

export interface Anecdote {
  text: string;
  sourceUrl?: string;
  status: ProvenanceStatus;
}

export interface NearbyTown {
  name: string;
  nameZh?: string;
  distanceKm?: number;
}

export interface NotableAttendance {
  type: "notable_attendance";
  year?: number;
  context?: string;
  sourceUrl?: string;
  status: ProvenanceStatus;
}

export interface Person {
  id: string;
  name: string;
  relationship: string;
  domain?: string;
  era?: string;
  sourceUrl?: string;
  status: ProvenanceStatus;
  displayTier: DisplayTier;
  quarantined: boolean;
}

export interface QualityBadge {
  kind: "verified" | "warning" | "gap" | "quarantine";
  label: string;
  detail?: string;
}

export interface RegionMetricRecord {
  fipsCode: string;
  granularity: "state" | "county" | "city";
  metricId: string;
  value: number;
  rawValue: number;
  displayValue: string;
  year: number;
  source?: string;
  status?: ProvenanceStatus;
  previewOnly: boolean;
  nullableFields: string[];
}

export interface NewsArticle {
  id: string;
  title: string;
  titleEn?: string;
  summary?: string;
  source: string;
  url: string;
  publishedAt: string;
  category: string;
  displayTier: DisplayTier;
  universityId?: string;
  universityName?: string;
  universityNameZh?: string;
  eventType?: "new_program" | "application_change" | "deadline" | "scholarship" | "policy" | "campus_update" | "other";
  importance?: "high" | "medium" | "low";
  whatChanged?: string;
  whyItMatters?: string;
  actionSteps?: string[];
  actionDeadline?: string;
  audience?: string[];
  sourceStatus?: ProvenanceStatus;
}

export interface CollegeGuideSection {
  id: string;
  title: string;
  text: string;
  paragraphs: string[];
}

export interface CollegeGuide {
  id: string;
  universityId?: string;
  universityName?: string;
  universityNameZh?: string;
  sourceFile: string;
  sourceSnapshotYear: number;
  schoolNameRaw?: string;
  sourceUrl?: string;
  sections: CollegeGuideSection[];
  structured: Record<string, string | number | string[]>;
  rawText?: string;
  displayTier: DisplayTier;
  sourceStatus: ProvenanceStatus;
}
export interface RegionDetail {
  fipsCode: string;
  granularity: "state" | "county" | "city";
  name: string;
  nameEn?: string;
  metrics: RegionMetricRecord[];
  universityCount: number;
  topUniversities: UniversitySummary[];
  displayTier: DisplayTier;
  previewOnly: boolean;
  warnings: string[];
}

export interface UniversityQuery {
  search?: string;
  /** Exact directory name; membership does not imply program strength. */
  program?: string;
  rankingTiers?: string[];
  states?: string[];
  maxCostRmb?: number;
  minSafetyScore?: number;
  minDisplayTier?: DisplayTier;
  excludeQuarantined?: boolean;
  /** Maximum number of compact map rows returned by one request. */
  limit?: number;
  viewport?: { west: number; south: number; east: number; north: number };
}

export interface ProgramOption {
  name: string;
  schoolCount: number;
}

export interface RegionMetricQuery {
  metricId: string;
  granularity?: "state" | "county" | "city";
}

export interface UniversitySearchResult {
  university: UniversitySummary;
  matchedField: "name" | "chineseName" | "city" | "state" | "program";
}

export interface DataSourceUnavailable extends Error {
  code:
    | "BACKEND_OFFLINE"
    | "TIMEOUT"
    | "ABORTED"
    | "HTTP_ERROR"
    | "INVALID_RESPONSE"
    | "INVALID_JSON"
    | "BACKEND_UNAVAILABLE"
    | "UNSUPPORTED_CONTRACT_VERSION"
    | "PREVIEW_NOT_YET_AVAILABLE";
}

export type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading"; signal?: AbortSignal }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; code?: string };

export interface StatusDictionaryMap {
  [key: string]: ProvenanceStatusLabel;
}

export { RegionMetricSet } from "./region-metric-set";
