/**
 * Repair legacy string entries in university_details.allMajors.
 *
 * Safety rules:
 * - default is a read-only dry run;
 * - only source IDs already resolved in source_reference_gaps are eligible;
 * - only sources whose verified ID clearly identifies a catalog/major/program
 *   directory are eligible;
 * - writes are one transaction and require APPLY_DIRECTORY_SOURCE_LINKS=1.
 */
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

type Source = {
  universityId?: string;
  sourceId: string;
  publisher?: string;
  sourceType?: string;
  status?: string;
  url?: string | null;
};

type MajorEntry = string | Record<string, unknown>;

const DIRECTORY_SOURCE_RE = /(?:undergraduate|undergrad|majors|programs|degree[-_]program|undergraduate[-_]degree|concentrations|bulletin|academic[-_]catalog|catalog[-_](?:20\d{2}|undergraduate))/i;

function isDirectorySource(source: Source): boolean {
  return Boolean(
    source.url &&
      DIRECTORY_SOURCE_RE.test(source.sourceId) &&
      ["verified", "official_institutional"].includes(String(source.status)),
  );
}

function sourceRank(source: Source): number {
  const id = source.sourceId.toLowerCase();
  if (/undergraduate[-_](?:majors|programs)|degree[-_]program/.test(id)) return 0;
  if (/catalog|bulletin|concentrations/.test(id)) return 1;
  return 2;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const sourceIndex = await client.query<{ payload: { sources?: Source[] } }>(
      "SELECT payload FROM source_index WHERE id=1",
    );
    const resolved = await client.query<{ university_id: string; source_id: string }>(
      "SELECT university_id, source_id FROM source_reference_gaps WHERE status='resolved'",
    );
    const details = await client.query<{ university_id: string; name: string; majors: MajorEntry[] }>(
      `SELECT d.university_id, u.name, d.payload->'allMajors' AS majors
         FROM university_details d JOIN universities u ON u.id=d.university_id
        ORDER BY u.name`,
    );

    const indexed = new Map(
      (sourceIndex.rows[0]?.payload?.sources ?? []).map((source) => [source.sourceId, source]),
    );
    const resolvedBySchool = new Map<string, Set<string>>();
    for (const row of resolved.rows) {
      const ids = resolvedBySchool.get(row.university_id) ?? new Set<string>();
      ids.add(row.source_id);
      resolvedBySchool.set(row.university_id, ids);
    }

    const plan: Array<{ universityId: string; name: string; sourceId: string; count: number }> = [];
    const unresolved: Array<{ universityId: string; name: string; count: number }> = [];
    for (const row of details.rows) {
      const majors = Array.isArray(row.majors) ? row.majors : [];
      const missing = majors.filter((entry) =>
        typeof entry === "string" || !Array.isArray(entry.sourceIds) || entry.sourceIds.length === 0,
      ).length;
      if (!missing) continue;
      const candidates = [
        ...(resolvedBySchool.get(row.university_id) ?? []),
        ...[...indexed.values()]
          .filter((source) => source.universityId === row.university_id)
          .map((source) => source.sourceId),
      ]
        .map((sourceId) => indexed.get(sourceId))
        .filter((source): source is Source => Boolean(source && isDirectorySource(source)))
        .sort((a, b) => sourceRank(a) - sourceRank(b));
      if (candidates[0]) plan.push({ universityId: row.university_id, name: row.name, sourceId: candidates[0].sourceId, count: missing });
      else unresolved.push({ universityId: row.university_id, name: row.name, count: missing });
    }

    const total = plan.reduce((sum, row) => sum + row.count, 0);
    console.log(JSON.stringify({
      mode: process.env.APPLY_DIRECTORY_SOURCE_LINKS === "1" ? "apply" : "dry-run",
      eligibleSchools: plan.length,
      eligibleEntries: total,
      unresolvedSchools: unresolved.length,
      unresolvedEntries: unresolved.reduce((sum, row) => sum + row.count, 0),
      plan,
      unresolved,
    }, null, 2));

    if (process.env.APPLY_DIRECTORY_SOURCE_LINKS !== "1" || plan.length === 0) return;

    for (const item of plan) {
      await client.query("BEGIN");
      try {
        const full = await client.query<{ payload: Record<string, unknown> }>(
          "SELECT payload FROM university_details WHERE university_id=$1",
          [item.universityId],
        );
        const row = full.rows[0];
        if (!row) continue;
        const payload = { ...row.payload };
        const majors = Array.isArray(payload.allMajors) ? payload.allMajors as MajorEntry[] : [];
        payload.allMajors = majors.map((entry) => {
          if (typeof entry === "string") {
            return {
              name: entry,
              displayName: entry,
              degreeType: null,
              listType: "official_directory",
              sourceIds: [item.sourceId],
              status: "source_limited",
              warnings: ["directory_membership_source_verified"],
            };
          }
          if (!Array.isArray(entry.sourceIds) || entry.sourceIds.length === 0) {
            return { ...entry, sourceIds: [item.sourceId], status: entry.status ?? "source_limited", warnings: Array.isArray(entry.warnings) ? entry.warnings : ["directory_membership_source_verified"] };
          }
          return entry;
        });
        await client.query(
          "UPDATE university_details SET payload=$1::jsonb, updated_at=NOW() WHERE university_id=$2",
          [JSON.stringify(payload), item.universityId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log(JSON.stringify({ ok: true, updatedSchools: plan.length, updatedEntries: total }));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
