/**
 * ETL: Stage 5 Preview Bundle JSON -> Supabase Postgres.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... tsx scripts/import-to-supabase.ts
 *
 * Run after `npm run db:reset` (or after manually applying schema.sql in
 * the Supabase SQL Editor). Safe to re-run; uses UPSERT semantics.
 *
 * Windows note: 62 detail files use ":" in their filenames (e.g.
 * "candidate-v2:harvard-university.json"), which NTFS rejects. We
 * detect missing files and fall back to `git show HEAD:<path>` so the
 * script works locally on Windows. On Render / Linux the filesystem
 * path is used directly.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const BUNDLE_DIR = process.env.PATHOS_PREVIEW_BUNDLE_DIR ?? "./data/preview";
const REPO_ROOT = process.env.PATHOS_REPO_ROOT ?? path.resolve(BUNDLE_DIR, "../..");
let activeClient: Client | null = null;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

interface UniversitySummary {
  id: string;
  name: string;
  chineseName?: string;
  city?: string;
  state?: string;
  region?: string;
  schoolType?: string;
  rankingBand?: string;
  rankingTier?: string;
  nationalRanking?: number | null;
  latitude?: number;
  longitude?: number;
  displayTier?: string;
  sourceStatus?: string;
  sourceCommit?: string;
  datasetVersion?: string;
  previewOnly?: boolean;
  aliases?: string[];
  topPrograms?: string[];
}

interface UniversityDetail {
  id?: string;
  allMajors?: Array<{ name?: string; displayName?: string }>;
  [k: string]: unknown;
}

interface ResearchRecord {
  universityId: string;
  payload?: Record<string, unknown>;
}

interface RegionMetric {
  fipsCode: string;
  granularity: string;
  metricId: string;
  name?: string;
  nameEn?: string;
  value?: number | null;
  rawValue?: number | null;
  displayValue?: string;
  year?: number | null;
  source?: string;
}

async function readBundleFile(relPath: string): Promise<string> {
  const absPath = path.join(BUNDLE_DIR, relPath);
  if (existsSync(absPath)) {
    return readFile(absPath, "utf8");
  }
  if (process.platform === "win32") {
    const repoRel = path.relative(REPO_ROOT, absPath).replace(/\\/g, "/");
    try {
      const out = execFileSync("git", ["show", `HEAD:${repoRel}`], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 16 * 1024 * 1024,
      });
      return out;
    } catch (e) {
      throw new Error(`File not on disk and git fallback failed: ${repoRel}`);
    }
  }
  throw new Error(`File missing: ${absPath}`);
}

async function readJson<T>(relPath: string): Promise<T> {
  const text = await readBundleFile(relPath);
  return JSON.parse(text) as T;
}

function buildSearchText(summary: UniversitySummary, detail: UniversityDetail | null): string {
  const parts: (string | undefined)[] = [
    summary.name,
    summary.chineseName,
    summary.city,
    summary.state,
    summary.region,
    ...(summary.aliases ?? []),
    ...(summary.topPrograms ?? []),
  ];
  if (detail) {
    for (const m of detail.allMajors ?? []) {
      if (m.name) parts.push(m.name);
      if (m.displayName && m.displayName !== m.name) parts.push(m.displayName);
    }
  }
  return parts.filter(Boolean).join(" ");
}

function finiteResearchNumber(payload: Record<string, unknown> | undefined, key: string): number | null {
  const value = Number(payload?.[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function enrichSummaryFromResearch(summary: UniversitySummary, research: ResearchRecord | undefined): UniversitySummary {
  if (!research?.payload) return summary;
  const out = { ...summary } as UniversitySummary & Record<string, unknown>;
  const fields: Array<[string, string]> = [
    ["undergraduateEnrollment", "UGDS"],
    ["studentFacultyRatio", "STUFACR"],
    ["graduationRate", "C150_4"],
    ["retentionRate", "RET_FT4"],
  ];
  for (const [target, source] of fields) {
    const value = finiteResearchNumber(research.payload, source);
    if (value !== null && (out[target] === undefined || out[target] === null)) out[target] = value;
  }
  return out;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  activeClient = client;
  await client.connect();
  console.log("connected");

  await client.query("BEGIN");

  // 1. manifest (single row)
  const manifest = await readJson<Record<string, unknown>>("manifest.json");
  await client.query(
    `INSERT INTO manifest (id, payload) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [JSON.stringify(manifest)],
  );
  console.log("manifest");

  const researchBundle = await readJson<{ records?: ResearchRecord[] }>("../research/school-records.json");
  const researchById = new Map((researchBundle.records ?? []).map((record) => [record.universityId, record]));

  // 2. universities + university_details
  const universities = await readJson<UniversitySummary[]>("universities.json");
  let uniCount = 0;
  let detailCount = 0;
  for (const u of universities) {
    const enrichedSummary = enrichSummaryFromResearch(u, researchById.get(u.id));
    let detail: UniversityDetail | null = null;
    try {
      // The bundle may store candidate-v2 IDs either as a legacy filename
      // (`candidate-v2:school.json`) or as a portable nested path
      // (`candidate-v2/school.json`). Support both layouts so the same
      // importer works on macOS, Linux and Windows exports.
      try {
        detail = await readJson<UniversityDetail>(`university-details/${u.id}.json`);
      } catch {
        detail = await readJson<UniversityDetail>(
          `university-details/${u.id.replace(/^candidate-v2:/, "candidate-v2/")}.json`,
        );
      }
    } catch (e) {
      console.warn(`  skip detail for ${u.id}: ${(e as Error).message}`);
    }
    const searchText = buildSearchText(enrichedSummary, detail);
    await client.query(
      `INSERT INTO universities
        (id, name, chinese_name, city, state, region, school_type,
         ranking_band, ranking_tier, national_ranking, latitude, longitude,
         display_tier, source_status, source_commit, dataset_version,
         preview_only, payload, search_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,to_tsvector('simple', $19))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, chinese_name = EXCLUDED.chinese_name,
         city = EXCLUDED.city, state = EXCLUDED.state, region = EXCLUDED.region,
         school_type = EXCLUDED.school_type, ranking_band = EXCLUDED.ranking_band,
         ranking_tier = EXCLUDED.ranking_tier, national_ranking = EXCLUDED.national_ranking,
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
         display_tier = EXCLUDED.display_tier, source_status = EXCLUDED.source_status,
         source_commit = EXCLUDED.source_commit, dataset_version = EXCLUDED.dataset_version,
         preview_only = EXCLUDED.preview_only, payload = EXCLUDED.payload,
         search_text = EXCLUDED.search_text, updated_at = NOW()`,
      [
        enrichedSummary.id, enrichedSummary.name, enrichedSummary.chineseName ?? null, enrichedSummary.city ?? null, enrichedSummary.state ?? null,
        enrichedSummary.region ?? null, enrichedSummary.schoolType ?? null, enrichedSummary.rankingBand ?? null,
        enrichedSummary.rankingTier ?? null, enrichedSummary.nationalRanking ?? null, enrichedSummary.latitude ?? null,
        enrichedSummary.longitude ?? null, enrichedSummary.displayTier ?? null, enrichedSummary.sourceStatus ?? null,
        enrichedSummary.sourceCommit ?? null, enrichedSummary.datasetVersion ?? null, enrichedSummary.previewOnly ?? true,
        JSON.stringify(enrichedSummary), searchText,
      ],
    );
    uniCount++;
    if (detail) {
      await client.query(
        `INSERT INTO university_details (university_id, payload) VALUES ($1, $2)
         ON CONFLICT (university_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [u.id, JSON.stringify(detail)],
      );
      detailCount++;
    }
  }
  console.log(`universities: ${uniCount}, details: ${detailCount}`);

  // 2b. Official school research payloads (College Scorecard / US ED).
  // This is intentionally separate from the preview payload so source years and
  // the raw response remain auditable and can be refreshed without losing UI data.
  try {
    const research = await readJson<{
      records?: Array<{
        universityId: string;
        unitId: string | number;
        officialName?: string;
        operating?: boolean | number;
        payload: unknown;
        source: unknown;
      }>;
    }>("../research/school-records.json");
    let researchCount = 0;
    for (const record of research.records ?? []) {
      await client.query(
        `INSERT INTO school_research_records
          (university_id, unit_id, official_name, operating, payload, source, retrieved_on)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,COALESCE(($6::jsonb->>'retrievedOn')::date, CURRENT_DATE))
         ON CONFLICT (university_id) DO UPDATE SET
           unit_id = EXCLUDED.unit_id, official_name = EXCLUDED.official_name,
           operating = EXCLUDED.operating, payload = EXCLUDED.payload,
           source = EXCLUDED.source, retrieved_on = EXCLUDED.retrieved_on,
           updated_at = NOW()`,
        [
          record.universityId,
          String(record.unitId),
          record.officialName ?? null,
          record.operating === true || record.operating === 1,
          JSON.stringify(record.payload),
          JSON.stringify(record.source),
        ],
      );
      researchCount++;
    }
    console.log(`school_research_records: ${researchCount}`);
  } catch (error) {
    console.warn(`school research bundle skipped: ${(error as Error).message}`);
  }

  // 2c. Confirmed official policy facts.
  try {
    const confirmed = await readJson<{
      generatedOn: string;
      records?: Array<{
        universityId: string;
        fact: string;
        status?: string;
        source: string;
      }>;
    }>("../research/confirmed-policy-facts.json");
    let confirmedCount = 0;
    for (const record of confirmed.records ?? []) {
      await client.query(
        `INSERT INTO school_confirmed_facts
          (university_id, fact_type, fact, status, source_url, confirmed_on)
         VALUES ($1, 'admissions_testing_policy', $2, $3, $4, $5::date)
         ON CONFLICT (university_id, fact_type) DO UPDATE SET
           fact = EXCLUDED.fact, status = EXCLUDED.status,
           source_url = EXCLUDED.source_url, confirmed_on = EXCLUDED.confirmed_on,
           updated_at = NOW()`,
        [
          record.universityId,
          record.fact,
          record.status ?? "confirmed",
          record.source,
          confirmed.generatedOn,
        ],
      );
      confirmedCount++;
    }
    console.log(`school_confirmed_facts: ${confirmedCount}`);
  } catch (error) {
    console.warn(`confirmed policy bundle skipped: ${(error as Error).message}`);
  }

  // 3. region_envelope (single row, full envelope JSONB)
  const rmEnvelope = await readJson<Record<string, unknown>>("region-metrics.json");
  await client.query(
    `INSERT INTO region_envelope (id, payload) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [JSON.stringify(rmEnvelope)],
  );
  const recordCount = Array.isArray(rmEnvelope.records) ? (rmEnvelope.records as unknown[]).length : 0;
  console.log(`region_envelope: 1 row, ${recordCount} records in payload`);

  // 4. status_dictionary
  const sdRaw = await readJson<Record<string, unknown>>("status-dictionary.json");
  for (const [code, payload] of Object.entries(sdRaw)) {
    await client.query(
      `INSERT INTO status_dictionary (code, payload) VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [code, JSON.stringify(payload)],
    );
  }
  console.log(`status_dictionary: ${Object.keys(sdRaw).length}`);

  // 5. source_index (single row)
  const siRaw = await readJson<{ sources?: unknown[] } & Record<string, unknown>>("source-index.json");
  await client.query(
    `INSERT INTO source_index (id, payload) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [JSON.stringify(siRaw)],
  );
  console.log(`source_index: ${(siRaw.sources ?? []).length} sources`);

  // Import gate: the bundle manifest is the contract for this transaction.
  // Never commit a partial expansion (for example 95 universities with a
  // stale 94-school manifest), because that makes the preview API internally
  // inconsistent and difficult to recover from. All checks happen before
  // COMMIT, so a mismatch rolls back every upsert above.
  const expectedSchools = Number(manifest.schoolCount);
  const expectedSummaries = Number(manifest.summaryCount);
  const expectedDetails = Number(manifest.detailCount);
  const expectedUniversities = Number((manifest.counts as { universities?: unknown } | undefined)?.universities);
  const actualSchools = Number((await client.query("SELECT COUNT(*)::int AS n FROM universities")).rows[0]?.n ?? 0);
  const actualDetails = Number((await client.query("SELECT COUNT(*)::int AS n FROM university_details")).rows[0]?.n ?? 0);
  const checks = [
    ["manifest.schoolCount", expectedSchools, actualSchools],
    ["manifest.summaryCount", expectedSummaries, actualSchools],
    ["manifest.detailCount", expectedDetails, actualDetails],
    ["manifest.counts.universities", expectedUniversities, actualSchools],
  ] as const;
  const mismatch = checks.find(([, expected, actual]) => !Number.isInteger(expected) || expected !== actual);
  if (mismatch) {
    throw new Error(`import consistency gate failed: ${mismatch[0]} expected ${mismatch[1]}, database has ${mismatch[2]}; transaction rolled back`);
  }
  console.log(`consistency gate: ${actualSchools} universities, ${actualDetails} details`);

  await client.query("COMMIT");
  activeClient = null;
  await client.end();
  console.log("done");
}

main().catch((e) => {
  if (activeClient) {
    void activeClient.query("ROLLBACK").catch(() => undefined).finally(() => activeClient?.end().catch(() => undefined));
  }
  console.error(e);
  process.exit(1);
});
