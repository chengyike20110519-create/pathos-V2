import { readFile } from "node:fs/promises";
import { getPool } from "../src/server/db";

type Overview = { universityId: string; overviewZh?: string; reviewStatus?: string; sources?: unknown[] };
type SpotlightRecord = { universityId: string; spotlights: unknown[] };
type Motto = { universityId: string; motto?: string; mottoZh?: string; sourceUrl?: string; sourceType?: string; status?: string };

async function main() {
  const [overviewFile, spotlightFile, mottoFile] = await Promise.all([
    readFile("data/reviewed/university-overviews.json", "utf8"),
    readFile("data/reviewed/program-spotlights.json", "utf8"),
    readFile("data/reviewed/university-mottos.json", "utf8"),
  ]);
  const overviews = (JSON.parse(overviewFile) as { schools: Overview[] }).schools;
  const spotlights = JSON.parse(spotlightFile) as SpotlightRecord[];
  const mottos = (JSON.parse(mottoFile) as { records: Motto[] }).records;
  const overviewById = new Map(overviews.map((item) => [item.universityId, item]));
  const spotlightById = new Map(spotlights.map((item) => [item.universityId, item.spotlights]));
  const mottoById = new Map(mottos.map((item) => [item.universityId, item]));
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = await client.query("SELECT id FROM universities ORDER BY id");
    for (const row of ids.rows as { id: string }[]) {
      const overview = overviewById.get(row.id);
      const motto = mottoById.get(row.id);
      await client.query(`
        INSERT INTO university_content
          (university_id, overview_zh, overview_status, motto, motto_zh, motto_status,
           motto_source_url, motto_source_type, motto_checked_on, program_spotlights, source_refs)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9,$10)
        ON CONFLICT (university_id) DO UPDATE SET
          overview_zh=EXCLUDED.overview_zh, overview_status=EXCLUDED.overview_status,
          motto=EXCLUDED.motto, motto_zh=EXCLUDED.motto_zh, motto_status=EXCLUDED.motto_status,
          motto_source_url=EXCLUDED.motto_source_url, motto_source_type=EXCLUDED.motto_source_type,
          motto_checked_on=EXCLUDED.motto_checked_on,
          program_spotlights=EXCLUDED.program_spotlights, source_refs=EXCLUDED.source_refs,
          updated_at=NOW()`,
        [row.id, overview?.overviewZh ?? null, overview?.reviewStatus === "reviewed" ? "reviewed" : "pending",
          motto?.motto ?? null, motto?.mottoZh ?? null, motto?.status ?? "pending", motto?.sourceUrl ?? null,
          motto?.sourceType ?? null, JSON.stringify(spotlightById.get(row.id) ?? []), JSON.stringify(overview?.sources ?? [])],
      );
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ schools: ids.rowCount, overviews: overviews.length, spotlights: spotlights.length, mottos: mottos.length }));
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
