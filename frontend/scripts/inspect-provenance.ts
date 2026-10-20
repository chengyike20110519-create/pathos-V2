import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
async function main() {
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const sourceIndex = await client.query<{ payload: { sources?: Array<{ sourceId?: string; url?: string }> } }>(
  "SELECT payload FROM source_index WHERE id=1",
);
const indexed = new Set((sourceIndex.rows[0]?.payload?.sources ?? []).map((x) => x.sourceId).filter(Boolean));
const rows = await client.query<{ university_id: string; name: string; source_id: string }>(`
  SELECT DISTINCT d.university_id, u.name, value #>> '{}' AS source_id
    FROM university_details d JOIN universities u ON u.id = d.university_id
    CROSS JOIN LATERAL jsonb_path_query(d.payload, '$.**.sourceIds[*]') value
   ORDER BY u.name
`);
const missing = rows.rows.filter((row) => !indexed.has(row.source_id));
console.log(JSON.stringify({ indexed: indexed.size, refs: rows.rowCount, missing: missing.length, schools: [...new Set(missing.map((x) => x.university_id))].length, sample: missing.slice(0, 40) }, null, 2));
await client.end();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
