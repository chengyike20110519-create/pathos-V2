import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, query_timeout: 30000 });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT u.id AS "universityId", u.name, u.chinese_name AS "nameZh",
        u.national_ranking AS "nationalRanking",
        COALESCE((SELECT jsonb_agg(source ORDER BY source->>'url')
          FROM jsonb_array_elements(COALESCE(d.payload->'sources','[]'::jsonb)) source
          WHERE source->>'url' ~ '^https?://'), '[]'::jsonb) AS "officialSources"
      FROM universities u
      JOIN university_details d ON d.university_id=u.id
      WHERE NOT EXISTS (SELECT 1 FROM college_guides g WHERE g.university_id=u.id)
      ORDER BY u.national_ranking NULLS LAST, u.name
    `);
    await mkdir("data/reviewed", { recursive: true });
    const path = "data/reviewed/guide-review-queue.json";
    await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), status: "pending_manual_verification", schools: result.rows }, null, 2) + "\n");
    console.log(JSON.stringify({ path, missingGuides: result.rowCount }, null, 2));
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
