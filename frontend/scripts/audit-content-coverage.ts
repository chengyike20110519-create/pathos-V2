import pg from "pg";
import { mkdir, writeFile, rename } from "node:fs/promises";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, query_timeout: 30000 });
  await client.connect();
  try {
    const websites = await client.query(`
      SELECT COUNT(*)::int AS schools,
        COUNT(*) FILTER (WHERE jsonb_path_exists(d.payload, '$.sources[*] ? (@.url like_regex "^https?://")'))::int AS with_official_source,
        COUNT(*) FILTER (WHERE NOT jsonb_path_exists(d.payload, '$.sources[*] ? (@.url like_regex "^https?://")'))::int AS missing_official_source
      FROM universities u JOIN university_details d ON d.university_id=u.id
    `);
    const spotlights = await client.query(`
      SELECT COUNT(*)::int AS schools_with_spotlights,
        COALESCE(SUM(jsonb_array_length(fact::jsonb)), 0)::int AS spotlight_entries
      FROM school_confirmed_facts
      WHERE fact_type='program_spotlights_v1' AND status='confirmed'
    `);
    const media = await client.query(`
      SELECT COUNT(*)::int AS media_rows, COUNT(DISTINCT university_id)::int AS media_schools
      FROM university_media
    `);
    const schools = await client.query(`
      SELECT u.id, u.name,
        EXISTS (
          SELECT 1 FROM university_details d
          WHERE d.university_id=u.id
            AND jsonb_path_exists(d.payload, '$.sources[*] ? (@.url like_regex "^https?://")')
        ) AS has_official_source,
        EXISTS (
          SELECT 1 FROM college_guides g
          WHERE g.university_id=u.id
        ) AS has_guide,
        EXISTS (
          SELECT 1 FROM school_confirmed_facts f
          WHERE f.university_id=u.id AND f.fact_type='program_spotlights_v1' AND f.status='confirmed'
        ) AS has_confirmed_spotlights,
        EXISTS (
          SELECT 1 FROM university_media m
          WHERE m.university_id=u.id AND m.review_status='approved' AND m.license_status='verified'
        ) AS has_approved_media,
        COALESCE((
          SELECT jsonb_array_length(d.payload->'allMajors')
          FROM university_details d WHERE d.university_id=u.id
        ), 0)::int AS major_count
      FROM universities u
      ORDER BY u.name
    `);
    const report = {
      generatedOn: new Date().toISOString(),
      summary: { websites: websites.rows[0], spotlights: spotlights.rows[0], media: media.rows[0] },
      schools: schools.rows.map((row) => ({
        universityId: row.id,
        schoolName: row.name,
        majorCount: row.major_count,
        hasOfficialSource: row.has_official_source,
        hasGuide: row.has_guide,
        hasConfirmedSpotlights: row.has_confirmed_spotlights,
        hasApprovedMedia: row.has_approved_media,
        missing: [
          !row.has_official_source && "official_source",
          !row.has_guide && "guide",
          !row.has_confirmed_spotlights && "confirmed_program_spotlights",
          !row.has_approved_media && "approved_campus_media",
        ].filter(Boolean),
      })),
    };
    const output = "test-results/content-coverage-report.json";
    await mkdir("test-results", { recursive: true });
    const temp = `${output}.tmp`;
    await writeFile(temp, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rename(temp, output);
    console.log(JSON.stringify(report.summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
