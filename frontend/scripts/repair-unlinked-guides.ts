import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const repairs = [
  { guideId: "iecg-2025-16d4fd2015add553", universityId: "candidate-v2:ohio-state-university", expectedName: "The Ohio State University" },
  { guideId: "iecg-2025-2087ceaf520c7ac9", universityId: "candidate-v2:lehigh-university", expectedName: "Lehigh University" },
] as const;

async function main() {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const repair of repairs) {
      const school = await client.query<{ name: string }>("SELECT name FROM universities WHERE id=$1", [repair.universityId]);
      if (school.rowCount !== 1 || school.rows[0].name !== repair.expectedName) throw new Error(`School identity check failed for ${repair.universityId}`);
      const guide = await client.query<{ university_id: string | null }>("SELECT university_id FROM college_guides WHERE id=$1 FOR UPDATE", [repair.guideId]);
      if (guide.rowCount !== 1 || guide.rows[0].university_id !== null) throw new Error(`Guide is not an unlinked guide: ${repair.guideId}`);
      const conflict = await client.query("SELECT 1 FROM college_guides WHERE university_id=$1", [repair.universityId]);
      if (conflict.rowCount) throw new Error(`Target school already has a guide: ${repair.universityId}`);
      await client.query("UPDATE college_guides SET university_id=$2, updated_at=NOW() WHERE id=$1", [repair.guideId, repair.universityId]);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, repaired: repairs.map((item) => item.universityId), intentionallyUnlinked: ["Santa Clara University", "Pepperdine University"] }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
