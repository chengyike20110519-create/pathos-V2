import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

type Candidate = {
  universityId: string;
  universityName: string;
  sourceUrl: string;
  publisher: string;
  sourceType: string;
  scope: string[];
  checkedOn: string;
  observedProgramNames?: string[];
  observedProgramCategories?: string[];
};
const idFor = (prefix: string, url: string) => `${prefix}-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;

async function main() {
  const bundle = JSON.parse(await readFile("data/reviewed/guide-source-candidates.json", "utf8")) as { records: Candidate[] };
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;
    for (const candidate of bundle.records) {
      const id = `official-catalog-partial-${candidate.universityId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const programs = candidate.observedProgramNames ?? [];
      const categories = candidate.observedProgramCategories ?? [];
      const sourceId = idFor("official-source", candidate.sourceUrl);
      const sourceDocumentId = idFor("official-document", candidate.sourceUrl);
      const structured = {
        officialWebsite: candidate.sourceUrl,
        programs: programs.map((name) => ({ name, sourceUrl: candidate.sourceUrl, status: "official_catalog_observed" })),
        programCategories: categories,
        resourceUrls: [candidate.sourceUrl],
        coverageStatus: "partial_official_catalog",
        missingFields: ["tuition", "acceptanceRatePercent", "applicationDeadlines", "midRangeScores", "graduationRate4Yr"],
        sourcePublisher: candidate.publisher,
        sourceType: candidate.sourceType,
        sourceIds: [sourceId],
        sourceDocumentIds: [sourceDocumentId],
        checkedOn: candidate.checkedOn,
      };
      const result = await client.query(`
        INSERT INTO college_guides
          (id,university_id,source_file,source_snapshot_year,school_name_raw,source_url,
           sections,structured,raw_text,display_tier,source_status)
        VALUES ($1,$2,$3,2026,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET
          university_id=EXCLUDED.university_id,source_url=EXCLUDED.source_url,
          sections=EXCLUDED.sections,structured=EXCLUDED.structured,
          raw_text=EXCLUDED.raw_text,source_status=EXCLUDED.source_status,updated_at=NOW()
      `, [id, candidate.universityId, "guide-source-candidates.json", candidate.universityName, candidate.sourceUrl,
        JSON.stringify([{ title: "Official catalog source", sourceUrl: candidate.sourceUrl, publisher: candidate.publisher }]),
        JSON.stringify(structured),
        `${candidate.universityName} — partial official catalog record. Verified source: ${candidate.sourceUrl}. This record intentionally does not claim complete admissions, cost, or ranking coverage.`,
        "review", "partial_official_catalog"]);
      inserted += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, candidates: bundle.records.length, inserted, status: "partial_official_catalog" }, null, 2));
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
