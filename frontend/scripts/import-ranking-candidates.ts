import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

type Candidate = {
  universityId: string;
  rank: number;
  sourceUrl: string;
  checkedOn?: string;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const file = JSON.parse(await readFile(path.join(process.cwd(), "data/reviewed/ranking-candidates-2026.json"), "utf8")) as { records: Candidate[] };
  const client = new Client({ connectionString: databaseUrl, ssl: databaseUrl.includes("supabase") ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
  await client.query("BEGIN");
  for (const candidate of file.records) {
    const tier = candidate.rank <= 20 ? "top20" : candidate.rank <= 50 ? "top50" : candidate.rank <= 100 ? "top100" : "other";
    const summary = JSON.stringify({
      nationalRank: candidate.rank,
      rankingLabel: `#${candidate.rank}`,
      rankingTier: tier,
      sourceIds: [`ranking-2026-${candidate.universityId}`],
      status: "ranked_in_selected_national_family",
      filterBehavior: "include_as_ranked",
      sourceUrl: candidate.sourceUrl,
      sourceCheckedOn: candidate.checkedOn ?? null,
    });
    await client.query(
      `UPDATE universities
       SET national_ranking = $2, ranking_band = $3, ranking_tier = $4,
           payload = jsonb_set(jsonb_set(payload, '{nationalRanking}', to_jsonb($2::int)), '{rankingSummary}', $5::jsonb),
           updated_at = NOW()
       WHERE id = $1`,
      [candidate.universityId, candidate.rank, `national_top_${candidate.rank <= 20 ? 20 : candidate.rank <= 50 ? 50 : 100}`, tier, summary],
    );
    await client.query(
      `UPDATE university_details
       SET payload = jsonb_set(payload, '{rankingSummary}', $2::jsonb), updated_at = NOW()
       WHERE university_id = $1`,
      [candidate.universityId, summary],
    );
  }
  const sourceIndex = await client.query<{ payload: { sources?: unknown[] } }>("SELECT payload FROM source_index WHERE id = 1 FOR UPDATE");
  if (sourceIndex.rowCount) {
    const payload = sourceIndex.rows[0].payload ?? {};
    const sources = Array.isArray(payload.sources) ? [...payload.sources] as Array<Record<string, unknown>> : [];
    for (const candidate of file.records) {
      const sourceId = `ranking-2026-${candidate.universityId}`;
      const source = {
        sourceId,
        universityId: candidate.universityId,
        url: candidate.sourceUrl,
        publisher: "Official university ranking report",
        sourceType: "official_university_ranking_report",
        status: "verified",
        referenceYear: 2026,
        checkedOn: candidate.checkedOn ?? null,
      };
      const index = sources.findIndex((item) => item.sourceId === sourceId);
      if (index >= 0) sources[index] = source;
      else sources.push(source);
    }
    await client.query("UPDATE source_index SET payload = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify({ ...payload, sources })]);
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ updated: file.records.map((item) => ({ id: item.universityId, rank: item.rank })) }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
