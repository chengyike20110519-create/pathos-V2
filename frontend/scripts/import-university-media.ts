/**
 * Import only reviewed university media into university_media.
 *
 * Default mode is a validation-only dry run. Use --apply after every row has
 * a traceable source URL and an approved license/review status.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

type MediaRow = {
  id: string;
  universityId: string;
  url: string;
  thumbnailUrl?: string | null;
  label: string;
  sourceUrl: string;
  publisher: string;
  licenseStatus: "verified" | "pending_review" | "not_suitable";
  reviewStatus: "approved" | "pending" | "rejected";
  checkedOn: string;
  displayOrder: number;
};

function validate(row: MediaRow): string[] {
  const errors: string[] = [];
  for (const key of ["id", "universityId", "url", "label", "sourceUrl", "publisher", "checkedOn"]) {
    if (typeof row[key as keyof MediaRow] !== "string" || !String(row[key as keyof MediaRow]).trim()) errors.push(`${key} missing`);
  }
  for (const key of ["url", "sourceUrl"]) {
    if (typeof row[key as keyof MediaRow] === "string" && !/^https?:\/\//.test(String(row[key as keyof MediaRow]))) errors.push(`${key} must be http(s)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.checkedOn)) errors.push("checkedOn must be YYYY-MM-DD");
  if (row.reviewStatus === "approved" && row.licenseStatus !== "verified") errors.push("approved media requires verified license");
  if (!Number.isInteger(row.displayOrder) || row.displayOrder < 0) errors.push("displayOrder invalid");
  return errors;
}

async function main(): Promise<void> {
  const path = process.env.PATHOS_MEDIA_REVIEW_FILE ?? "data/reviewed/university-media.json";
  const records = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(records)) throw new Error("Media review file must be an array");
  const rows = records as MediaRow[];
  const errors = rows.flatMap((row, index) => validate(row).map((error) => `row ${index + 1}: ${error}`));
  if (errors.length) throw new Error(`Media review validation failed:\n${errors.join("\n")}`);

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const ids = [...new Set(rows.map((row) => row.universityId))];
    const schools = await client.query<{ id: string }>("SELECT id FROM universities WHERE id = ANY($1::text[])", [ids]);
    const known = new Set(schools.rows.map((row) => row.id));
    const missingSchools = ids.filter((id) => !known.has(id));
    if (missingSchools.length) throw new Error(`Unknown university IDs: ${missingSchools.join(", ")}`);
    const duplicateIds = rows.map((row) => row.id).filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length) throw new Error(`Duplicate media IDs: ${[...new Set(duplicateIds)].join(", ")}`);

    console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "dry-run", rows: rows.length, schools: ids.length, approved: rows.filter((row) => row.reviewStatus === "approved").length }, null, 2));
    if (!process.argv.includes("--apply")) return;

    await client.query("BEGIN");
    try {
      for (const row of rows) {
        await client.query(
          `INSERT INTO university_media
            (id, university_id, media_type, url, thumbnail_url, label, source_url,
             publisher, license_status, review_status, checked_on, display_order)
           VALUES ($1,$2,'campus_photo',$3,$4,$5,$6,$7,$8,$9,$10::date,$11)
           ON CONFLICT (id) DO UPDATE SET
             university_id=EXCLUDED.university_id, url=EXCLUDED.url,
             thumbnail_url=EXCLUDED.thumbnail_url, label=EXCLUDED.label,
             source_url=EXCLUDED.source_url, publisher=EXCLUDED.publisher,
             license_status=EXCLUDED.license_status, review_status=EXCLUDED.review_status,
             checked_on=EXCLUDED.checked_on, display_order=EXCLUDED.display_order,
             updated_at=NOW()`,
          [row.id, row.universityId, row.url, row.thumbnailUrl ?? null, row.label, row.sourceUrl, row.publisher, row.licenseStatus, row.reviewStatus, row.checkedOn, row.displayOrder],
        );
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({ ok: true, imported: rows.length }, null, 2));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
