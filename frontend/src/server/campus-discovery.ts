// Backend-only editorial join. Neither the reviewed JSON nor the full
// school/program dataset is imported by client components. No DB writes.
import { createHash } from "node:crypto";
import reviewed from "../../data/reviewed/university-overviews.json";
import { unstable_cache } from "next/cache";
import { getPool } from "@/server/db";
import type { CampusDiscoveryCard, CampusDiscoveryPage, CampusDiscoverySource } from "@/domain/campus-discovery";
import { parseCampusDiscoveryPage } from "@/schemas/campus-discovery.schema";
import { CAMPUS_EDITION_SIZE, campusEditionDay } from "@/lib/campus-discovery-edition";
import { canonicalChineseName } from "@/server/university-name-catalog";

export interface DiscoveryQuery { offset: number; limit: number; seed: string }

export function parseDiscoveryQuery(params: URLSearchParams): DiscoveryQuery {
  const offset = Number(params.get("offset") ?? 0);
  const limit = Number(params.get("limit") ?? 12);
  const seed = params.get("seed") ?? "first-look";
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 12 || !/^[a-zA-Z0-9_-]{1,48}$/.test(seed)) {
    throw Object.assign(new Error("Invalid campus discovery pagination"), { code: "INVALID_DISCOVERY_QUERY", status: 400, retryable: false });
  }
  return { offset, limit, seed };
}

function orderKey(id: string, seed: string): number {
  let hash = 2166136261;
  for (const char of `${seed}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function pageDiscoveryCards(cards: CampusDiscoveryCard[], query: DiscoveryQuery): CampusDiscoveryPage {
  // Daily editions advance through a stable non-ranking pool, rather than
  // randomly repeating yesterday's schools. Legacy pagination stays supported.
  const day = campusEditionDay(query.seed);
  const orderSeed = day === null ? query.seed : "campus-editions-v1";
  const sorted = [...cards].sort((a, b) => orderKey(a.summary.id, orderSeed) - orderKey(b.summary.id, orderSeed) || a.summary.id.localeCompare(b.summary.id));
  const start = day === null || !sorted.length ? 0 : ((day * CAMPUS_EDITION_SIZE) % sorted.length + sorted.length) % sorted.length;
  const ordered = [...sorted.slice(start), ...sorted.slice(0, start)];
  const page = ordered.slice(query.offset, query.offset + query.limit);
  const end = query.offset + page.length;
  return parseCampusDiscoveryPage({ cards: page, total: ordered.length, offset: query.offset, nextOffset: end < ordered.length ? end : null, seed: query.seed });
}

async function loadCampusDiscoveryCards(): Promise<CampusDiscoveryCard[]> {
  const result = await getPool().query(`
    SELECT u.id, u.name, u.chinese_name, u.city, u.state,
           u.latitude, u.longitude, u.display_tier, u.preview_only, u.dataset_version, u.ranking_tier,
           u.payload->'rankingSummary' AS ranking_summary,
           c.overview_zh, c.overview_status, c.source_refs,
           c.motto, c.motto_zh, c.motto_status, c.motto_source_url,
           photo.id AS photo_id, photo.url AS photo_url, photo.thumbnail_url,
           photo.label AS photo_label, photo.source_url AS photo_source_url, photo.publisher
    FROM universities u
    LEFT JOIN university_content c ON c.university_id = u.id
    LEFT JOIN LATERAL (
      SELECT id, url, thumbnail_url, label, source_url, publisher
      FROM university_media
      WHERE university_id = u.id AND media_type = 'campus_photo'
        AND review_status = 'approved' AND license_status = 'verified'
      ORDER BY display_order, id LIMIT 1
    ) photo ON TRUE
    ORDER BY u.id LIMIT 500
  `);
  const fallbackOverviews = new Map(reviewed.schools.filter((item) => item.reviewStatus === "reviewed").map((item) => [item.universityId, item]));
  return result.rows.map((row) => {
    const fallback = fallbackOverviews.get(row.id);
    const nameZh = canonicalChineseName(
      row.id,
      row.name,
      row.chinese_name,
    ) || "中文名称待补充";
    let photoUrl = row.thumbnail_url || row.photo_url;
    if (photoUrl) {
      const url = new URL(photoUrl);
      if (url.hostname === "commons.wikimedia.org" && url.pathname.includes("Special:FilePath/")) url.searchParams.set("width", "640");
      photoUrl = url.href;
    }
    return {
      summary: {
        id: row.id, name: row.name, nameZh, chineseName: nameZh,
        city: row.city ?? undefined, state: row.state ?? undefined,
        latitude: row.latitude, longitude: row.longitude, rankingSummary: row.ranking_summary ?? undefined,
        rankingTier: ["top20", "top50", "top100", "other"].includes(row.ranking_tier) ? row.ranking_tier : "other",
        displayTier: row.display_tier, previewOnly: row.preview_only, datasetVersion: row.dataset_version,
        nullableFields: [],
      },
      photo: row.photo_id ? { id: row.photo_id, url: photoUrl, label: row.photo_label, sourceUrl: row.photo_source_url, publisher: row.publisher } : null,
      overview: row.overview_zh && row.overview_status === "reviewed" ? {
        text: row.overview_zh, checkedOn: new Date().toISOString().slice(0, 10), storage: "supabase" as const,
        hasIndexedSources: Array.isArray(row.source_refs) && row.source_refs.some((source: { accessMethod?: string }) => source.accessMethod === "official_search_index"),
        indexOnly: Array.isArray(row.source_refs) && row.source_refs.length > 0 && row.source_refs.every((source: { accessMethod?: string }) => source.accessMethod === "official_search_index"),
        sources: (Array.isArray(row.source_refs) ? row.source_refs : []).map((source: { url: string; title: string; accessMethod: CampusDiscoverySource["accessMethod"] }) => ({ url: source.url, title: source.title, accessMethod: source.accessMethod })),
      } : fallback ? {
        text: fallback.overviewZh, checkedOn: reviewed.checkedOn, storage: "reviewed_file" as const,
        hasIndexedSources: fallback.sources.some((source) => source.accessMethod === "official_search_index"),
        indexOnly: fallback.sources.every((source) => source.accessMethod === "official_search_index"),
        sources: fallback.sources.map(({ url, title, accessMethod }) => ({ url, title, accessMethod })) as CampusDiscoverySource[],
      } : null,
      motto: row.motto && ["confirmed", "candidate"].includes(row.motto_status) ? {
        text: row.motto, textZh: row.motto_zh, status: row.motto_status, sourceUrl: row.motto_source_url,
      } : null,
    };
  });
}

// Next's data cache survives module reloads, unlike the connection pool or
// an in-process Map. A reviewed-content hash invalidates editorial changes
// immediately, and DB media/identity records refresh every five minutes.
const editorialVersion = createHash("sha256").update(JSON.stringify(reviewed)).digest("hex").slice(0, 16);
const cachedCards = unstable_cache(loadCampusDiscoveryCards, ["campus-discovery-v1", editorialVersion], { revalidate: 300 });
export function readCampusDiscoveryCards(): Promise<CampusDiscoveryCard[]> {
  return process.env.NODE_ENV === "test" ? loadCampusDiscoveryCards() : cachedCards();
}
