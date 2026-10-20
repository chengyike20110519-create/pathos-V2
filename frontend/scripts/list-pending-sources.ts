import pg from "pg";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const result = await client.query(`
    SELECT g.university_id, u.name, g.source_id
      FROM source_reference_gaps g
      JOIN universities u ON u.id = g.university_id
     WHERE g.status = 'pending'
     ORDER BY u.name, g.source_id
     LIMIT 40 OFFSET $1
  `, [Number(process.argv[2] ?? 0)]);
  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
