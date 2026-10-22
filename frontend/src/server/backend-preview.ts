// PathOS BFF --backend (Postgres) mode.
//
// Every artifact (manifest, universities, university details, region
// envelope, status dictionary, source index) is now a Postgres row
// instead of a JSON file. The legacy filesystem reader has been
// removed; this route handler is the single point of truth for the
// preview API.

import { NextResponse } from "next/server";
import { parseProgramSpotlights } from "@/schemas/dataset.schema";

import {
  normalizeStage5Detail,
  normalizeStage5StatusDictionary,
  normalizeStage5Summary,
  parseStage5Detail,
  parseStage5Manifest,
  parseStage5RegionEnvelope,
  parseStage5SourceIndex,
  parseStage5Summaries,
} from "@/schemas/stage5-preview.schema";

import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import { canonicalChineseName } from "@/server/university-name-catalog";
import { extractGuidePreview } from "@/lib/guide-preview";
import { pageDiscoveryCards, parseDiscoveryQuery, readCampusDiscoveryCards } from "@/server/campus-discovery";
import { abbrFromFips } from "@/config/states.config";
import { INITIAL_MAP_VIEWPORT } from "@/lib/map-viewport";

// The preview bundle is read-mostly. Keep the expensive pooler round-trips
// in-process for a short window so the map's parallel first paint does not
// repeatedly reopen the same Supabase queries.
const previewCache = new Map<string, { expiresAt: number; value: unknown }>();
const previewInflight = new Map<string, Promise<unknown>>();
const PREVIEW_CACHE_MS = 30_000;

/** Clear the in-process snapshot cache between isolated contract tests. */
export function resetPreviewCacheForTests(): void {
  previewCache.clear();
  previewInflight.clear();
}
// Extract the map contract in PostgreSQL, not after transporting the full
// research/program JSONB row across the network.
const MAP_PAYLOAD_SQL = `jsonb_build_object(
  'id', u.id, 'name', u.name, 'nameZh', u.chinese_name,
  'city', u.city, 'state', u.state, 'latitude', u.latitude, 'longitude', u.longitude,
  'rankingSummary', u.payload->'rankingSummary',
  'topPrograms', COALESCE(u.payload->'topPrograms', '[]'::jsonb),
  'qualitySummary', jsonb_build_object('warningCodes', '[]'::jsonb),
  'datasetVersion', u.dataset_version
)`;

function trustedGuideProgramNames(
  programs: readonly { name?: string }[] | undefined,
): string[] {
  return (programs ?? [])
    .map((program) => (program.name ?? "").replace(/^Majors\s*/i, "").trim())
    .filter((name) =>
      name.length >= 2 &&
      name.length <= 80 &&
      !/[\r\n]/.test(name) &&
      !/^(?:Minor|College of|School of|Department of)\b/i.test(name) &&
      !/^(?:申请时|辅修专业)/.test(name),
    )
    .slice(0, 8);
}

async function cachedPreview<T>(key: string, loader: () => Promise<T>, ttlMs = PREVIEW_CACHE_MS): Promise<T> {
  const hit = previewCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const pending = previewInflight.get(key);
  if (pending) return pending as Promise<T>;
  const request = loader().then((value) => {
    if (previewCache.size >= 500) previewCache.delete(previewCache.keys().next().value!);
    previewCache.set(key, { expiresAt: Date.now() + ttlMs, value });
    previewInflight.delete(key);
    return value;
  }).catch((error) => {
    previewInflight.delete(key);
    throw error;
  });
  previewInflight.set(key, request);
  return request;
}

export class PreviewBundleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly featureStatus = "unavailable",
  ) {
    super(message);
  }
}

function respond(body: unknown, status = 200): NextResponse {
  // Backend preview responses are immutable snapshots produced by the
  // ETL pipeline (db:import + db:repair-content). Safe to cache at the
  // CDN edge for 5 minutes; may be served stale for 10 minutes while a
  // refresh is in flight. Errors (404 / 503) are never cached.
  const cacheControl =
    status >= 200 && status < 300
      ? "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
      : "no-store";
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "X-PathOS-BFF": "preview-bundle",
      "X-PathOS-Data-Mode": "backend",
    },
  });
}

function decodeUniversityId(raw: string): string {
  try { return decodeURIComponent(raw); }
  catch {
    throw new PreviewBundleError(
      "INVALID_UNIVERSITY_ID",
      "University ID contains invalid percent encoding",
      400, false,
    );
  }
}

export function previewErrorResponse(
  error: unknown,
  endpoint: string,
): NextResponse {
  const failure = error as { code?: string; message?: string } | null;
  const databaseUnavailable =
    /^(?:08|53|57)/.test(failure?.code ?? "") ||
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(failure?.code ?? "") ||
    /connection (?:terminated|timeout)|timeout exceeded when trying to connect|connect ETIMEDOUT|remaining connection slots/i.test(failure?.message ?? "");
  const known =
    error instanceof PreviewBundleError
      ? error
      : error instanceof DatabaseNotConfiguredError
        ? error
        : databaseUnavailable
          ? new PreviewBundleError("BACKEND_UNAVAILABLE", "Database connection temporarily unavailable. Please retry.", 503, true)
        : new PreviewBundleError(
            "BUNDLE_SCHEMA_INVALID",
            error instanceof Error ? error.message : "Preview bundle validation failed",
            503, false,
          );
  return respond(
    {
      error: "preview_backend_error",
      code: known.code,
      message: known.message,
      featureStatus: known.featureStatus,
      retryable: known.retryable,
      requestContext: { endpoint },
    },
    known.status,
  );
}

// ---- DB-backed artifact readers ---------------------------------------

async function readManifest(): Promise<unknown> {
  return cachedPreview("manifest", async () => {
  const r = await getPool().query("SELECT payload FROM manifest WHERE id = 1");
  if (!r.rows[0]) {
    throw new PreviewBundleError(
      "BUNDLE_ARTIFACT_MISSING",
      "manifest row not loaded. Run npm run db:import.",
      503, false,
    );
  }
  return r.rows[0].payload;
  });
}

async function readRegionEnvelope(): Promise<unknown> {
  return cachedPreview("region-envelope", async () => {
  const r = await getPool().query("SELECT payload FROM region_envelope WHERE id = 1");
  if (!r.rows[0]) {
    throw new PreviewBundleError(
      "BUNDLE_ARTIFACT_MISSING",
      "region_envelope row not loaded. Run npm run db:import.",
      503, false,
    );
  }
  return r.rows[0].payload;
  });
}

async function readStatusDictionary(): Promise<unknown> {
  return cachedPreview("status-dictionary", async () => {
    const r = await getPool().query("SELECT code, payload FROM status_dictionary");
    return { statuses: Object.fromEntries(r.rows.map((row) => [row.code, row.payload])) };
  });
}

async function readSourceIndex(): Promise<unknown> {
  return cachedPreview("source-index", async () => {
  const r = await getPool().query("SELECT payload FROM source_index WHERE id = 1");
  if (!r.rows[0]) {
    throw new PreviewBundleError(
      "BUNDLE_ARTIFACT_MISSING",
      "source_index row not loaded. Run npm run db:import.",
      503, false,
    );
  }
  return r.rows[0].payload;
  }, 300_000);
}

async function readUniversityDetail(id: string): Promise<unknown> {
  const r = await getPool().query(
    `SELECT d.payload,
            r.official_name,
            CASE WHEN r.university_id IS NULL THEN NULL ELSE jsonb_build_object(
              'ACCREDAGENCY', r.payload->'ACCREDAGENCY',
              'ADM_RATE', r.payload->'ADM_RATE', 'C150_4', r.payload->'C150_4',
              'RET_FT4', r.payload->'RET_FT4', 'UGDS', r.payload->'UGDS',
              'SATVR25', r.payload->'SATVR25', 'SATVR75', r.payload->'SATVR75',
              'SATMT25', r.payload->'SATMT25', 'SATMT75', r.payload->'SATMT75',
              'ACTCM25', r.payload->'ACTCM25', 'ACTCM75', r.payload->'ACTCM75',
              'TUITIONFEE_IN', r.payload->'TUITIONFEE_IN',
              'TUITIONFEE_OUT', r.payload->'TUITIONFEE_OUT', 'NPT4_PUB', r.payload->'NPT4_PUB'
            ) END AS research_payload, r.source, r.retrieved_on,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', m.id, 'url', m.url, 'thumbnailUrl', m.thumbnail_url,
                'label', m.label, 'sourceUrl', m.source_url,
                'publisher', m.publisher, 'licenseStatus', m.license_status,
                'reviewStatus', m.review_status, 'checkedOn', m.checked_on,
                'displayOrder', m.display_order
              ) ORDER BY m.display_order, m.id)
              FROM university_media m
              WHERE m.university_id = d.university_id
                AND m.media_type = 'campus_photo'
                AND m.review_status = 'approved'
                AND m.license_status = 'verified'
            ), '[]'::jsonb) AS campus_images,
            c.overview_zh, c.overview_status, c.motto, c.motto_zh, c.motto_status,
            c.motto_source_url, c.motto_source_type, c.motto_checked_on,
            c.program_spotlights AS shared_program_spotlights,
            c.source_refs AS shared_source_refs,
            g.sections AS guide_sections, g.structured AS guide_structured,
            (SELECT jsonb_build_object('sources', COALESCE((
              SELECT jsonb_agg(entry.source_doc) FROM jsonb_array_elements(si.payload->'sources') AS entry(source_doc)
              WHERE entry.source_doc->>'sourceId' IN (
                SELECT jsonb_path_query(d.payload, '$.**.sourceIds[*]') #>> '{}'
              )
            ), '[]'::jsonb)) FROM source_index si WHERE si.id = 1) AS detail_source_index,
            EXISTS (SELECT 1 FROM source_index si WHERE si.id = 1) AS source_index_present,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'universityId', f.university_id, 'factType', f.fact_type,
                'fact', f.fact, 'status', f.status,
                'sourceUrl', f.source_url, 'confirmedOn', f.confirmed_on
              ) ORDER BY f.fact_type)
              FROM school_confirmed_facts f WHERE f.university_id = d.university_id
            ), '[]'::jsonb) AS confirmed_facts
       FROM university_details d
       LEFT JOIN school_research_records r ON r.university_id = d.university_id
       LEFT JOIN LATERAL (
         SELECT sections, structured FROM college_guides
         WHERE university_id = d.university_id ORDER BY source_snapshot_year DESC LIMIT 1
       ) g ON TRUE
       LEFT JOIN university_content c ON c.university_id = d.university_id
       WHERE d.university_id = $1`,
    [id],
  );
  if (!r.rows[0]) {
    throw new PreviewBundleError(
      "UNIVERSITY_NOT_FOUND",
      `University not found: ${id}`,
      404, false,
    );
  }
  const joined = r.rows[0];
  if (joined.source_index_present === false) {
    throw new PreviewBundleError(
      "BUNDLE_ARTIFACT_MISSING",
      "source_index row not loaded. Run npm run db:import.",
      503, false,
    );
  }
  const payload = joined.payload as Record<string, unknown>;
  const facts = joined.confirmed_facts ?? [];
  const guidePreview = joined.guide_sections || joined.guide_structured
    ? extractGuidePreview({ structured: joined.guide_structured ?? {}, sections: joined.guide_sections ?? [] })
    : undefined;
  const row = joined.research_payload ? joined : null;
  const guideProgramNames = trustedGuideProgramNames(guidePreview?.programs);
  const guidePrograms = guideProgramNames.map((name) => ({
    id: `${id}:guide-program:${name}`,
    name,
    sourceIds: [],
  })) ?? [];
  const storedPrograms = Array.isArray(payload.programs)
    ? payload.programs
    : Array.isArray(payload.topPrograms)
      ? payload.topPrograms
          .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
          .map((program) => ({
            id: typeof program.programId === "string" ? program.programId : `${id}:program:${String(program.name ?? "")}`,
            name: typeof program.name === "string" ? program.name : "",
            sourceIds: Array.isArray(program.sourceIds) ? program.sourceIds.filter((source): source is string => typeof source === "string") : [],
          }))
          .filter((program) => program.name.length > 0)
      : [];
  const storedProgramNames = Array.isArray(payload.topPrograms)
    ? payload.topPrograms
        .map((value) => typeof value === "string" ? value : value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string" ? (value as Record<string, unknown>).name as string : null)
        .filter((name): name is string => Boolean(name))
    : [];
  const hasExistingPrograms =
    storedPrograms.length > 0 || storedProgramNames.length > 0;
  const enrichedPayload = hasExistingPrograms
    ? { ...payload, programs: storedPrograms.length > 0 ? storedPrograms : payload.programs, topPrograms: storedProgramNames }
    : guidePrograms.length
      ? { ...payload, programs: guidePrograms, topPrograms: guidePrograms.map((program) => program.name) }
      : payload;
  const sharedContent = {
    overviewZh: joined.overview_zh ?? null,
    overviewStatus: joined.overview_status ?? "pending",
    motto: joined.motto ?? null,
    mottoZh: joined.motto_zh ?? null,
    mottoStatus: joined.motto_status ?? "pending",
    mottoSourceUrl: joined.motto_source_url ?? null,
    mottoSourceType: joined.motto_source_type ?? null,
    mottoCheckedOn: joined.motto_checked_on
      ? (joined.motto_checked_on instanceof Date ? joined.motto_checked_on.toISOString().slice(0, 10) : String(joined.motto_checked_on).slice(0, 10))
      : null,
    programSpotlights: joined.shared_program_spotlights ?? [],
    sourceRefs: joined.shared_source_refs ?? [],
  };
  if (!row) return { ...enrichedPayload, confirmedFacts: facts, campusImages: joined.campus_images ?? [], detailSourceIndex: joined.detail_source_index, sharedContent };
  const p = (row.research_payload ?? {}) as Record<string, unknown>;
  const number = (key: string): number | null => {
    if (p[key] === null || p[key] === undefined || p[key] === "") return null;
    const value = Number(p[key]);
    return Number.isFinite(value) ? value : null;
  };
  const source = (row.source ?? {}) as Record<string, unknown>;
  return {
    ...enrichedPayload,
    confirmedFacts: facts,
    campusImages: joined.campus_images ?? [],
    detailSourceIndex: joined.detail_source_index,
    sharedContent,
    officialResearch: {
      provider: String(source.provider ?? "US Department of Education College Scorecard"),
      retrievedOn: row.retrieved_on instanceof Date ? row.retrieved_on.toISOString().slice(0, 10) : String(row.retrieved_on ?? ""),
      sourceUrl: typeof source.url === "string" ? source.url : null,
      officialName: typeof row.official_name === "string" ? row.official_name : null,
      accreditationAgency: typeof p.ACCREDAGENCY === "string" && p.ACCREDAGENCY !== "NA" ? p.ACCREDAGENCY : null,
      acceptanceRate: number("ADM_RATE"),
      graduationRate: number("C150_4"),
      retentionRate: number("RET_FT4"),
      undergraduateEnrollment: number("UGDS"),
      satReading25: number("SATVR25"), satReading75: number("SATVR75"),
      satMath25: number("SATMT25"), satMath75: number("SATMT75"),
      act25: number("ACTCM25"), act75: number("ACTCM75"),
      tuitionInState: number("TUITIONFEE_IN"), tuitionOutOfState: number("TUITIONFEE_OUT"),
      netPrice: number("NPT4_PUB"),
    },
  };
}

async function readConfirmedFacts(universityId?: string): Promise<unknown[]> {
  const result = universityId
    ? await getPool().query(
        `SELECT university_id, fact_type, fact, status, source_url, confirmed_on
         FROM school_confirmed_facts WHERE university_id = $1 ORDER BY fact_type`,
        [universityId],
      )
    : await getPool().query(
        `SELECT university_id, fact_type, fact, status, source_url, confirmed_on
         FROM school_confirmed_facts ORDER BY university_id, fact_type`,
      );
  return result.rows.map((row) => ({
    universityId: row.university_id,
    factType: row.fact_type,
    fact: row.fact,
    status: row.status,
    sourceUrl: row.source_url,
    confirmedOn: row.confirmed_on instanceof Date
      ? row.confirmed_on.toISOString().slice(0, 10)
      : String(row.confirmed_on),
  }));
}

async function readNews(category?: string): Promise<unknown[]> {
  try {
    const params: unknown[] = [];
    const where = category ? "WHERE a.category = $1 OR a.event_type = $1" : "";
    if (category) params.push(category);
    const result = await getPool().query(
      `SELECT a.id, a.university_id, u.name AS university_name,
              u.chinese_name AS university_name_zh, a.title, a.title_en,
              a.summary, a.what_changed, a.why_it_matters, a.action_steps,
              a.category, a.event_type, a.audience, a.source, a.url,
              a.published_at, a.action_deadline, a.importance,
              a.display_tier, a.source_status
       FROM news_articles a
       LEFT JOIN universities u ON u.id = a.university_id
       ${where}
       ORDER BY CASE a.importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                COALESCE(a.action_deadline, a.published_at) ASC,
                a.published_at DESC
       LIMIT 100`,
      params,
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      titleEn: row.title_en ?? undefined,
      summary: row.summary ?? undefined,
      source: row.source,
      url: row.url,
      publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at),
      category: row.category,
      displayTier: row.display_tier ?? "preview",
      universityId: row.university_id ?? undefined,
      whatChanged: row.what_changed ?? undefined,
      whyItMatters: row.why_it_matters ?? undefined,
      actionSteps: Array.isArray(row.action_steps) ? row.action_steps : [],
      actionDeadline: row.action_deadline instanceof Date ? row.action_deadline.toISOString() : row.action_deadline ? String(row.action_deadline) : undefined,
      audience: Array.isArray(row.audience) ? row.audience : [],
      eventType: row.event_type ?? "other",
      importance: row.importance ?? "medium",
      sourceStatus: row.source_status ?? "source_review_not_completed",
    }));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return [];
    throw error;
  }
}
async function mapCollegeGuideRow(row: Record<string, any>, includeRawText: boolean): Promise<Record<string, unknown>> {
  return {
    id: row.id,
    universityId: row.university_id ?? undefined,
    universityName: row.university_name ?? undefined,
    universityNameZh: row.university_name_zh ?? undefined,
    sourceFile: row.source_file,
    sourceSnapshotYear: row.source_snapshot_year,
    schoolNameRaw: row.school_name_raw ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    sections: Array.isArray(row.sections) ? row.sections : [],
    structured: row.structured && typeof row.structured === "object" ? row.structured : {},
    ...(includeRawText ? { rawText: row.raw_text ?? undefined } : {}),
    displayTier: row.display_tier ?? "preview",
    sourceStatus: row.source_status ?? "archived_source",
  };
}

async function readCollegeGuides(query?: string): Promise<unknown[]> {
  try {
    const params: unknown[] = [];
    const where = query
      ? "WHERE g.school_name_raw ILIKE $1 OR u.name ILIKE $1 OR u.chinese_name ILIKE $1 OR g.raw_text ILIKE $1"
      : "";
    if (query) params.push(`%${query}%`);
    const result = await getPool().query(
      `SELECT g.id, g.university_id, u.name AS university_name,
              u.chinese_name AS university_name_zh, g.source_file,
              g.source_snapshot_year, g.school_name_raw, g.source_url,
              g.sections, g.structured, g.display_tier, g.source_status
       FROM college_guides g
       LEFT JOIN universities u ON u.id = g.university_id
       ${where}
       ORDER BY g.source_snapshot_year DESC, COALESCE(u.name, g.school_name_raw) ASC
       LIMIT 100`,
      params,
    );
    return Promise.all(result.rows.map((row) => mapCollegeGuideRow(row, false)));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return [];
    throw error;
  }
}

async function readCollegeGuide(universityId: string): Promise<unknown | null> {
  try {
    const result = await getPool().query(
      `SELECT g.id, g.university_id, u.name AS university_name,
              u.chinese_name AS university_name_zh, g.source_file,
              g.source_snapshot_year, g.school_name_raw, g.source_url,
              g.sections, g.structured, g.raw_text, g.display_tier, g.source_status
       FROM college_guides g
       LEFT JOIN universities u ON u.id = g.university_id
       WHERE g.university_id = $1
       ORDER BY g.source_snapshot_year DESC
       LIMIT 1`,
      [universityId],
    );
    if (!result.rows[0]) return null;
    return mapCollegeGuideRow(result.rows[0], true);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01") return null;
    throw error;
  }
}
// ---- Query builders ---------------------------------------------------

interface SummaryFilters {
  states: string[];
  tiers: string[];
  search: string;
  maxCostRmb: number;
  limit: number;
  program: string;
  viewport?: { west: number; south: number; east: number; north: number };
}

function buildUniversitiesWhere(filters: SummaryFilters): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.states.length) {
    params.push(filters.states);
    where.push(`state = ANY($${params.length}::text[])`);
  }
  if (filters.tiers.length) {
    params.push(filters.tiers);
    where.push(`ranking_tier = ANY($${params.length}::text[])`);
  }
  if (filters.search) {
    params.push(filters.search);
    where.push(`search_text @@ plainto_tsquery('simple', $${params.length})`);
  }
  if (filters.program) {
    params.push(filters.program);
    where.push(`EXISTS (
      SELECT 1 FROM university_details pd
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pd.payload->'allMajors', '[]'::jsonb) || COALESCE(pd.payload->'programs', '[]'::jsonb)) AS directory(entry)
      WHERE pd.university_id = u.id AND lower(btrim(CASE WHEN jsonb_typeof(directory.entry) = 'string'
        THEN directory.entry #>> '{}' ELSE directory.entry->>'name' END)) = lower($${params.length}::text)
    )`);
  }
  if (Number.isFinite(filters.maxCostRmb) && filters.maxCostRmb > 0) {
    params.push(filters.maxCostRmb);
    where.push(`(payload->'costSummary'->>'minimumUsd') IS NOT NULL`);
    where.push(
      `((payload->'costSummary'->>'minimumUsd')::numeric * 7.2) <= $${params.length}`,
    );
  }
  if (filters.viewport) {
    params.push(filters.viewport.west, filters.viewport.east, filters.viewport.south, filters.viewport.north);
    const west = params.length - 3;
    const east = params.length - 2;
    const south = params.length - 1;
    const north = params.length;
    where.push(`latitude BETWEEN $${south} AND $${north}`);
    where.push(filters.viewport.west <= filters.viewport.east
      ? `longitude BETWEEN $${west} AND $${east}`
      : `(longitude >= $${west} OR longitude <= $${east})`);
  }
  return {
    sql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

function parseFiltersFromUrl(url: URL): SummaryFilters {
  const program = (url.searchParams.get("program") ?? "").trim();
  if (program.length > 240) throw new PreviewBundleError("INVALID_MAP_QUERY", "Program name is too long", 400, false);
  const number = (key: string) => {
    const raw = url.searchParams.get(key);
    if (raw === null || raw.trim() === "") return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new PreviewBundleError("INVALID_MAP_QUERY", `${key} must be a finite number`, 400, false);
    }
    return value;
  };
  const west = number("west");
  const south = number("south");
  const east = number("east");
  const north = number("north");
  const bounds = [west, south, east, north];
  const hasBounds = bounds.some((value) => value !== undefined);
  if (hasBounds && bounds.some((value) => value === undefined)) {
    throw new PreviewBundleError("INVALID_MAP_QUERY", "All four viewport bounds are required", 400, false);
  }
  if (hasBounds && (
    Math.abs(west!) > 180 || Math.abs(east!) > 180 ||
    Math.abs(south!) > 90 || Math.abs(north!) > 90 || south! >= north!
  )) {
    throw new PreviewBundleError("INVALID_MAP_QUERY", "Viewport bounds are out of range", 400, false);
  }
  return {
    // Accept both the URL/map contract (FIPS, e.g. 06) and the database
    // contract (USPS abbreviation, e.g. CA). This keeps deep links and
    // direct API calls from silently returning an empty school set.
    states: url.searchParams.getAll("state").map((value) => {
      const normalized = value.trim().toUpperCase();
      return abbrFromFips(normalized) ?? normalized;
    }),
    tiers: url.searchParams.getAll("tier"),
    search: (url.searchParams.get("search") ?? "").trim(),
    maxCostRmb: Number(url.searchParams.get("maxCostRmb")),
    limit: parseBoundedLimit(url.searchParams.get("limit")),
    program,
    viewport: hasBounds
      ? { west: west as number, south: south as number, east: east as number, north: north as number }
      : undefined,
  };
}

function parseBoundedLimit(raw: string | number | null, fallback = 250): number {
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new PreviewBundleError("INVALID_MAP_QUERY", "limit must be a finite number", 400, false);
  }
  return Math.min(500, Math.max(1, Math.trunc(value)));
}

async function queryUniversities(filters: SummaryFilters): Promise<unknown[]> {
  const cacheKey = `universities:${JSON.stringify(filters)}`;
  return cachedPreview(cacheKey, async () => {
  const { sql, params } = buildUniversitiesWhere(filters);
  // The map only needs the compact university row. Do not join research
  // records here: official admissions, tuition, and enrollment data belong
  // to the click-time detail request.
  const limit = parseBoundedLimit(filters.limit);
  const r = await getPool().query(
    `SELECT ${MAP_PAYLOAD_SQL} AS payload
       FROM universities u
       ${sql}
       ORDER BY u.id
       LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  return r.rows.map((row) => {
    const base = normalizeStage5Summary(row.payload);
    const nameZh = canonicalChineseName(base.id, base.name, base.nameZh) || "中文名称待补充";
    // Keep the map payload deliberately small. The map gets at most two
    // directory labels so the school list can orient the user before the
    // click; the full program directory and evidence remain click-time
    // detail data.
    const compactPrograms = (base.topPrograms as readonly unknown[] | undefined)
      ?.map((program) => typeof program === "string"
        ? program
        : program && typeof program === "object" && typeof (program as { name?: unknown }).name === "string"
          ? (program as { name: string }).name
          : "")
      .filter((program): program is string => program.trim().length > 0);
    return {
      id: base.id,
      name: base.name,
      nameZh,
      chineseName: nameZh,
      latitude: base.latitude,
      longitude: base.longitude,
      state: base.state,
      city: base.city,
      stateFips: base.stateFips,
      rankingSummary: base.rankingSummary,
      rankingTier: base.rankingTier,
      ...(compactPrograms?.length
        ? { topPrograms: [...new Set(compactPrograms)].slice(0, 2) }
        : {}),
      displayTier: base.displayTier,
      previewOnly: base.previewOnly,
      datasetVersion: base.datasetVersion,
      nullableFields: base.nullableFields,
    };
  });
  }, 300_000);
}

/**
 * Prime the exact query used by the first map paint while the server is idle.
 * This keeps Supabase pooler connection setup out of the first user's click
 * without introducing a second source of university data.
 */
export function warmPreviewCache(): void {
  if (!process.env.DATABASE_URL || process.env.PATHOS_DATA_MODE === "fixture") return;
  void queryUniversities({
    states: [],
    tiers: [],
    search: "",
    maxCostRmb: Number.NaN,
    limit: 250,
    program: "",
    viewport: INITIAL_MAP_VIEWPORT,
  }).catch((error) => {
    console.warn("[pathos preview] startup cache warmup skipped", {
      code: error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined,
    });
  });
}

async function readProgramOptions(query: string): Promise<unknown[]> {
  if (query.length > 240) throw new PreviewBundleError("INVALID_MAP_QUERY", "Program search is too long", 400, false);
  return cachedPreview(`program-options:${query.toLowerCase()}`, async () => {
    const literal = query.replace(/[\\%_]/g, "\\$&");
    const result = await getPool().query(`WITH memberships AS (
      SELECT u.id, btrim(CASE WHEN jsonb_typeof(directory.entry) = 'string'
        THEN directory.entry #>> '{}' ELSE directory.entry->>'name' END) AS name
      FROM universities u JOIN university_details pd ON pd.university_id = u.id
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pd.payload->'allMajors', '[]'::jsonb) || COALESCE(pd.payload->'programs', '[]'::jsonb)) AS directory(entry)
    ) SELECT min(name) AS name, count(DISTINCT id)::int AS "schoolCount" FROM memberships
      WHERE name <> '' AND name ILIKE $1 GROUP BY lower(name)
      ORDER BY count(DISTINCT id) DESC, min(name) ASC LIMIT 60`, [`%${literal}%`]);
    return result.rows;
  }, 300_000);
}

/** A separate, lazy program index. Never included in the initial map load. */
async function readProgramCatalog(): Promise<unknown[]> {
  return cachedPreview("program-catalog:v1", async () => {
    const result = await getPool().query(`
      SELECT ${MAP_PAYLOAD_SQL} AS payload,
        (SELECT COALESCE(jsonb_agg(DISTINCT CASE WHEN jsonb_typeof(item) = 'string'
          THEN item #>> '{}' ELSE item->>'name' END), '[]'::jsonb)
         FROM jsonb_array_elements(COALESCE(d.payload->'allMajors', '[]'::jsonb) || COALESCE(d.payload->'programs', '[]'::jsonb)) item) AS majors
      FROM universities u JOIN university_details d ON d.university_id = u.id
      ORDER BY u.name LIMIT 5000`);
    return result.rows.map((row) => {
      const names = [...(Array.isArray(row.majors) ? row.majors : []), ...(Array.isArray(row.programs) ? row.programs : [])]
        .map((item) => typeof item === "string" ? item : item?.name)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
      const base = normalizeStage5Summary(row.payload);
      return { id: base.id, name: base.name, nameZh: base.nameZh, chineseName: base.chineseName,
        latitude: base.latitude, longitude: base.longitude, state: base.state, city: base.city,
        rankingSummary: base.rankingSummary, rankingTier: base.rankingTier, displayTier: base.displayTier,
        topPrograms: [...new Set(names)] };
    });
  }, 300_000);
}

// ---- Main handler -----------------------------------------------------

export async function handleBackendPreviewRoute(
  req: Request,
  _env: NodeJS.ProcessEnv,
): Promise<NextResponse> {
  const url = new URL(req.url);
  const endpoint = (url.searchParams.get("endpoint") ?? "").trim();
  if (!endpoint) {
    return previewErrorResponse(
      new PreviewBundleError("MISSING_ENDPOINT", "endpoint is required", 400, false),
      endpoint,
    );
  }
  try {
    if (endpoint === "campus-discovery") {
      let query;
      try { query = parseDiscoveryQuery(url.searchParams); }
      catch { throw new PreviewBundleError("INVALID_DISCOVERY_QUERY", "Invalid campus discovery pagination", 400, false); }
      const cards = await cachedPreview("campus-discovery:v1", readCampusDiscoveryCards, 300_000);
      return respond(pageDiscoveryCards(cards, query));
    }

    if (endpoint === "manifest") {
      const manifest = parseStage5Manifest(await readManifest());
      const dictionary = normalizeStage5StatusDictionary(await readStatusDictionary());
      return respond({ ...manifest, statusDictionary: dictionary });
    }

    if (endpoint === "universities") {
      const filters = parseFiltersFromUrl(url);
      const rows = await queryUniversities(filters);
      return respond(rows);
    }

    if (endpoint === "program-catalog") return respond(await readProgramCatalog());
    if (endpoint === "program-options") return respond(await readProgramOptions((url.searchParams.get("q") ?? "").trim()));

    if (endpoint === "university") {
      const id = decodeUniversityId((url.searchParams.get("id") ?? "").trim());
      if (!id) {
        throw new PreviewBundleError(
          "MISSING_UNIVERSITY_ID",
          "University ID is required",
          400, false,
        );
      }
      const stored = await cachedPreview(`university-detail:${id}`, () => readUniversityDetail(id), 120_000) as Record<string, unknown>;
      const { officialResearch, confirmedFacts, campusImages, sharedContent, detailSourceIndex: indexPayload, ...detailPayload } = stored;
      const raw = parseStage5Detail(detailPayload);
      if (raw.id !== id) {
        throw new PreviewBundleError(
          "SUMMARY_DETAIL_ID_MISMATCH",
          "Detail ID does not match request",
          503, false,
        );
      }
      const sourceIndex = parseStage5SourceIndex(indexPayload);
      const spotlightFact = Array.isArray(confirmedFacts) ? confirmedFacts.find((fact) =>
        fact.factType === "program_spotlights_v1" && fact.status === "confirmed") : null;
      let spotlights: unknown = [];
      if (spotlightFact) {
        try { spotlights = typeof spotlightFact.fact === "string" ? JSON.parse(spotlightFact.fact) : spotlightFact.fact; }
        catch { /* Malformed optional editorial data cannot break the school card. */ }
      }
      const programSpotlights = parseProgramSpotlights(spotlights);
      const normalized = normalizeStage5Detail(raw, sourceIndex);
      const sourceUrls = new Set(normalized.sources.map((source) => source.url));
      const reviewedSources = programSpotlights.flatMap((program) => {
        if (sourceUrls.has(program.sourceUrl)) return [];
        sourceUrls.add(program.sourceUrl);
        return [{ url: program.sourceUrl, status: "live_verified_normalized" as const, retrievedAt: program.checkedOn }];
      });
      return respond({
        ...normalized,
        sources: [...normalized.sources, ...reviewedSources],
        ...(officialResearch ? { officialResearch } : {}),
        ...(confirmedFacts ? { confirmedFacts } : {}),
        campusImages: Array.isArray(campusImages) ? campusImages : [],
        ...(sharedContent ? { sharedContent } : {}),
        programSpotlights,
      });
    }

    if (endpoint === "confirmed-facts") {
      const universityId = url.searchParams.get("universityId") ?? undefined;
      return respond({ view: "confirmed-facts", facts: await readConfirmedFacts(universityId) });
    }

    if (endpoint === "region-metrics") {
      const region = parseStage5RegionEnvelope(await readRegionEnvelope());
      return respond(region);
    }

    if (endpoint === "status-dictionary") {
      return respond(normalizeStage5StatusDictionary(await readStatusDictionary()));
    }

    if (endpoint === "source-index") {
      return respond(parseStage5SourceIndex(await readSourceIndex()));
    }

    if (endpoint === "search") {
      const query = (url.searchParams.get("q") ?? "").trim();
      const limit = Math.max(0, Math.min(50, Number(url.searchParams.get("limit") ?? 20)));
      if (query.length < 2) return respond([]);
      const r = await getPool().query(
        `SELECT payload,
                ts_rank(search_text, plainto_tsquery('simple', $1)) AS rank
         FROM universities
         WHERE search_text @@ plainto_tsquery('simple', $1)
         ORDER BY rank DESC
         LIMIT $2`,
        [query, limit],
      );
      const rows = r.rows.map((row) => ({
        university: normalizeStage5Summary(row.payload),
        matchedField: "name" as const,
      }));
      return respond(rows);
    }

    if (endpoint === "news") {
      const category = url.searchParams.get("category")?.trim() || undefined;
      return respond(await readNews(category));
    }

    if (endpoint === "college-guides") {
      const query = url.searchParams.get("q")?.trim() || undefined;
      return respond(await readCollegeGuides(query));
    }

    if (endpoint === "college-guide") {
      const universityId = decodeUniversityId((url.searchParams.get("universityId") ?? "").trim());
      if (!universityId) {
        throw new PreviewBundleError("MISSING_UNIVERSITY_ID", "University ID is required", 400, false);
      }
      return respond(await readCollegeGuide(universityId));
    }

    if (endpoint === "region-detail") {
      throw new PreviewBundleError(
        "REGION_METRICS_BLOCKED",
        "Region metrics are blocked for this Preview checkpoint",
        404, false,
        "blocked",
      );
    }

    throw new PreviewBundleError(
      "UNKNOWN_ENDPOINT",
      `Unknown Preview endpoint: ${endpoint}`,
      404, false,
    );
  } catch (error) {
    return previewErrorResponse(error, endpoint);
  }
}
