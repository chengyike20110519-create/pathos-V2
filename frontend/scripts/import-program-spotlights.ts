// Narrow, idempotent import into the existing reviewed-facts table.
// No schema migrations, deletion, or other school records are touched.
import { readFile } from "node:fs/promises";
import { getPool } from "../src/server/db";
import { parseProgramSpotlights } from "../src/schemas/dataset.schema";

function comparableProgramName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\band\b/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

async function main() {
  const allRecords = JSON.parse(await readFile("data/reviewed/program-spotlights.json", "utf8")) as Array<{ universityId: string; spotlights: unknown[] }>;
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).trim();
  const records = only ? allRecords.filter((record) => record.universityId === only) : allRecords;
  if (only && records.length !== 1) throw new Error(`No reviewed spotlight record found for ${only}`);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const universityIds = records.map((record) => record.universityId);
    const detailRows = await client.query(
      "SELECT university_id, payload->'allMajors' AS majors FROM university_details WHERE university_id = ANY($1::text[])",
      [universityIds],
    );
    const majorsByUniversity = new Map(detailRows.rows.map((row) => [row.university_id, row.majors ?? []]));
    const factRows = await client.query(
      "SELECT university_id, fact FROM school_confirmed_facts WHERE fact_type='program_spotlights_v1' AND university_id = ANY($1::text[]) FOR UPDATE",
      [universityIds],
    );
    const factsByUniversity = new Map(factRows.rows.map((row) => [row.university_id, row.fact]));
    for (const record of records) {
      const parsed = parseProgramSpotlights(record.spotlights);
      if (!parsed.length || parsed.length !== record.spotlights.length) throw new Error("Invalid reviewed spotlight");
      const majors = majorsByUniversity.get(record.universityId);
      if (majors === undefined) throw new Error(`School not found: ${record.universityId}`);
      const names = (majors as (string | { name?: string; displayName?: string })[])
        .map((item) => typeof item === "string" ? item : item.name ?? item.displayName ?? "")
        .map((name) => name.replace(/\s+/g, " ").trim().toLocaleLowerCase());
      if (parsed.some((program) => !names.includes(program.name.replace(/\s+/g, " ").trim().toLocaleLowerCase()))) {
        throw new Error("Spotlight not in the existing school directory");
      }
      const existingFact = factsByUniversity.get(record.universityId);
      const prior = existingFact ? JSON.parse(existingFact) : [];
      const priorParsed = parseProgramSpotlights(prior);
      if (!Array.isArray(prior) || priorParsed.length !== prior.length) throw new Error("Existing highlights require review; refusing to overwrite them");
      const byName = new Map(priorParsed.map((program) => [program.name.toLowerCase(), program]));
      parsed.forEach((program) => {
        const comparable = comparableProgramName(program.name);
        for (const [key, existing] of byName) {
          if (comparableProgramName(existing.name) === comparable && existing.name !== program.name) byName.delete(key);
        }
        byName.set(program.name.toLowerCase(), program);
      });
      const merged = [...byName.values()];
      if (process.argv.includes("--apply")) {
        await client.query(`INSERT INTO school_confirmed_facts (university_id,fact_type,fact,status,source_url,confirmed_on)
          VALUES ($1,'program_spotlights_v1',$2,'confirmed',$3,$4)
          ON CONFLICT (university_id,fact_type) DO UPDATE SET fact=EXCLUDED.fact,status=EXCLUDED.status,
          source_url=EXCLUDED.source_url,confirmed_on=EXCLUDED.confirmed_on,updated_at=now()`,
          [record.universityId, JSON.stringify(merged), parsed[0].sourceUrl, parsed[0].checkedOn]);
      }
      console.log(JSON.stringify({ universityId: record.universityId, names: parsed.map((program) => program.name), applied: process.argv.includes("--apply") }));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
