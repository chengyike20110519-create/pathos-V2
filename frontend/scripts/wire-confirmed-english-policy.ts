import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

type Row = Record<string, any>;
const detailsDir = "data/preview/university-details/candidate-v2";
const sourceIndexPath = "data/preview/source-index.json";
const policyPath = "data/research/confirmed-english-policy-facts.json";
const apply = process.argv.includes("--apply");
const forceDb = process.argv.includes("--force-db");
const sourceId = (url: string) => `confirmed-english-source-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;

async function main(): Promise<void> {
  const doc = JSON.parse(await readFile(policyPath, "utf8")) as { records?: Row[] };
  const records = new Map((doc.records ?? []).filter((row) => row.status === "confirmed" && /^https?:\/\//.test(row.source)).map((row) => [row.universityId, row]));
  const updates: Row[] = [];
  for (const file of (await readdir(detailsDir)).filter((name) => name.endsWith(".json")).sort()) {
    const full = path.join(detailsDir, file);
    const detail = JSON.parse(await readFile(full, "utf8")) as Row;
    const row = records.get(detail.id);
    if (!row) continue;
    const id = sourceId(row.source);
    if (!forceDb && detail.admissions?.englishPolicy?.status === "verified" && detail.admissions.englishPolicy.sourceIds?.includes(id)) continue;
    updates.push({ file, universityId: detail.id, sourceId: id });
    if (apply) {
      detail.admissions = { ...detail.admissions, englishPolicy: { nullReason: null, referenceYear: 2026, scope: "international_first_year_undergraduate", sourceIds: [id], status: "verified", unit: "policy", value: row.fact, warnings: ["confirmed_fact_ledger", "source_fetch_not_repeated"] } };
      const codes = Array.isArray(detail.warningSummary?.codes) ? detail.warningSummary.codes.filter((code: unknown) => code !== "english_policy_pending_external_access") : [];
      detail.warningSummary = { ...detail.warningSummary, codes, count: codes.length, hasWarnings: codes.length > 0 };
      if (detail.qualitySummary && Array.isArray(detail.qualitySummary.warningCodes)) detail.qualitySummary = { ...detail.qualitySummary, warningCodes: detail.qualitySummary.warningCodes.filter((code: unknown) => code !== "english_policy_pending_external_access") };
      await writeFile(full, `${JSON.stringify(detail, null, 2)}\n`);
    }
  }
  const index = JSON.parse(await readFile(sourceIndexPath, "utf8")) as Row;
  const rawSources = Array.isArray(index.sources) ? index.sources : [];
  const seen = new Set<string>();
  const sources = rawSources.filter((row: Row) => typeof row?.sourceId === "string" && !seen.has(row.sourceId) && (seen.add(row.sourceId), true));
  let addedSources = 0;
  for (const row of records.values()) {
    const id = sourceId(row.source);
    if (seen.has(id)) continue;
    seen.add(id); addedSources++;
    sources.push({ publisher: `Official university admissions — ${new URL(row.source).hostname}`, referenceYear: 2026, scope: ["english_language_policy"], sourceId: id, sourceType: "official_html", status: "verified", url: row.source, checkedOn: "2026-10-26", notes: "Imported from the confirmed English-policy ledger; source was not re-fetched during this wiring pass." });
  }
  if (apply) { index.sources = sources; await writeFile(sourceIndexPath, `${JSON.stringify(index, null, 2)}\n`); }
  if (!apply) { console.log(JSON.stringify({ mode: "dry-run", updates: updates.length, addedSources }, null, 2)); return; }
  const connectionString = process.env.DATABASE_URL; if (!connectionString) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } }); await client.connect();
  try {
    await client.query("BEGIN");
    for (const item of updates) {
      const row = records.get(item.universityId)!;
      await client.query(`UPDATE university_details SET payload=jsonb_set(jsonb_set(jsonb_set(payload, '{admissions,englishPolicy}', $2::jsonb, true), '{qualitySummary,warningCodes}', COALESCE((SELECT jsonb_agg(code) FROM jsonb_array_elements(COALESCE(payload->'qualitySummary'->'warningCodes','[]'::jsonb)) AS code WHERE code #>> '{}' <> 'english_policy_pending_external_access'),'[]'::jsonb), true), '{warningSummary,codes}', COALESCE((SELECT jsonb_agg(code) FROM jsonb_array_elements(COALESCE(payload->'warningSummary'->'codes','[]'::jsonb)) AS code WHERE code #>> '{}' <> 'english_policy_pending_external_access'),'[]'::jsonb), true), updated_at=NOW() WHERE university_id=$1`, [item.universityId, JSON.stringify({ nullReason: null, referenceYear: 2026, scope: "international_first_year_undergraduate", sourceIds: [item.sourceId], status: "verified", unit: "policy", value: row.fact, warnings: ["confirmed_fact_ledger", "source_fetch_not_repeated"] })]);
    }
    await client.query(`UPDATE universities SET payload=jsonb_set(payload,'{qualitySummary,warningCodes}',COALESCE((SELECT jsonb_agg(code) FROM jsonb_array_elements(COALESCE(payload->'qualitySummary'->'warningCodes','[]'::jsonb)) AS code WHERE code #>> '{}' <> 'english_policy_pending_external_access'),'[]'::jsonb),true), updated_at=NOW() WHERE id LIKE 'candidate-v2:%'`);
    const stored = await client.query<{ payload: Row }>("SELECT payload FROM source_index WHERE id=1 FOR UPDATE");
    const dbSources = Array.isArray(stored.rows[0]?.payload?.sources) ? stored.rows[0].payload.sources : [];
    const dbSeen = new Set<string>(); const merged = [...dbSources, ...sources].filter((row: Row) => typeof row?.sourceId === "string" && !dbSeen.has(row.sourceId) && (dbSeen.add(row.sourceId), true));
    await client.query("UPDATE source_index SET payload=jsonb_set(payload,'{sources}',$1::jsonb,true),updated_at=NOW() WHERE id=1", [JSON.stringify(merged)]);
    await client.query("COMMIT");
    const verify = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM university_details WHERE payload->'admissions'->'englishPolicy'->>'status'='verified'");
    console.log(JSON.stringify({ mode: "apply", updates: updates.length, addedSources, verifiedInDb: verify.rows[0].count }, null, 2));
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { await client.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
