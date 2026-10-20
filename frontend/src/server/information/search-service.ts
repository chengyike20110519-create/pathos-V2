import { performance } from "node:perf_hooks";

import { MAJOR_PROFILES, type MajorDefinition } from "@/domain/information/major";
import type { FactValueType } from "@/domain/information/fact";
import { getPool } from "@/server/db";

export const SEARCH_TARGET_MS = 500;

export type SearchHitType =
  | "university"
  | "major"
  | "location"
  | "fact"
  | "event";

export interface SearchHit {
  id: string;
  type: SearchHitType;
  title: string;
  subtitle?: string;
  snippet?: string;
  href?: string;
  score: number;
  badge?: string;
}

export interface SearchGroups {
  universities: SearchHit[];
  majors: SearchHit[];
  locations: SearchHit[];
  facts: SearchHit[];
  events: SearchHit[];
}

export interface GlobalSearchResult {
  query: string;
  groups: SearchGroups;
  total: number;
  stats: {
    searchDurationMs: number;
    durationMs: number;
    targetMs: number;
    withinTarget: boolean;
    resultCount: number;
    noResultCount: number;
    missRecorded: boolean;
  };
}

export interface HotNoResultQuery {
  query: string;
  requests: number;
  lastSeenAt: string;
}

type UniversityRow = {
  id: string;
  name: string;
  chinese_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  payload?: { topPrograms?: unknown } | null;
};

type LocationRow = {
  city: string | null;
  state: string | null;
  university_count: string | number;
};

type FactRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  field_key: string;
  value_type: FactValueType;
  value_number: string | number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  value_range_min: string | number | null;
  value_range_max: string | number | null;
  value_list: unknown;
  academic_year: string | null;
  source_url: string;
  retrieved_at: Date | string;
};

type EventRow = {
  id: string;
  event_type: string;
  title: string;
  summary: string;
  entity_type: string;
  entity_id: string;
  source_url: string;
  published_at: Date | string | null;
};

const FACT_SEARCH_TEXT = `COALESCE(entity_id, '') || ' ' || COALESCE(field_key, '') || ' ' ||
  COALESCE(value_text, '') || ' ' || COALESCE(notes, '')`;
const EVENT_SEARCH_TEXT = `COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' ||
  COALESCE(what_changed, '') || ' ' || COALESCE(why_it_matters, '')`;

export function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 100);
}

export function searchQueryKey(raw: string): string {
  return normalizeSearchQuery(raw).toLowerCase();
}

export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function likeParam(query: string): string {
  return `%${escapeLike(query)}%`;
}

function dateIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function number(value: string | number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function universityHref(entityType: string, entityId: string): string {
  if (entityType === "university") return `/university/${encodeURIComponent(entityId)}`;
  if (entityType === "major") return `/majors/${encodeURIComponent(entityId)}`;
  if (entityType === "location") return "/entry/map";
  if (entityType === "scholarship") return "/costs";
  return "/opportunities";
}

function matchedUniversityField(row: UniversityRow, needle: string): SearchHit["subtitle"] {
  const values = [
    row.name,
    row.chinese_name,
    row.city,
    row.state,
    Array.isArray(row.payload?.topPrograms)
      ? row.payload?.topPrograms.filter((item) => typeof item === "string").join(" ")
      : "",
  ];
  const found = values.find((value) => text(value).toLowerCase().includes(needle));
  if (!found) return undefined;
  if (found === row.city) return "匹配城市";
  if (found === row.state) return "匹配州";
  if (Array.isArray(row.payload?.topPrograms) && found !== row.name && found !== row.chinese_name) {
    return "匹配专业标签";
  }
  return undefined;
}

function toUniversityHit(row: Record<string, unknown>, needle: string): SearchHit {
  const value = row as UniversityRow;
  const place = [value.city, value.state, value.country].filter(Boolean).join(", ");
  return {
    id: value.id,
    type: "university",
    title: value.chinese_name || value.name,
    subtitle: [value.name, place, matchedUniversityField(value, needle)].filter(Boolean).join(" · "),
    href: `/university/${encodeURIComponent(value.id)}`,
    score: Number(row.rank ?? 0),
    badge: "Preview",
  };
}

function toLocationHit(row: Record<string, unknown>): SearchHit {
  const value = row as LocationRow;
  const title = value.city ? `${value.city}, ${value.state ?? ""}` : (value.state ?? "位置");
  return {
    id: `location:${title.toLowerCase()}`,
    type: "location",
    title: title.replace(/,\s*$/, ""),
    subtitle: `${Number(value.university_count)} 所学校`,
    href: `/entry/map?location=${encodeURIComponent(title.replace(/,\s*$/, ""))}`,
    score: Number(value.university_count),
    badge: "地理位置",
  };
}

function factValue(row: FactRow): string {
  if (row.value_boolean != null) return row.value_boolean ? "是" : "否";
  if (row.value_number != null) {
    const value = Number(row.value_number);
    const formatted = value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    return row.academic_year ? `${formatted} (${row.academic_year})` : formatted;
  }
  if (row.value_range_min != null || row.value_range_max != null) {
    return `${Number(row.value_range_min ?? 0).toLocaleString("zh-CN")} - ${Number(
      row.value_range_max ?? 0,
    ).toLocaleString("zh-CN")}`;
  }
  if (Array.isArray(row.value_list)) return row.value_list.map(String).join(" / ");
  return row.value_text ?? "已核验";
}

function toFactHit(row: Record<string, unknown>): SearchHit {
  const value = row as FactRow;
  return {
    id: value.id,
    type: "fact",
    title: value.field_key,
    subtitle: `${value.entity_type} · ${value.entity_id}`,
    snippet: `${factValue(value)} · 采集 ${dateIso(value.retrieved_at)?.slice(0, 10) ?? "未知时间"}`,
    href: universityHref(value.entity_type, value.entity_id),
    score: Number(row.rank ?? 0),
    badge: "Approved fact",
  };
}

function toEventHit(row: Record<string, unknown>): SearchHit {
  const value = row as EventRow;
  return {
    id: value.id,
    type: "event",
    title: value.title,
    subtitle: `${value.event_type} · ${value.entity_type} ${value.entity_id}`,
    snippet: value.summary,
    href:
      value.entity_type === "university"
        ? `/university/${encodeURIComponent(value.entity_id)}`
        : "/opportunities",
    score: Number(row.rank ?? 0),
    badge: dateIso(value.published_at)?.slice(0, 10) ?? "信息事件",
  };
}

function majorScore(major: MajorDefinition, needle: string): number {
  const nameZh = major.nameZh.toLowerCase();
  const nameEn = major.nameEn.toLowerCase();
  if (nameZh === needle || nameEn === needle) return 100;
  if (nameZh.startsWith(needle) || nameEn.startsWith(needle)) return 94;
  if (nameZh.includes(needle) || nameEn.includes(needle)) return 88;
  if (major.aliases.some((alias) => alias.toLowerCase().includes(needle))) return 82;
  if (major.summary.toLowerCase().includes(needle)) return 70;
  if (major.boundary.toLowerCase().includes(needle)) return 62;
  return 0;
}

export function searchMajorDefinitions(query: string, limit = 8): SearchHit[] {
  const needle = normalizeSearchQuery(query).toLowerCase();
  if (needle.length < 2) return [];
  return MAJOR_PROFILES
    .map((major, index) => ({ major, index, score: majorScore(major, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ major, score }) => ({
      id: `major:${major.slug}`,
      type: "major" as const,
      title: major.nameZh,
      subtitle: major.nameEn,
      snippet: major.summary,
      href: `/majors/${major.slug}`,
      score,
      badge: "专业档案",
    }));
}

async function queryUniversities(query: string, limit: number): Promise<SearchHit[]> {
  const r = await getPool().query(
    `SELECT id, name, chinese_name, city, state, country, payload,
            ts_rank(search_text, plainto_tsquery('simple', $1)) AS rank
       FROM universities
      WHERE search_text @@ plainto_tsquery('simple', $1)
         OR name LIKE $2 ESCAPE '\\'
         OR chinese_name LIKE $2 ESCAPE '\\'
         OR city LIKE $2 ESCAPE '\\'
         OR state LIKE $2 ESCAPE '\\'
      ORDER BY rank DESC, name ASC
      LIMIT $3`,
    [query, likeParam(query), limit],
  );
  const needle = query.toLowerCase();
  return r.rows.map((row) => toUniversityHit(row as Record<string, unknown>, needle));
}

async function queryLocations(query: string, limit: number): Promise<SearchHit[]> {
  const r = await getPool().query(
    `SELECT city, state, COUNT(*)::integer AS university_count
       FROM universities
      WHERE city LIKE $2 ESCAPE '\\' OR state LIKE $2 ESCAPE '\\'
      GROUP BY city, state
      ORDER BY university_count DESC, city NULLS LAST, state NULLS LAST
      LIMIT $1`,
    [limit, likeParam(query)],
  );
  return r.rows.map((row) => toLocationHit(row as Record<string, unknown>));
}

async function queryApprovedFacts(query: string, limit: number): Promise<SearchHit[]> {
  const expression = `to_tsvector('simple', ${FACT_SEARCH_TEXT})`;
  const r = await getPool().query(
    `SELECT id, entity_type, entity_id, field_key, value_type, value_number,
            value_text, value_boolean, value_range_min, value_range_max,
            value_list, academic_year, source_url, retrieved_at,
            ts_rank(${expression}, plainto_tsquery('simple', $1)) AS rank
       FROM facts
      WHERE review_status = 'approved'
        AND (effective_to IS NULL OR effective_to >= NOW())
        AND (effective_from IS NULL OR effective_from <= NOW())
        AND (
          ${expression} @@ plainto_tsquery('simple', $1)
          OR (${FACT_SEARCH_TEXT}) LIKE $2 ESCAPE '\\'
          OR value_number::text = $1
        )
      ORDER BY rank DESC, retrieved_at DESC
      LIMIT $3`,
    [query, likeParam(query), limit],
  );
  return r.rows.map((row) => toFactHit(row as Record<string, unknown>));
}

async function queryInformationEvents(query: string, limit: number): Promise<SearchHit[]> {
  const expression = `to_tsvector('simple', ${EVENT_SEARCH_TEXT})`;
  const r = await getPool().query(
    `SELECT id, event_type, title, summary, entity_type, entity_id,
            source_url, published_at,
            ts_rank(${expression}, plainto_tsquery('simple', $1)) AS rank
       FROM information_events
      WHERE is_published = TRUE
        AND (
          ${expression} @@ plainto_tsquery('simple', $1)
          OR (${EVENT_SEARCH_TEXT}) LIKE $2 ESCAPE '\\'
        )
      ORDER BY rank DESC, COALESCE(published_at, created_at) DESC
      LIMIT $3`,
    [query, likeParam(query), limit],
  );
  return r.rows.map((row) => toEventHit(row as Record<string, unknown>));
}

function groupCounts(groups: SearchGroups): Record<SearchHitType, number> {
  return {
    university: groups.universities.length,
    major: groups.majors.length,
    location: groups.locations.length,
    fact: groups.facts.length,
    event: groups.events.length,
  };
}

async function recordSearchRun(input: {
  query: string;
  resultCount: number;
  responseMs: number;
  counts: Record<SearchHitType, number>;
}): Promise<{
  requestCount: number;
  noResultCount: number;
  analyticsRecorded: boolean;
}> {
  const key = searchQueryKey(input.query);
  const responseMs = Math.max(0, Math.round(input.responseMs));

  // Keep the aggregate parent and append-only sample as separate statements.
  // A single CTE that inserts the child first can violate the foreign key
  // because data-modifying CTEs do not follow ordinary statement ordering.
  const aggregate = await getPool().query(
    `INSERT INTO search_queries (
       query_key, query, request_count, no_result_count,
       last_result_count, last_group_counts, last_response_ms, worst_response_ms
     ) VALUES ($1, $2, 1, CASE WHEN $3 = 0 THEN 1 ELSE 0 END,
               $3, $4::jsonb, $5, $5)
     ON CONFLICT (query_key) DO UPDATE SET
       request_count = search_queries.request_count + 1,
       no_result_count = search_queries.no_result_count +
         CASE WHEN EXCLUDED.last_result_count = 0 THEN 1 ELSE 0 END,
       last_result_count = EXCLUDED.last_result_count,
       last_group_counts = EXCLUDED.last_group_counts,
       last_response_ms = EXCLUDED.last_response_ms,
       worst_response_ms = GREATEST(
         search_queries.worst_response_ms,
         EXCLUDED.last_response_ms
       ),
       last_seen_at = NOW()
     RETURNING request_count, no_result_count`,
    [key, input.query, input.resultCount, JSON.stringify(input.counts), responseMs],
  );
  const aggregateRow = aggregate.rows[0] as
    | { request_count: string | number; no_result_count: string | number }
    | undefined;

  try {
    await getPool().query(
      `INSERT INTO search_query_runs (query_key, result_count, response_ms)
       VALUES ($1, $2, $3)`,
      [key, input.resultCount, responseMs],
    );
  } catch (error) {
    // The aggregate row above still records the miss; a failed timing sample
    // must not suppress real search results.
    console.error("[information/search] timing sample insert failed:", error);
  }

  return {
    requestCount: Number(aggregateRow?.request_count ?? 1),
    noResultCount: Number(
      aggregateRow?.no_result_count ?? (input.resultCount === 0 ? 1 : 0),
    ),
    analyticsRecorded: true,
  };
}


export async function globalSearch(rawQuery: string, groupLimit = 8): Promise<GlobalSearchResult> {
  const query = normalizeSearchQuery(rawQuery);
  if (query.length < 2) throw new Error("INVALID_SEARCH_QUERY");
  const limit = Math.max(1, Math.min(20, Math.floor(groupLimit)));

  const started = performance.now();
  const [universities, locations, facts, events] = await Promise.all([
    queryUniversities(query, limit),
    queryLocations(query, limit),
    queryApprovedFacts(query, limit),
    queryInformationEvents(query, limit),
  ]);
  const majors = searchMajorDefinitions(query, limit);
  const searchDurationMs = performance.now() - started;
  const groups: SearchGroups = { universities, majors, locations, facts, events };
  const resultCount = Object.values(groupCounts(groups)).reduce((sum, count) => sum + count, 0);
  const recorded = await recordSearchRun({
    query,
    resultCount,
    responseMs: searchDurationMs,
    counts: groupCounts(groups),
  });
  const durationMs = performance.now() - started;

  return {
    query,
    groups,
    total: resultCount,
    stats: {
      searchDurationMs: Math.round(searchDurationMs * 10) / 10,
      durationMs: Math.round(durationMs * 10) / 10,
      targetMs: SEARCH_TARGET_MS,
      withinTarget: durationMs < SEARCH_TARGET_MS,
      resultCount,
      noResultCount: recorded.noResultCount,
      missRecorded: recorded.analyticsRecorded && resultCount === 0,
    },
  };
}

export async function listHotNoResultQueries(
  minRequests = 3,
  days = 30,
): Promise<HotNoResultQuery[]> {
  if (!Number.isFinite(minRequests) || minRequests < 1 || minRequests > 1000) {
    throw new Error("INVALID_MIN_REQUESTS");
  }
  if (!Number.isFinite(days) || days < 1 || days > 365) throw new Error("INVALID_DAYS");
  const r = await getPool().query(
    `SELECT query, COUNT(*)::integer AS requests, MAX(created_at) AS last_seen_at
       FROM search_query_runs
      WHERE result_count = 0
        AND created_at >= NOW() - ($1::integer * INTERVAL '1 day')
      GROUP BY query, query_key
     HAVING COUNT(*) >= $2::integer
      ORDER BY requests DESC, last_seen_at DESC
      LIMIT 50`,
    [days, Math.round(minRequests)],
  );
  return r.rows.map((row) => {
    const value = row as { query: string; requests: number; last_seen_at: Date | string };
    return {
      query: value.query,
      requests: Number(value.requests),
      lastSeenAt: dateIso(value.last_seen_at) ?? "",
    };
  });
}
