import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const ledgerPath = "data/research/confirmed-scorecard-main-campus-facts.json";
const sourceIndexPath = "data/preview/source-index.json";
const apply = process.argv.includes("--apply");
async function main() {
const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as { retrievedOn: string; records: Array<Record<string, any>> };
const sourceId = (unitId: string) => `confirmed-scorecard-main-campus-${unitId}`;
const detailPath = (id: string) => {
  const [namespace, slug] = id.split(":");
  return `data/preview/university-details/${namespace}/${slug}.json`;
};

const sourceRows = ledger.records.map((row) => ({
  sourceId: sourceId(row.unitId),
  sourceType: "official_federal_api",
  publisher: "United States Department of Education College Scorecard",
  url: row.sourceUrl,
  referenceYear: 2026,
  retrievedOn: ledger.retrievedOn,
  status: "verified",
  scope: ["main_campus", "undergraduate_enrollment", "acceptance_rate", "graduation_rate", "retention_rate", "tuition"],
}));

const admissionsFor = (row: Record<string, any>) => ({
  acceptanceRate: { nullReason: null, referenceYear: 2026, scope: "main_campus_undergraduate_admissions", sourceIds: [sourceId(row.unitId)], status: "verified", unit: "ratio", value: row.facts.acceptanceRate, warnings: ["official_scorecard_main_campus"] },
  graduationRate: { nullReason: null, referenceYear: 2026, scope: "main_campus_four_year_completion", sourceIds: [sourceId(row.unitId)], status: "verified", unit: "ratio", value: row.facts.graduationRateFourYear, warnings: ["official_scorecard_main_campus"] },
  retentionRate: { nullReason: null, referenceYear: 2026, scope: "main_campus_full_time_four_year_retention", sourceIds: [sourceId(row.unitId)], status: "verified", unit: "ratio", value: row.facts.retentionRateFullTimeFourYear, warnings: ["official_scorecard_main_campus"] },
});

const index = JSON.parse(await readFile(sourceIndexPath, "utf8")) as { sources: Array<Record<string, any>> };
const byId = new Map(index.sources.map((source) => [source.sourceId, source]));
for (const source of sourceRows) byId.set(source.sourceId, source);

for (const row of ledger.records) {
  const path = detailPath(row.universityId);
  const detail = JSON.parse(await readFile(path, "utf8"));
  detail.admissions = { ...detail.admissions, ...admissionsFor(row) };
  detail.qualitySummary = { ...(detail.qualitySummary ?? {}), sourceLimited: false };
  detail.warningSummary = { ...(detail.warningSummary ?? {}), hasWarnings: true };
  if (apply) await writeFile(path, `${JSON.stringify(detail, null, 2)}\n`);
}
if (apply) await writeFile(sourceIndexPath, `${JSON.stringify({ ...index, sources: [...byId.values()] }, null, 2)}\n`);

if (!apply) {
  console.log(JSON.stringify({ apply: false, records: ledger.records.length, sourceIds: sourceRows.map((source) => source.sourceId) }, null, 2));
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  for (const row of ledger.records) {
    const admissions = admissionsFor(row);
    await client.query(`UPDATE university_details SET payload=jsonb_set(payload, '{admissions}', COALESCE(payload->'admissions','{}'::jsonb) || $2::jsonb, true), updated_at=NOW() WHERE university_id=$1`, [row.universityId, JSON.stringify(admissions)]);
    await client.query(`UPDATE universities SET payload=payload || $2::jsonb, updated_at=NOW() WHERE id=$1`, [row.universityId, JSON.stringify({ undergraduateEnrollment: row.facts.undergraduateEnrollment, acceptanceRate: row.facts.acceptanceRate, graduationRate: row.facts.graduationRateFourYear, retentionRate: row.facts.retentionRateFullTimeFourYear })]);
  }
  const existing = await client.query<{ payload: { sources?: Array<Record<string, any>> } }>("SELECT payload FROM source_index WHERE id=1");
  const merged = new Map((existing.rows[0]?.payload?.sources ?? []).map((source) => [source.sourceId, source]));
  for (const source of sourceRows) merged.set(source.sourceId, source);
  await client.query("UPDATE source_index SET payload=jsonb_set(payload,'{sources}',$1::jsonb,true), updated_at=NOW() WHERE id=1", [JSON.stringify([...merged.values()])]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ apply: true, updated: ledger.records.map((row) => row.universityId), sourceIds: sourceRows.map((source) => source.sourceId) }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
