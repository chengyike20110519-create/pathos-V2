import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

type Candidate = { universityId: string; universityName: string; sourceUrl: string; supportingSourceUrls?: string[]; publisher: string; sourceType: string; scope: string[]; checkedOn: string };
const idFor = (prefix: string, url: string) => `${prefix}-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;

async function main() {
  const bundle = JSON.parse(await readFile("data/reviewed/guide-source-candidates.json", "utf8")) as { records: Candidate[] };
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    const index = await client.query<{ payload: { sources?: Array<Record<string, unknown>> } }>("SELECT payload FROM source_index WHERE id=1 FOR UPDATE");
    const payload = index.rows[0]?.payload ?? { sources: [] };
    const sources = Array.isArray(payload.sources) ? [...payload.sources] : [];
    const byId = new Map(sources.map((item) => [String(item.sourceId ?? ""), item]));
    let registered = 0;
    for (const candidate of bundle.records) {
      const urls = [candidate.sourceUrl, ...(candidate.supportingSourceUrls ?? [])];
      for (const sourceUrl of urls) {
      const sourceDbId = idFor("official-source", sourceUrl);
      const documentId = idFor("official-document", sourceUrl);
      await client.query(`INSERT INTO sources
        (id,name,url,authority,source_type,publisher,parser_name,robots_review_status,terms_review_status,fetch_enabled)
        VALUES ($1,$2,$3,'A','official_html',$4,'manual-official-verification','pending','pending',FALSE)
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,publisher=EXCLUDED.publisher,updated_at=NOW()`,
        [sourceDbId, `${candidate.publisher} — ${candidate.universityName}`, sourceUrl, candidate.publisher]);
      await client.query(`INSERT INTO source_documents
        (id,source_id,url,fetch_status,fetch_outcome,error_code,error_message,parser_metadata)
        VALUES ($1,$2,$3,'blocked','blocked','MANUAL_URL_VERIFICATION',
          'Official source registered; automated fetch remains disabled.', $4::jsonb)
        ON CONFLICT (id) DO UPDATE SET source_id=EXCLUDED.source_id,url=EXCLUDED.url,parser_metadata=EXCLUDED.parser_metadata`,
        [documentId, sourceDbId, sourceUrl, JSON.stringify({ universityId: candidate.universityId, scope: candidate.scope, checkedOn: candidate.checkedOn })]);
      if (!byId.has(sourceDbId)) {
        byId.set(sourceDbId, { universityId: candidate.universityId, publisher: candidate.publisher, referenceYear: 2026, scope: candidate.scope, sourceId: sourceDbId, sourceType: candidate.sourceType, status: "verified", url: sourceUrl });
        registered++;
      }
      }
    }
    await client.query("UPDATE source_index SET payload=$1::jsonb,updated_at=NOW() WHERE id=1", [JSON.stringify({ ...payload, sources: [...byId.values()] })]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, registered, totalCandidates: bundle.records.length, fetchEnabled: false }, null, 2));
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
