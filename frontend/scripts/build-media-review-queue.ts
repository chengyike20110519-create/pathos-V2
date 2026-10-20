/**
 * Build a traceable media review queue from the current university catalog.
 *
 * This is deliberately a queue, not an import: an image is only allowed into
 * university_media after its source URL and license/review state are checked.
 */
import { mkdir, writeFile, rename } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

type QueueRow = {
  universityId: string;
  schoolName: string;
  officialWebsite: string | null;
  status: "pending_source_and_license_review";
  requiredChecks: string[];
  candidateImages: [];
};

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query<{
      id: string;
      name: string;
      source_url: string | null;
    }>(`
      SELECT u.id, u.name,
        NULLIF((d.payload->'sources'->0->>'url'), '') AS source_url
      FROM universities u
      LEFT JOIN university_details d ON d.university_id = u.id
      ORDER BY u.name
    `);

    const rows: QueueRow[] = result.rows.map((row) => ({
      universityId: row.id,
      schoolName: row.name,
      officialWebsite: row.source_url,
      status: "pending_source_and_license_review",
      requiredChecks: [
        "image source URL must be reachable",
        "publisher/owner must be recorded",
        "license or explicit reuse permission must be verified",
        "reviewStatus must be approved and licenseStatus must be verified before import",
      ],
      candidateImages: [],
    }));

    const output = "data/reviewed/university-media-review-queue.json";
    await mkdir("data/reviewed", { recursive: true });
    const temp = `${output}.tmp`;
    await writeFile(temp, `${JSON.stringify({ generatedOn: new Date().toISOString().slice(0, 10), totalSchools: rows.length, rows }, null, 2)}\n`, "utf8");
    await rename(temp, output);
    console.log(JSON.stringify({ output, totalSchools: rows.length, pending: rows.length, approved: 0 }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
