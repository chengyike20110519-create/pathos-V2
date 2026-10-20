import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const coverage = await client.query(`
      WITH majors AS (
        SELECT d.university_id,
               jsonb_array_elements(COALESCE(d.payload->'allMajors', '[]'::jsonb)) AS item
          FROM university_details d
      ), stats AS (
        SELECT university_id,
               COUNT(*)::int AS entries,
               COUNT(*) FILTER (
                 WHERE jsonb_typeof(item) = 'string'
                    OR COALESCE(jsonb_array_length(item->'sourceIds'), 0) = 0
               )::int AS missing_source_ids
          FROM majors
         GROUP BY university_id
      )
      SELECT COUNT(*)::int AS schools,
             COALESCE(SUM(entries), 0)::int AS entries,
             COALESCE(SUM(missing_source_ids), 0)::int AS missing_source_ids,
             COUNT(*) FILTER (WHERE missing_source_ids = 0)::int AS fully_sourced_schools
        FROM stats
    `);
    const gaps = await client.query(`
      WITH majors AS (
        SELECT d.university_id,
               jsonb_array_elements(COALESCE(d.payload->'allMajors', '[]'::jsonb)) AS item
          FROM university_details d
      ), stats AS (
        SELECT university_id,
               COUNT(*) FILTER (
                 WHERE jsonb_typeof(item) = 'string'
                    OR COALESCE(jsonb_array_length(item->'sourceIds'), 0) = 0
               )::int AS missing
          FROM majors
         GROUP BY university_id
      )
      SELECT u.id, u.name, u.chinese_name AS "nameZh", stats.missing
        FROM stats
        JOIN universities u ON u.id = stats.university_id
       WHERE stats.missing > 0
       ORDER BY stats.missing DESC, u.name
       LIMIT 25
    `);
    console.log(JSON.stringify({ ok: true, coverage: coverage.rows[0], largestGaps: gaps.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
