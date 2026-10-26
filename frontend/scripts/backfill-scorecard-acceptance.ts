/**
 * Backfill the detail-card acceptance-rate field from the already imported
 * US Department of Education College Scorecard research record.
 *
 * Only empty admissions.acceptanceRate fields are touched. The source release
 * date is recorded, while referenceYear stays null because Scorecard's
 * release contains variable-specific cohort years that are not uniform.
 * Dry-run by default; pass --apply to update Supabase and reviewed JSON.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

type Detail = Record<string, any>;
type Research = { universityId: string; payload?: Record<string, unknown>; source?: Record<string, unknown> };

const detailsDir = "data/preview/university-details/candidate-v2";
const sourcePath = "data/preview/source-index.json";
const sourceId = "source_usde_college_scorecard_2026_10_15";
const sourceUrl = "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip";
const apply = process.argv.includes("--apply");

function loadResearch(): Research[] {
  const value = require(path.resolve("data/research/school-records.json"));
  return value.records ?? [];
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

async function main() {
  const research = new Map(loadResearch().map((row) => [row.universityId, row]));
  const files = await readdir(detailsDir);
  const updates: Array<{ file: string; universityId: string; value: number }> = [];
  for (const file of files.filter((item) => item.endsWith(".json")).sort()) {
    const fullPath = path.join(detailsDir, file);
    const detail = JSON.parse(await readFile(fullPath, "utf8")) as Detail;
    const current = detail.admissions?.acceptanceRate;
    if (current && Object.keys(current).length > 0) continue;
    const scorecard = research.get(detail.id);
    const value = finite(scorecard?.payload?.ADM_RATE);
    if (value === null) continue;
    updates.push({ file, universityId: detail.id, value });
    if (apply) {
      detail.admissions = {
        ...detail.admissions,
        acceptanceRate: {
          nullReason: null,
          referenceYear: null,
          scope: "institution_undergraduate_admissions",
          sourceIds: [sourceId],
          status: "verified",
          unit: "ratio",
          value,
          warnings: ["scorecard_release_cohort_year_is_not_uniform"]
        }
      };
      await writeFile(fullPath, `${JSON.stringify(detail, null, 2)}\n`);
    }
  }

  const sourceIndex = JSON.parse(await readFile(sourcePath, "utf8"));
  const existing = sourceIndex.sources.find((entry: any) => entry.sourceId === sourceId);
  if (!existing) {
    sourceIndex.sources.push({
      publisher: "United States Department of Education",
      referenceYear: null,
      scope: ["undergraduate_acceptance_rate"],
      sourceId,
      sourceType: "official_federal_dataset",
      status: "verified",
      url: sourceUrl,
      checkedOn: "2026-10-17"
    });
    if (apply) await writeFile(sourcePath, `${JSON.stringify(sourceIndex, null, 2)}\n`);
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", sourceId, updates, updated: updates.length }, null, 2));
  if (!apply || !updates.length) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000, query_timeout: 30000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const item of updates) {
      await client.query(`UPDATE university_details SET payload=jsonb_set(payload, '{admissions,acceptanceRate}', $2::jsonb, true), updated_at=NOW() WHERE university_id=$1`, [item.universityId, JSON.stringify({ nullReason: null, referenceYear: null, scope: "institution_undergraduate_admissions", sourceIds: [sourceId], status: "verified", unit: "ratio", value: item.value, warnings: ["scorecard_release_cohort_year_is_not_uniform"] })]);
    }
    const stored = await client.query("SELECT payload FROM source_index WHERE id=1 FOR UPDATE");
    if (stored.rowCount !== 1) throw new Error("Missing database source index");
    const sources = Array.isArray(stored.rows[0].payload.sources) ? stored.rows[0].payload.sources : [];
    if (!sources.some((entry: any) => entry.sourceId === sourceId)) sources.push(sourceIndex.sources.find((entry: any) => entry.sourceId === sourceId));
    await client.query("UPDATE source_index SET payload=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify({ ...stored.rows[0].payload, sources })]);
    await client.query("COMMIT");
    const verify = await client.query("SELECT COUNT(*)::int AS count FROM university_details WHERE payload->'admissions'->'acceptanceRate'->'sourceIds' ? $1 AND payload->'admissions'->'acceptanceRate'->>'status'='verified'", [sourceId]);
    console.log(JSON.stringify({ committed: true, postCommitVerified: verify.rows[0].count }));
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
