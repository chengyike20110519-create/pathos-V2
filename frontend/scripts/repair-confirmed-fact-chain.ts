import { createHash } from "node:crypto";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("BEGIN");
  try {
    const facts = await client.query<{
      university_id: string;
      fact: string;
      status: string;
      source_url: string;
      confirmed_on: string;
    }>(`
      SELECT university_id, fact, status, source_url, confirmed_on::text AS confirmed_on
        FROM school_confirmed_facts
       WHERE fact_type = 'admissions_testing_policy'
         AND source_url ~ '^https?://'
       ORDER BY university_id
    `);

    let sourceCount = 0;
    let documentCount = 0;
    let factCount = 0;
    let revisionCount = 0;
    for (const row of facts.rows) {
      const sourceKey = hash(row.source_url);
      const sourceId = `confirmed-policy-source-${sourceKey}`;
      const documentId = `confirmed-policy-document-${sourceKey}`;
      const factId = `fact-${hash(`${row.university_id}:admissions.testing_policy`)}`;
      const revisionId = `revision-${hash(`${factId}:1`)}`;
      const year = row.confirmed_on.slice(0, 4);

      await client.query(
        `INSERT INTO sources
          (id, name, url, authority, source_type, publisher, parser_name,
           rate_limit_seconds, is_active, robots_review_status, terms_review_status,
           fetch_enabled, user_agent)
         VALUES ($1,$2,$3,'A','official_html',$4,'confirmed-policy-import',3600,TRUE,
                 'pending','pending',FALSE,'PathOS-Information-Platform/1.0')
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, url=EXCLUDED.url, publisher=EXCLUDED.publisher,
           updated_at=NOW()` ,
        [sourceId, `Official admissions policy — ${row.university_id}`, row.source_url, new URL(row.source_url).hostname],
      );
      sourceCount++;

      await client.query(
        `INSERT INTO source_documents
          (id, source_id, url, fetch_status, fetch_outcome, error_code,
           error_message, parser_metadata)
         VALUES ($1,$2,$3,'blocked','blocked','IMPORTED_CONFIRMED_FACT',
                 'Imported from the existing confirmed fact ledger; no new fetch was claimed.',
                 $4::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           source_id=EXCLUDED.source_id, url=EXCLUDED.url,
           fetch_status=EXCLUDED.fetch_status, fetch_outcome=EXCLUDED.fetch_outcome,
           error_code=EXCLUDED.error_code, error_message=EXCLUDED.error_message,
           parser_metadata=EXCLUDED.parser_metadata`,
        [documentId, sourceId, row.source_url, JSON.stringify({ importedFrom: "school_confirmed_facts", confirmedOn: row.confirmed_on })],
      );
      documentCount++;

      await client.query(
        `INSERT INTO facts
          (id, fact_key, entity_type, entity_id, field_key, value_type,
           value_text, academic_year, applicant_scope, source_id,
           source_document_id, source_url, retrieved_at, reviewed_at,
           review_status, confidence, notes)
         VALUES ($1,$2,'university',$3,'admissions.testing_policy','text',
                 $4,$5,'undergraduate',$6,$7,$8,$9::timestamptz,$9::timestamptz,
                 'approved','high',$10)
         ON CONFLICT (id) DO UPDATE SET
           value_text=EXCLUDED.value_text, academic_year=EXCLUDED.academic_year,
           source_id=EXCLUDED.source_id, source_document_id=EXCLUDED.source_document_id,
           source_url=EXCLUDED.source_url, retrieved_at=EXCLUDED.retrieved_at,
           reviewed_at=EXCLUDED.reviewed_at, review_status=EXCLUDED.review_status,
           confidence=EXCLUDED.confidence, notes=EXCLUDED.notes, updated_at=NOW()`,
        [factId, `${row.university_id}:admissions.testing_policy`, row.university_id, row.fact,
          year, sourceId, documentId, row.source_url, `${row.confirmed_on}T12:00:00Z`,
          "Migrated from the existing confirmed admissions-policy ledger. Source fetch remains disabled until access review is completed."],
      );
      factCount++;

      await client.query(
        `INSERT INTO fact_revisions
          (id, fact_id, revision_number, entity_type, entity_id, field_key,
           value_type, value_text, academic_year, applicant_scope, source_id,
           source_document_id, source_url, retrieved_at, reviewed_at,
           review_status, confidence, change_reason)
         VALUES ($1,$2,1,'university',$3,'admissions.testing_policy','text',
                 $4,$5,'undergraduate',$6,$7,$8,$9::timestamptz,$9::timestamptz,
                 'approved','high','Initial structured import from confirmed fact ledger.')
         ON CONFLICT (id) DO UPDATE SET
           value_text=EXCLUDED.value_text, source_id=EXCLUDED.source_id,
           source_document_id=EXCLUDED.source_document_id, source_url=EXCLUDED.source_url,
           retrieved_at=EXCLUDED.retrieved_at, reviewed_at=EXCLUDED.reviewed_at,
           review_status=EXCLUDED.review_status, confidence=EXCLUDED.confidence,
           change_reason=EXCLUDED.change_reason`,
        [revisionId, factId, row.university_id, row.fact, year, sourceId, documentId,
          row.source_url, `${row.confirmed_on}T12:00:00Z`],
      );
      revisionCount++;
    }

    const indexedRows = await client.query<{ payload: { sources?: Array<{ sourceId?: string }> } }>(
      "SELECT payload FROM source_index WHERE id=1",
    );
    const indexedSourceIds = new Set(
      (indexedRows.rows[0]?.payload?.sources ?? []).map((source) => source.sourceId).filter(Boolean),
    );
    const danglingRows = await client.query<{ university_id: string; source_id: string }>(`
      SELECT DISTINCT d.university_id, value #>> '{}' AS source_id
        FROM university_details d
        CROSS JOIN LATERAL jsonb_path_query(d.payload, '$.**.sourceIds[*]') value
       ORDER BY d.university_id, source_id
    `);
    const gaps = danglingRows.rows
      .filter((row) => !indexedSourceIds.has(row.source_id))
      .map((gap) => ({
        id: `source-gap-${hash(`${gap.university_id}:${gap.source_id}`)}`,
        university_id: gap.university_id,
        source_id: gap.source_id,
        status: "pending",
        reason: "Legacy detail source ID has no matching source_index URL; manual official-source recovery required.",
        metadata: { sourceIndexLookup: "not_found", publicStatus: "source_review_not_completed" },
      }));
    if (gaps.length > 0) {
      await client.query(
        `INSERT INTO source_reference_gaps
          (id, university_id, source_id, status, reason, metadata)
         SELECT id, university_id, source_id, status, reason, metadata::jsonb
           FROM jsonb_to_recordset($1::jsonb)
             AS rows(id text, university_id text, source_id text, status text, reason text, metadata jsonb)
         ON CONFLICT (university_id, source_id) DO UPDATE SET
           status=CASE WHEN source_reference_gaps.status='resolved' THEN 'resolved' ELSE EXCLUDED.status END,
           reason=EXCLUDED.reason, metadata=EXCLUDED.metadata, updated_at=NOW()`,
        [JSON.stringify(gaps)],
      );
    }
    const gapCount = gaps.length;
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, sourceCount, documentCount, factCount, revisionCount, sourceReferenceGaps: gapCount }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
