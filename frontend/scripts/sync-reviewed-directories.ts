/** Sync reviewed directories without overwriting unrelated school facts.
 * Dry run by default; pass --apply followed by reviewed school slugs.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";

type Source = { sourceId: string; [key: string]: unknown };
type Detail = { id: string; allMajors: Array<Record<string, unknown>>; allMajorsStatus: Record<string, unknown>; sourceStatus: string };

async function main() {
  const apply = process.argv.includes("--apply");
  const slugs = process.argv.slice(2).filter((arg) => arg !== "--apply");
  if (!slugs.length || slugs.some((slug) => !/^[a-z0-9-]+$/.test(slug))) throw new Error("Provide reviewed university slugs");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const details = await Promise.all(slugs.map(async (slug) => JSON.parse(await readFile(`data/preview/university-details/candidate-v2/${slug}.json`, "utf8")) as Detail));
  const index = JSON.parse(await readFile("data/preview/source-index.json", "utf8")) as { sources: Source[] };
  const localSourceIds = new Set(index.sources.map((source) => source.sourceId));
  for (const detail of details) {
    if (!Array.isArray(detail.allMajors) || !detail.allMajors.length || !detail.allMajorsStatus) throw new Error(`Missing reviewed directory: ${detail.id}`);
    for (const item of detail.allMajors) {
      if (!Array.isArray(item.sourceIds) || !item.sourceIds.length || item.sourceIds.some((id) => !localSourceIds.has(id))) {
        throw new Error(`Unresolved program source: ${detail.id} / ${item.name}`);
      }
    }
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000, query_timeout: 30000 });
  await client.connect();
  let transaction = false;
  try {
    const plan = [];
    for (const detail of details) {
      const current = await client.query("SELECT jsonb_array_length(payload->'allMajors') AS entries FROM university_details WHERE university_id=$1", [detail.id]);
      if (current.rowCount !== 1) throw new Error(`Missing database school: ${detail.id}`);
      plan.push({ id: detail.id, before: current.rows[0].entries, after: detail.allMajors.length });
    }
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", plan }));
    if (!apply) return;
    await client.query("BEGIN"); transaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    const stored = await client.query("SELECT payload FROM source_index WHERE id=1 FOR UPDATE");
    if (stored.rowCount !== 1) throw new Error("Missing database source index");
    const sources = new Map<string, Source>((stored.rows[0].payload.sources ?? []).map((source: Source) => [source.sourceId, source]));
    for (const source of index.sources) sources.set(source.sourceId, { ...sources.get(source.sourceId), ...source });
    await client.query("UPDATE source_index SET payload=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify({ ...stored.rows[0].payload, ...index, sources: [...sources.values()] })]);
    for (const detail of details) {
      const patch = { allMajors: detail.allMajors, allMajorsStatus: detail.allMajorsStatus, sourceStatus: detail.sourceStatus };
      await client.query("UPDATE university_details SET payload=payload || $2::jsonb,updated_at=NOW() WHERE university_id=$1", [detail.id, JSON.stringify(patch)]);
      await client.query(`UPDATE universities u SET search_text=to_tsvector('simple', concat_ws(' ',
        u.name,u.chinese_name,u.city,u.state,u.region,u.payload->>'aliases',u.payload->>'topPrograms',
        (SELECT string_agg(concat_ws(' ', m->>'name',m->>'displayName'),' ') FROM university_details d,
          LATERAL jsonb_array_elements(d.payload->'allMajors') m WHERE d.university_id=u.id)))
        WHERE u.id=$1`, [detail.id]);
    }
    await client.query("COMMIT"); transaction = false;
    console.log(JSON.stringify({ committed: true, schools: details.length, indexedSources: sources.size }));
    // Explicit post-COMMIT comparison prevents a stale count audit from being
    // mistaken for proof that these particular reviewed lists were imported.
    for (const detail of details) {
      const verified = await client.query(`SELECT payload->'allMajors'=$2::jsonb
        AND payload->'allMajorsStatus'=$3::jsonb AS matches FROM university_details WHERE university_id=$1`,
      [detail.id, JSON.stringify(detail.allMajors), JSON.stringify(detail.allMajorsStatus)]);
      if (verified.rows[0]?.matches !== true) throw new Error(`Post-commit mismatch: ${detail.id}`);
    }
    console.log(JSON.stringify({ postCommitVerified: details.map((detail) => detail.id) }));
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
