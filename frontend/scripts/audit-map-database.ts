import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, query_timeout: 30000 });
  await client.connect();
  try {
    const rows = await client.query(`
      SELECT u.id,u.name,u.latitude,u.longitude,
        d.university_id IS NOT NULL AS has_detail,
        jsonb_array_length(COALESCE(d.payload->'allMajors','[]'::jsonb))::int AS majors,
        (
          COALESCE(jsonb_array_length(d.payload->'allMajors'), 0)
          + COALESCE(jsonb_array_length(d.payload->'programs'), 0)
          + COALESCE(jsonb_array_length(d.payload->'topPrograms'), 0)
        )::int AS sourced_sections
      FROM universities u LEFT JOIN university_details d ON d.university_id=u.id
      ORDER BY u.name
    `);
    const invalidCoordinate = (row: { latitude: unknown; longitude: unknown }) =>
      typeof row.latitude !== "number" || !Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90
      || typeof row.longitude !== "number" || !Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180;
    const sourceRows = await client.query(`
      SELECT s->>'sourceId' AS id FROM source_index,
        LATERAL jsonb_array_elements(payload->'sources') s WHERE source_index.id=1
    `);
    const indexed = new Set(sourceRows.rows.map((row) => row.id));
    const references = await client.query(`
      SELECT d.university_id AS id, array_agg(DISTINCT ref #>> '{}') AS source_ids
      FROM university_details d,
        LATERAL jsonb_path_query(d.payload, '$.**.sourceIds[*]') ref GROUP BY d.university_id
    `);
    const brokenSources = references.rows.flatMap((row) =>
      row.source_ids.filter((id: string) => !indexed.has(id)).map((sourceId: string) => ({ id: row.id, sourceId })),
    );
    const brokenSchools = new Set(brokenSources.map((row) => row.id));
    let localComparison: { checked: number; mismatches: string[] } | null = null;
    if (process.argv.includes("--compare-local")) {
      const bundle = process.env.PATHOS_PREVIEW_BUNDLE_DIR ?? "data/preview";
      const universities = JSON.parse(await readFile(path.join(bundle, "universities.json"), "utf8")) as Array<{ id: string }>;
      const local = await Promise.all(universities.map(async ({ id }) => {
        const file = path.join(bundle, "university-details", id.replace(/^candidate-v2:/, "candidate-v2/")) + ".json";
        const detail = JSON.parse(await readFile(file, "utf8"));
        return { id, allMajors: detail.allMajors, allMajorsStatus: detail.allMajorsStatus };
      }));
      const comparison = await client.query(`
        SELECT expected->>'id' AS id,
          d.university_id IS NOT NULL
          AND d.payload->'allMajors' IS NOT DISTINCT FROM expected->'allMajors'
          AND d.payload->'allMajorsStatus' IS NOT DISTINCT FROM expected->'allMajorsStatus' AS matches
        FROM jsonb_array_elements($1::jsonb) expected
        LEFT JOIN university_details d ON d.university_id=expected->>'id'
      `, [JSON.stringify(local)]);
      localComparison = { checked: comparison.rows.length, mismatches: comparison.rows.filter((row) => !row.matches).map((row) => row.id) };
    }
    const mismatchedSchools = new Set(localComparison?.mismatches ?? []);
    const failures = rows.rows.filter((row) => invalidCoordinate(row) || !row.has_detail || row.majors === 0 || row.majors === null
      || brokenSchools.has(row.id) || mismatchedSchools.has(row.id));
    const summary = {
      checkedAt: new Date().toISOString(), total: rows.rows.length, passed: rows.rows.length - failures.length, failed: failures.length,
      totalMajors: rows.rows.reduce((sum, row) => sum + (row.majors ?? 0), 0),
      schoolsWithProgramSections: rows.rows.filter((row) => (row.sourced_sections ?? 0) > 0).length,
      invalidCoordinates: rows.rows.filter(invalidCoordinate).length,
      missingDetails: rows.rows.filter((row) => !row.has_detail).length,
      indexedSources: indexed.size,
      brokenSourceReferences: brokenSources,
      localComparison,
      failures,
    };
    await mkdir("test-results", { recursive: true });
    const output = "test-results/map-database-audit.json";
    const temp = `${output}.tmp-${process.pid}`;
    await writeFile(temp, JSON.stringify({ ...summary, schools: rows.rows }, null, 2));
    await import("node:fs/promises").then(({ rename }) => rename(temp, output));
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length || brokenSources.length || (localComparison?.mismatches.length ?? 0)) process.exitCode = 1;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
