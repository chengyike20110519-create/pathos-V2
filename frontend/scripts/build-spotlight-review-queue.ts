import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

type QueueRow = {
  universityId: string;
  name: string;
  nameZh: string | null;
  candidatePrograms: unknown[];
  officialSources: unknown[];
};

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, query_timeout: 30000 });
  await client.connect();
  try {
    const result = await client.query<QueueRow>(`
      SELECT u.id AS "universityId", u.name, u.chinese_name AS "nameZh",
        COALESCE(d.payload->'topPrograms', d.payload->'programs', '[]'::jsonb) AS "candidatePrograms",
        COALESCE((SELECT jsonb_agg(source ORDER BY source->>'url')
          FROM jsonb_array_elements(COALESCE(d.payload->'sources','[]'::jsonb)) source
          WHERE source->>'url' ~ '^https?://'), '[]'::jsonb) AS "officialSources"
      FROM universities u
      JOIN university_details d ON d.university_id=u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM school_confirmed_facts f
        WHERE f.university_id=u.id AND f.fact_type='program_spotlights_v1' AND f.status='confirmed'
      )
      ORDER BY u.national_ranking NULLS LAST, u.name
    `);
    await mkdir("data/reviewed", { recursive: true });
    const path = "data/reviewed/spotlight-review-queue.json";
    await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), status: "pending_manual_verification", schools: result.rows }, null, 2) + "\n");
    console.log(JSON.stringify({ path, schools: result.rowCount, candidatePrograms: result.rows.reduce((sum, row) => sum + (Array.isArray(row.candidatePrograms) ? row.candidatePrograms.length : 0), 0) }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
