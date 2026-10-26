import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

type RecordLike = Record<string, any>;
const detailsDir = "data/preview/university-details/candidate-v2";
const sourceIndexPath = "data/preview/source-index.json";
const summariesPath = "data/preview/universities.json";
const policyPath = "data/research/confirmed-policy-facts.json";
const apply = process.argv.includes("--apply");

function sourceId(url: string): string {
  return `confirmed-policy-source-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
}

function readPolicyRecords(): RecordLike[] {
  const doc = require(path.resolve(policyPath)) as RecordLike;
  return Array.isArray(doc.records) ? doc.records : [];
}

async function main(): Promise<void> {
  const records = new Map(readPolicyRecords().filter((row) => row.status === "confirmed" && /^https?:\/\//.test(row.source)).map((row) => [row.universityId, row]));
  const files = (await readdir(detailsDir)).filter((file) => file.endsWith(".json")).sort();
  const updates: Array<{ file: string; universityId: string; sourceId: string }> = [];
  for (const file of files) {
    const fullPath = path.join(detailsDir, file);
    const detail = JSON.parse(await readFile(fullPath, "utf8")) as RecordLike;
    const policy = records.get(detail.id);
    if (!policy) continue;
    const current = detail.admissions?.testPolicy;
    const currentCodes = Array.isArray(detail.warningSummary?.codes) ? detail.warningSummary.codes : [];
    const qualityCodes = Array.isArray(detail.qualitySummary?.warningCodes) ? detail.qualitySummary.warningCodes : [];
    const needsPolicy = !(current?.status === "verified" && current?.sourceIds?.length);
    const needsWarningCleanup = currentCodes.includes("test_policy_pending_external_access") || qualityCodes.includes("test_policy_pending_external_access");
    if (!needsPolicy && !needsWarningCleanup) continue;
    const id = sourceId(policy.source);
    updates.push({ file, universityId: detail.id, sourceId: id });
    if (apply) {
      detail.admissions = {
        ...detail.admissions,
        testPolicy: {
          nullReason: null,
          referenceYear: 2026,
          scope: "first_year_undergraduate",
          sourceIds: [id],
          status: "verified",
          unit: "policy",
          value: policy.fact,
          warnings: ["confirmed_fact_ledger", "source_fetch_not_repeated"]
        }
      };
      if (needsWarningCleanup) {
        const codes = currentCodes.filter((code: unknown) => code !== "test_policy_pending_external_access");
        detail.warningSummary = { ...detail.warningSummary, codes, count: codes.length, hasWarnings: codes.length > 0 };
        if (detail.qualitySummary && Array.isArray(detail.qualitySummary.warningCodes)) {
          detail.qualitySummary = {
            ...detail.qualitySummary,
            warningCodes: detail.qualitySummary.warningCodes.filter((code: unknown) => code !== "test_policy_pending_external_access")
          };
        }
      }
      await writeFile(fullPath, `${JSON.stringify(detail, null, 2)}\n`);
    }
  }

  const index = JSON.parse(await readFile(sourceIndexPath, "utf8")) as RecordLike;
  const rawSources = Array.isArray(index.sources) ? index.sources : [];
  const existing = new Set<string>();
  const sources = rawSources.filter((row) => {
    const id = row?.sourceId;
    if (typeof id !== "string" || existing.has(id)) return false;
    existing.add(id);
    return true;
  });
  let addedSources = 0;
  for (const policy of records.values()) {
    const id = sourceId(policy.source);
    if (existing.has(id)) continue;
    sources.push({
      publisher: `Official university admissions — ${new URL(policy.source).hostname}`,
      referenceYear: 2026,
      scope: ["admissions_testing_policy"],
      sourceId: id,
      sourceType: "official_html",
      status: "verified",
      url: policy.source,
      checkedOn: "2026-10-17",
      notes: "Imported from the confirmed policy ledger; source was not re-fetched during this wiring pass."
    });
    existing.add(id);
    addedSources++;
  }
  if (apply) {
    index.sources = sources;
    await writeFile(sourceIndexPath, `${JSON.stringify(index, null, 2)}\n`);
    const summariesDoc = JSON.parse(await readFile(summariesPath, "utf8")) as any;
    const summaries = Array.isArray(summariesDoc) ? summariesDoc : summariesDoc.records ?? summariesDoc.universities ?? [];
    for (const summary of summaries) {
      if (!records.has(summary.id)) continue;
      const codes = Array.isArray(summary.qualitySummary?.warningCodes)
        ? summary.qualitySummary.warningCodes.filter((code: unknown) => code !== "test_policy_pending_external_access")
        : [];
      summary.qualitySummary = { ...summary.qualitySummary, warningCodes: codes };
    }
    await writeFile(summariesPath, `${JSON.stringify(summariesDoc, null, 2)}\n`);
  }

  if (apply) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await client.query("BEGIN");
      for (const item of updates) {
        const policy = records.get(item.universityId)!;
        await client.query(
          `UPDATE university_details
              SET payload = jsonb_set(
                jsonb_set(
                  jsonb_set(payload, '{admissions,testPolicy}', $2::jsonb, true),
                  '{qualitySummary,warningCodes}',
                  COALESCE((SELECT jsonb_agg(code)
                              FROM jsonb_array_elements(COALESCE(payload->'qualitySummary'->'warningCodes', '[]'::jsonb)) AS code
                             WHERE code #>> '{}' <> 'test_policy_pending_external_access'), '[]'::jsonb),
                  true
                ),
                '{warningSummary}',
                jsonb_set(
                  COALESCE(payload->'warningSummary', '{}'::jsonb),
                  '{codes}',
                  COALESCE((SELECT jsonb_agg(code)
                              FROM jsonb_array_elements(COALESCE(payload->'warningSummary'->'codes', '[]'::jsonb)) AS code
                             WHERE code #>> '{}' <> 'test_policy_pending_external_access'), '[]'::jsonb),
                  true
                ),
                true
              ), updated_at=NOW()
            WHERE university_id=$1`,
          [item.universityId, JSON.stringify({ nullReason: null, referenceYear: 2026, scope: "first_year_undergraduate", sourceIds: [item.sourceId], status: "verified", unit: "policy", value: policy.fact, warnings: ["confirmed_fact_ledger", "source_fetch_not_repeated"] })],
        );
      }
      await client.query(`
        UPDATE universities
           SET payload = jsonb_set(
             payload,
             '{qualitySummary,warningCodes}',
             COALESCE((SELECT jsonb_agg(code)
                         FROM jsonb_array_elements(COALESCE(payload->'qualitySummary'->'warningCodes', '[]'::jsonb)) AS code
                        WHERE code #>> '{}' <> 'test_policy_pending_external_access'), '[]'::jsonb),
             true
           ), updated_at=NOW()
         WHERE payload->>'id' LIKE 'candidate-v2:%'
      `);
      const row = await client.query<{ payload: RecordLike }>("SELECT payload FROM source_index WHERE id=1 FOR UPDATE");
      if (row.rowCount !== 1) throw new Error("Missing source_index row");
      const rawDbSources = Array.isArray(row.rows[0].payload.sources) ? row.rows[0].payload.sources : [];
      const dbIds = new Set<string>();
      const dbSources = rawDbSources.filter((source: RecordLike) => {
        const id = source?.sourceId;
        if (typeof id !== "string" || dbIds.has(id)) return false;
        dbIds.add(id);
        return true;
      });
      const missing = sources.filter((source: RecordLike) => !dbIds.has(source.sourceId));
      await client.query("UPDATE source_index SET payload=jsonb_set(payload, '{sources}', $1::jsonb, true), updated_at=NOW() WHERE id=1", [JSON.stringify([...dbSources, ...missing])]);
      await client.query("COMMIT");
      const verify = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM university_details WHERE payload->'admissions'->'testPolicy'->>'status'='verified' AND jsonb_array_length(payload->'admissions'->'testPolicy'->'sourceIds')>0`);
      console.log(JSON.stringify({ mode: "apply", updates: updates.length, addedSources, verifiedInDb: verify.rows[0].count }, null, 2));
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { await client.end(); }
  } else {
    console.log(JSON.stringify({ mode: "dry-run", updates: updates.length, addedSources }, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
