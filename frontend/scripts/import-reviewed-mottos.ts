import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

type MottoRecord = {
  universityId: string;
  motto?: string;
  mottoZh?: string;
  sourceUrl?: string;
  status?: "confirmed" | "candidate" | "pending" | "rejected";
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const file = JSON.parse(await readFile(path.join(process.cwd(), "data/reviewed/university-mottos.json"), "utf8")) as { records: MottoRecord[] };
  const client = new Client({ connectionString: databaseUrl, ssl: databaseUrl.includes("supabase") ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    await client.query("BEGIN");
    const updated: string[] = [];
    for (const record of file.records) {
      const result = await client.query(
        `UPDATE university_details
         SET payload = jsonb_set(
           payload,
           '{sharedContent}',
           COALESCE(payload->'sharedContent', '{}'::jsonb) || $2::jsonb,
           true
         ), updated_at = NOW()
         WHERE university_id = $1
         RETURNING university_id`,
        [record.universityId, JSON.stringify({
          motto: record.motto ?? null,
          mottoZh: record.mottoZh ?? null,
          mottoStatus: record.status ?? "pending",
          mottoSourceUrl: record.sourceUrl ?? null,
          mottoCheckedOn: "2026-10-30",
        })],
      );
      if (result.rowCount) updated.push(record.universityId);
    }
    const sourceIndex = await client.query<{ payload: { sources?: unknown[] } }>("SELECT payload FROM source_index WHERE id = 1 FOR UPDATE");
    if (sourceIndex.rowCount) {
      const payload = sourceIndex.rows[0].payload ?? {};
      const sources = Array.isArray(payload.sources) ? [...payload.sources] as Array<Record<string, unknown>> : [];
      for (const record of file.records.filter((item) => item.sourceUrl)) {
        const sourceId = `motto-${record.universityId}`;
        const source = {
          sourceId,
          universityId: record.universityId,
          url: record.sourceUrl,
          publisher: "Official university source",
          sourceType: "official_university_motto_source",
          status: "verified",
          checkedOn: "2026-10-30",
        };
        const index = sources.findIndex((item) => item.sourceId === sourceId);
        if (index >= 0) sources[index] = source;
        else sources.push(source);
      }
      await client.query("UPDATE source_index SET payload = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify({ ...payload, sources })]);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ reviewed: file.records.length, updated: updated.length, skipped: file.records.length - updated.length }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
