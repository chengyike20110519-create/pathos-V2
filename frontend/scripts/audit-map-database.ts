import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, query_timeout: 30000 });
  await client.connect();
  try {
    const rows = await client.query(`
      SELECT u.id,u.name,u.latitude,u.longitude,
        jsonb_array_length(COALESCE(d.payload->'allMajors','[]'::jsonb))::int AS majors,
        (
          COALESCE(jsonb_array_length(d.payload->'allMajors'), 0)
          + COALESCE(jsonb_array_length(d.payload->'programs'), 0)
          + COALESCE(jsonb_array_length(d.payload->'topPrograms'), 0)
        )::int AS sourced_sections
      FROM universities u LEFT JOIN university_details d ON d.university_id=u.id
      ORDER BY u.name
    `);
    const failures = rows.rows.filter((row) => row.latitude === null || row.longitude === null || row.majors === null || row.sources === null);
    const summary = {
      checkedAt: new Date().toISOString(), total: rows.rows.length, passed: rows.rows.length - failures.length, failed: failures.length,
      totalMajors: rows.rows.reduce((sum, row) => sum + (row.majors ?? 0), 0),
      schoolsWithProgramSections: rows.rows.filter((row) => (row.sourced_sections ?? 0) > 0).length,
      invalidCoordinates: rows.rows.filter((row) => row.latitude === null || row.longitude === null).length,
      failures,
    };
    await mkdir("test-results", { recursive: true });
    const output = "test-results/map-database-audit.json";
    const temp = `${output}.tmp-${process.pid}`;
    await writeFile(temp, JSON.stringify({ ...summary, schools: rows.rows }, null, 2));
    await import("node:fs/promises").then(({ rename }) => rename(temp, output));
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
