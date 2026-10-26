// Read-only snapshot audit. Run with Node's --env-file=.env.local and --import tsx.
// No migrations, data imports, permission changes, VACUUM, or write probes.
import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parseProgramSpotlights } from "../src/schemas/dataset.schema";
import { parseStage5Manifest } from "../src/schemas/stage5-preview.schema";

const report: Record<string, any> = { checkedAt: new Date().toISOString(), scope: "read-only live database snapshot; not a full re-crawl of historical sources", sections: {}, timings: [] };
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required; never pass it on the command line");
// The documented preview command is `pnpm dev:preview` on port 3002.
// Keep PATHOS_PREVIEW_URL as an override for CI or another local port, but
// avoid false API failures when the normal preview server is running.
const previewBaseUrl = (process.env.PATHOS_PREVIEW_URL ?? "http://localhost:3002").replace(/\/$/, "");
const connectionOptions = { connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, query_timeout: 60000, application_name: "pathos_readonly_audit" };
const client = new pg.Client(connectionOptions);
client.on("error", (error) => { report.connectionError = { code: (error as any).code, message: error.message }; });
const record = (value: any): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value: any): any[] => Array.isArray(value) ? value : [];
const strings = (value: any): string[] => list(value).filter((item) => typeof item === "string");
const finite = (value: any): number | null => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const urlValid = (value: any) => typeof value === "string" && /^https?:\/\//.test(value);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const iso = (value: any) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
const counts = (values: any[]) => values.reduce((result, value) => { const key = String(value ?? "missing"); result[key] = (result[key] ?? 0) + 1; return result; }, {} as Record<string, number>);
function sourceIds(value: any, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => sourceIds(item, found));
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (key === "sourceIds") strings(child).forEach((id) => found.add(id));
    else sourceIds(child, found);
  }
  return found;
}
async function query(name: string, sql: string, values: any[] = []) {
  const started = performance.now();
  console.error(`[audit] ${name}`);
  const result = await client.query(sql, values);
  report.timings.push({ name, ms: Math.round(performance.now() - started), rows: result.rowCount });
  return result.rows;
}
async function explain(name: string, sql: string, values: any[] = []) {
  const rows = await query(`explain:${name}`, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, values);
  const plan = rows[0]["QUERY PLAN"][0];
  return { name, planningMs: plan["Planning Time"], executionMs: plan["Execution Time"], plan };
}

async function snapshot() {
  const connectAt = performance.now();
  await client.connect();
  report.initialConnectMs = Math.round(performance.now() - connectAt);
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  // The post-import detail payload is intentionally provenance-rich. Keep
  // the audit read-only, but allow the full snapshot enough time to traverse
  // the JSONB rows over Supabase's shared pooler.
  await client.query("SET LOCAL statement_timeout = 60000");
  try {
    const s = report.sections;
    s.database = (await query("database", `SELECT pg_database_size(current_database())::text AS bytes,
      current_setting('transaction_read_only') AS read_only, current_setting('server_version') AS version,
      current_setting('max_connections') AS max_connections, pg_postmaster_start_time() AS started_at`))[0];
    s.tables = await query("tables", `SELECT c.relname AS name, c.reltuples::bigint::text AS estimated_rows,
      pg_total_relation_size(c.oid)::text AS total_bytes, pg_relation_size(c.oid)::text AS heap_bytes,
      pg_indexes_size(c.oid)::text AS index_bytes, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
      has_table_privilege('anon',c.oid,'SELECT') AS anon_select, has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
      has_table_privilege('anon',c.oid,'UPDATE') AS anon_update, has_table_privilege('anon',c.oid,'DELETE') AS anon_delete,
      has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
      (SELECT COUNT(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY pg_total_relation_size(c.oid) DESC`);
    // Only exact counts, never contents of authentication/student/contact tables.
    s.rowCounts = await query("row-counts", s.tables.map((table: any) => `SELECT '${table.name.replaceAll("'", "''")}' AS name, COUNT(*)::text AS rows FROM public.${quote(table.name)}`).join(" UNION ALL "));
    s.columns = await query("columns", "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
    s.constraints = await query("constraints", `SELECT c.conrelid::regclass::text AS table_name,c.conname,c.contype,c.convalidated,
      pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public' ORDER BY c.conrelid::regclass::text,c.conname`);
    s.indexes = await query("indexes", "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname");
    s.maintenance = await query("maintenance", `SELECT relname,n_live_tup,n_dead_tup,last_autovacuum,last_autoanalyze,
      seq_scan,idx_scan FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_dead_tup DESC`);
    s.connections = await query("connections", `SELECT state,wait_event_type,COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE state='idle in transaction' AND now()-xact_start>interval '60 seconds')::int AS idle_transaction_over_60s
      FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type`);
    s.databaseStats = await query("database-statistics", "SELECT numbackends,xact_commit,xact_rollback,deadlocks,conflicts,temp_bytes,stats_reset FROM pg_stat_database WHERE datname=current_database()");
    s.migrations = await query("migrations", "SELECT version FROM schema_migrations ORDER BY version");
    s.localMigrations = readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort();
    s.policies = await query("policies", "SELECT tablename,policyname,permissive,roles,cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname");
    s.versions = await query("dataset-versions", "SELECT dataset_version,source_status,preview_only,COUNT(*)::int AS count FROM universities GROUP BY dataset_version,source_status,preview_only");
    const manifest = (await query("manifest-contract", "SELECT payload FROM manifest WHERE id=1"))[0]?.payload;
    s.expansionReplay = [];
    const manifestCounts = manifest?.counts && typeof manifest.counts === "object" ? manifest.counts as Record<string, unknown> : {};
    for (const [label, candidate] of [["current_dataset", manifest], ["metadata_updated_to_95", {
      ...manifest, schoolCount: 95, summaryCount: 95, detailCount: 95,
      counts: { ...manifestCounts, universities: 95 },
    }], ["mismatched_detail_count", {
      ...manifest, detailCount: Number(manifest?.detailCount) + 1,
    }]] as const) {
      try { parseStage5Manifest(candidate); s.expansionReplay.push({ label, accepted: true }); }
      catch (error) { s.expansionReplay.push({ label, accepted: false, message: (error as Error).message }); }
    }
    const schemaCode = readFileSync("src/schemas/stage5-preview.schema.ts", "utf8");
    s.transformChecks = { fixedRmbPerUsd: schemaCode.match(/const RMB_PER_USD = ([\d.]+)/)?.[1],
      programCatalogSchoolLimit: 5000, initialMapLimit: 250,
      explanation: "Code inspection only; no database values changed. School expansion replay changes an in-memory manifest only." };
    s.integrity = (await query("integrity", `SELECT
      (SELECT count(*) FROM universities u LEFT JOIN university_details d ON d.university_id=u.id WHERE d.university_id IS NULL)::int AS schools_without_detail,
      (SELECT count(*) FROM university_details d LEFT JOIN universities u ON u.id=d.university_id WHERE u.id IS NULL)::int AS orphan_details,
      (SELECT count(*) FROM school_research_records r LEFT JOIN universities u ON u.id=r.university_id WHERE u.id IS NULL)::int AS orphan_research,
      (SELECT count(*) FROM school_confirmed_facts f LEFT JOIN universities u ON u.id=f.university_id WHERE u.id IS NULL)::int AS orphan_confirmed_facts,
      (SELECT count(*) FROM universities WHERE latitude IS NULL OR longitude IS NULL OR latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180)::int AS invalid_coordinates,
      (SELECT count(*) FROM (SELECT lower(trim(name)) FROM universities GROUP BY lower(trim(name)) HAVING count(*)>1) x)::int AS duplicate_normalized_names,
      (SELECT count(*) FROM (SELECT unit_id FROM school_research_records GROUP BY unit_id HAVING count(*)>1) x)::int AS duplicate_unit_ids,
      (SELECT count(*) FROM (SELECT university_id,fact_type FROM school_confirmed_facts GROUP BY university_id,fact_type HAVING count(*)>1) x)::int AS duplicate_fact_keys,
      (SELECT count(*) FROM university_details WHERE payload->>'id' IS DISTINCT FROM university_id)::int AS detail_id_mismatch`))[0];
    s.guides = await query("guides", `SELECT source_snapshot_year,source_status,COUNT(*)::int AS records,
      COUNT(DISTINCT university_id)::int AS linked_schools,COUNT(*) FILTER (WHERE university_id IS NULL)::int AS unlinked,
      COUNT(*) FILTER (WHERE source_url IS NULL OR source_url='')::int AS missing_source_url
      FROM college_guides GROUP BY source_snapshot_year,source_status ORDER BY source_snapshot_year`);
    s.factsByType = await query("confirmed-facts-status", `SELECT fact_type,status,COUNT(*)::int AS count,
      MIN(confirmed_on)::text AS earliest,MAX(confirmed_on)::text AS latest FROM school_confirmed_facts GROUP BY fact_type,status ORDER BY fact_type,status`);
    s.reviewFacts = await query("facts-pipeline", "SELECT review_status,entity_type,COUNT(*)::int AS count FROM facts GROUP BY review_status,entity_type");
    s.reviewQueue = await query("review-queue", "SELECT status,severity,COUNT(*)::int AS count FROM review_tasks GROUP BY status,severity");
    s.structuredFactChain = (await query("structured-fact-chain", `SELECT
      (SELECT COUNT(*)::int FROM facts) AS facts,
      (SELECT COUNT(*)::int FROM facts WHERE review_status='approved') AS approved_facts,
      (SELECT COUNT(*)::int FROM facts WHERE source_url ~ '^https?://') AS facts_with_openable_urls,
      (SELECT COUNT(*)::int FROM facts WHERE source_document_id IS NOT NULL) AS facts_with_source_documents,
      (SELECT COUNT(*)::int FROM facts WHERE review_status='approved' AND source_document_id IS NULL) AS approved_without_documents,
      (SELECT COUNT(*)::int FROM source_documents) AS source_documents,
      (SELECT COUNT(*)::int FROM source_documents WHERE fetch_status='succeeded') AS fetched_documents,
      (SELECT COUNT(*)::int FROM source_documents WHERE fetch_status IN ('blocked','failed')) AS blocked_or_failed_documents,
      (SELECT COUNT(*)::int FROM fact_revisions) AS fact_revisions,
      (SELECT COUNT(*)::int FROM review_tasks WHERE status IN ('pending','recheck')) AS open_review_tasks`))[0];
    const sourceIndexRow = (await query("source-index", "SELECT payload,updated_at FROM source_index WHERE id=1"))[0];
    const sources = list(sourceIndexRow?.payload?.sources);
    const indexedIds = new Set(sources.map((source) => source.sourceId));
    s.sourceIndex = { entries: sources.length, distinctIds: indexedIds.size, invalidUrls: sources.filter((source) => !urlValid(source.url)).length,
      byStatus: counts(sources.map((source) => source.status)), byReferenceYear: counts(sources.map((source) => source.referenceYear)), updatedAt: sourceIndexRow?.updated_at };
    s.directoryStatistics = (await query("directory-statistics", `WITH majors AS (
      SELECT jsonb_array_elements(payload->'allMajors') AS item FROM university_details
    ), names AS (SELECT CASE WHEN jsonb_typeof(item)='string' THEN item#>>'{}' ELSE item->>'name' END AS name,item FROM majors)
    SELECT count(*)::int AS entries,count(DISTINCT lower(trim(name)))::int AS exact_distinct_names,
      count(*) FILTER (WHERE jsonb_typeof(item)='string')::int AS string_entries,
      (SELECT jsonb_object_agg(kind,n) FROM (SELECT COALESCE(item->>'listType',item->>'kind','missing') AS kind,count(*)::int AS n FROM majors GROUP BY 1) x) AS list_type_distribution
    FROM names`))[0];
    const schoolDataSql = `SELECT u.id,u.name,u.chinese_name,u.city,u.state,u.latitude,u.longitude,u.national_ranking,
      jsonb_build_object('acceptanceRate',u.payload->'acceptanceRate','admissions',u.payload->'admissions') AS summary,
      jsonb_build_object(
        'id',d.payload->'id', 'allMajors',d.payload->'allMajors',
        'programs',d.payload->'programs', 'topPrograms',d.payload->'topPrograms',
        'admissions',d.payload->'admissions', 'enrollment',d.payload->'enrollment',
        'rawCostRecords',d.payload->'rawCostRecords', 'warningSummary',d.payload->'warningSummary'
      ) AS detail,
      u.updated_at AS summary_updated_at,d.updated_at AS detail_updated_at,
      r.unit_id,r.retrieved_on::text AS retrieved_on,r.source AS research_source,jsonb_build_object('ADM_RATE',r.payload->'ADM_RATE',
      'UGDS',r.payload->'UGDS','C150_4',r.payload->'C150_4','RET_FT4',r.payload->'RET_FT4',
      'SATVR25',r.payload->'SATVR25','SATVR75',r.payload->'SATVR75','SATMT25',r.payload->'SATMT25','SATMT75',r.payload->'SATMT75',
      'TUITIONFEE_IN',r.payload->'TUITIONFEE_IN','TUITIONFEE_OUT',r.payload->'TUITIONFEE_OUT') AS metrics,
      pg_column_size(d.payload)::int AS stored_detail_bytes,octet_length(d.payload::text)::int AS logical_detail_bytes
      FROM universities u LEFT JOIN university_details d ON d.university_id=u.id
      LEFT JOIN school_research_records r ON r.university_id=u.id ORDER BY u.name LIMIT $1 OFFSET $2`;
    const schoolRows: any[] = [];
    // The shared pooler can time out while serializing several large JSONB
    // payloads at once. One school per read keeps the audit complete and
    // deterministic without weakening the read-only contract.
    const schoolBatchSize = 1;
    for (let offset = 0; ; offset += schoolBatchSize) {
      const batch = await query(`school-data:${offset}-${offset + schoolBatchSize}`, schoolDataSql, [schoolBatchSize, offset]);
      schoolRows.push(...batch);
      if (batch.length < schoolBatchSize) break;
    }
    const confirmed = await query("confirmed-highlights", "SELECT university_id,fact_type,fact,status,source_url,confirmed_on::text AS confirmed_on FROM school_confirmed_facts ORDER BY university_id,fact_type");
    const spotlights = new Map<string, any[]>();
    s.invalidSpotlightRecords = [];
    for (const fact of confirmed.filter((fact) => fact.fact_type === "program_spotlights_v1")) {
      try {
        const raw = JSON.parse(fact.fact), parsed = parseProgramSpotlights(raw);
        if (!Array.isArray(raw) || parsed.length !== raw.length || fact.status !== "confirmed") s.invalidSpotlightRecords.push(fact.university_id);
        else spotlights.set(fact.university_id, parsed);
      } catch { s.invalidSpotlightRecords.push(fact.university_id); }
    }
    s.invalidConfirmedSources = confirmed.filter((fact) => !urlValid(fact.source_url)).map((fact) => ({ id: fact.university_id, type: fact.fact_type }));
    const admissionsFields = ["acceptanceRate", "graduationRate", "retentionRate", "sat", "act", "testPolicy", "englishPolicy"];
    s.schools = schoolRows.map((school) => {
      const d = record(school.detail), summary = record(school.summary), metrics = record(school.metrics);
      const majors = list(d.allMajors).map((major) => typeof major === "string" ? major : major.name ?? major.displayName).filter((name) => typeof name === "string" && name.trim()).map((name: string) => name.trim());
      const majorKeys = majors.map((name: string) => name.toLowerCase());
      const ids = sourceIds(d), missingSources = [...ids].filter((id) => !indexedIds.has(id));
      const highlights = spotlights.get(school.id) ?? [];
      const staleFields: string[] = [], oldValuedFields: string[] = [], emptyFields: string[] = [], valueWithoutSources: string[] = [], years: Record<string, any> = {};
      for (const group of ["admissions", "enrollment"]) for (const [key, field] of Object.entries(record(d[group]))) {
        const f = record(field), path = `${group}.${key}`;
        if (Object.keys(f).length === 0 || !Array.isArray(f.sourceIds)) emptyFields.push(path);
        years[path] = f.referenceYear ?? null;
        if (f.value !== null && f.value !== undefined && strings(f.sourceIds).length === 0) valueWithoutSources.push(path);
        if (finite(f.referenceYear) !== null && Number(f.referenceYear) < 2024) {
          staleFields.push(path);
          if (f.value !== null && f.value !== undefined) oldValuedFields.push(path);
        }
      }
      const rawCosts = list(d.rawCostRecords);
      const policyFacts = confirmed.filter((fact) => fact.university_id === school.id && fact.fact_type !== "program_spotlights_v1");
      const metricCoverage = Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, finite(value) !== null]));
      const metricIssues: string[] = [];
      for (const key of ["ADM_RATE", "C150_4", "RET_FT4"]) { const n = finite(metrics[key]); if (n !== null && (n < 0 || n > 1)) metricIssues.push(`${key}:out_of_range`); }
      for (const key of ["UGDS", "TUITIONFEE_IN", "TUITIONFEE_OUT"]) { const n = finite(metrics[key]); if (n !== null && n < 0) metricIssues.push(`${key}:negative`); }
      for (const prefix of ["SATVR", "SATMT"]) { const a = finite(metrics[`${prefix}25`]), b = finite(metrics[`${prefix}75`]); if (a !== null && b !== null && (a > b || a < 200 || b > 800)) metricIssues.push(`${prefix}:invalid_interval`); }
      return { id: school.id, name: school.name, nameZh: school.chinese_name, city: school.city, state: school.state,
        hasResearch: !!school.unit_id, researchRetrievedOn: iso(school.retrieved_on), researchSourceMetadata: school.research_source,
        hasCity: !!school.city, hasNationalRank: school.national_ranking !== null,
        majors: majors.length, distinctMajors: new Set(majorKeys).size, duplicateMajors: majors.length - new Set(majorKeys).size,
        majorsMissingSourceIds: list(d.allMajors).filter((major) => typeof major === "string" || !strings(major?.sourceIds).length).length,
        programSourceStatus: counts(list(d.allMajors).map((major) => record(major).status)),
        strengths: highlights.filter((program) => program.kind === "strength").length,
        distinctive: highlights.filter((program) => program.kind === "distinctive").length,
        spotlightNames: highlights.map((program) => ({ name: program.name, kind: program.kind, year: program.rankingYear, sourceUrl: program.sourceUrl, checkedOn: program.checkedOn })),
        spotlightMissingFromDirectory: highlights.filter((program) => !majorKeys.includes(program.name.toLowerCase())).map((program) => program.name),
        rawCostRecords: rawCosts.length, costYears: counts(rawCosts.map((cost) => cost.academicYear)),
        costsWithUnknownScope: rawCosts.filter((cost) => !["international", "in_state", "out_of_state"].includes(cost.scope)).length,
        costsMissingSourceIds: rawCosts.filter((cost) => !strings(cost.sourceIds).length).length,
        referencedSourceIds: ids.size, danglingSourceIds: missingSources,
        emptyMetadataFields: emptyFields, valueWithoutMetadataSourceIds: valueWithoutSources, oldMetadataFields: staleFields, oldValuedMetadataFields: oldValuedFields, metadataYears: years,
        admissionStatus: Object.fromEntries(admissionsFields.map((key) => [key, record(record(d.admissions)[key]).status ?? "missing"])),
        metrics: metricCoverage, invalidMetrics: metricIssues,
        policyFacts: policyFacts.map((fact) => ({ type: fact.fact_type, status: fact.status, sourceUrl: fact.source_url, confirmedOn: iso(fact.confirmed_on) })),
        warningCodes: strings(record(d.warningSummary).codes), summaryUpdatedAt: school.summary_updated_at, detailUpdatedAt: school.detail_updated_at,
        storedDetailBytes: school.stored_detail_bytes, logicalDetailBytes: school.logical_detail_bytes,
        sourceBackedDisplayCandidates: Object.fromEntries(["ADM_RATE", "UGDS", "TUITIONFEE_OUT"].map((key) => [key, metricCoverage[key]])),
        summaryMissingAcceptance: summary.acceptanceRate == null && record(summary.admissions).acceptanceRate == null };
    });
    s.coverage = {
      schools: s.schools.length, withDirectory: s.schools.filter((school: any) => school.distinctMajors > 0).length,
      directoryEntries: s.schools.reduce((sum: number, school: any) => sum + school.majors, 0),
      strengthSchools: s.schools.filter((school: any) => school.strengths > 0).length,
      strengthEntries: s.schools.reduce((sum: number, school: any) => sum + school.strengths, 0),
      distinctiveSchools: s.schools.filter((school: any) => school.distinctive > 0).length,
      distinctiveEntries: s.schools.reduce((sum: number, school: any) => sum + school.distinctive, 0),
      metadataShapeIssueSchools: s.schools.filter((school: any) => school.emptyMetadataFields.length).length,
      oldMetadataSchools: s.schools.filter((school: any) => school.oldMetadataFields.length).length,
      oldValuedMetadataSchools: s.schools.filter((school: any) => school.oldValuedMetadataFields.length).length,
      danglingSourceSchools: s.schools.filter((school: any) => school.danglingSourceIds.length).length,
      missingDirectorySourceEntries: s.schools.reduce((sum: number, school: any) => sum + school.majorsMissingSourceIds, 0),
      duplicateDirectoryEntries: s.schools.reduce((sum: number, school: any) => sum + school.duplicateMajors, 0),
      metricCoverage: Object.fromEntries(Object.keys(s.schoolRows ?? schoolRows[0]?.metrics ?? {}).map((key) => [key, s.schools.filter((school: any) => school.metrics[key]).length])),
      admissionStatus: Object.fromEntries(admissionsFields.map((field) => [field, counts(s.schools.map((school: any) => school.admissionStatus[field]))])),
    };
    s.provenanceGate = {
      danglingSourceSchools: s.coverage.danglingSourceSchools,
      missingDirectorySourceEntries: s.coverage.missingDirectorySourceEntries,
      sourceReferenceGaps: (await query("source-reference-gaps", `SELECT status, COUNT(*)::int AS count
        FROM source_reference_gaps GROUP BY status ORDER BY status`)),
      policy: "unresolved source IDs remain quarantined; they are not promoted to approved facts",
    };
    s.queryPlans = [
      await explain("map-state", "SELECT id,name,chinese_name,latitude,longitude FROM universities WHERE state=$1", ["CA"]),
      await explain("program-membership", `SELECT u.id FROM universities u WHERE EXISTS (SELECT 1 FROM university_details d,
        LATERAL jsonb_array_elements(COALESCE(d.payload->'allMajors','[]'::jsonb)) item
        WHERE d.university_id=u.id AND lower(trim(CASE WHEN jsonb_typeof(item)='string' THEN item#>>'{}' ELSE item->>'name' END))=lower($1))`, ["Computer Science"]),
      await explain("detail-source-join", `SELECT d.university_id,
        (SELECT jsonb_agg(entry.doc) FROM source_index si, jsonb_array_elements(si.payload->'sources') entry(doc)
         WHERE si.id=1 AND entry.doc->>'sourceId' IN (SELECT jsonb_path_query(d.payload,'$.**.sourceIds[*]')#>>'{}')) AS sources,
        r.payload->'ADM_RATE' AS rate FROM university_details d LEFT JOIN school_research_records r ON r.university_id=d.university_id WHERE d.university_id=$1`, [schoolRows[0].id]),
    ];
    s.localBackupEvidence = existsSync("backups") ? readdirSync("backups").filter((name) => /\.(dump|sql|gz|json|sha256)$/.test(name)) : [];
    s.accessBoundary = { dataApiSchemasSetting: (await query("data-api-schema-setting", "SELECT current_setting('pgrst.db_schemas',true) AS value"))[0]?.value,
      publicSupabaseKeyConfiguredLocally: Object.keys(process.env).some((key) => /^(NEXT_PUBLIC_)?SUPABASE_(ANON|PUBLISHABLE)_KEY$/.test(key) && !!process.env[key]),
      dashboardPlanEgressBackupStatusVerified: false, privateUserRowsRead: false };
    // Session-only role switch inside a read-only transaction. Count school
    // rows to verify effective permissions, never inspect private records or
    // attempt INSERT/UPDATE/DELETE as an anonymous user.
    await client.query("SET LOCAL ROLE anon");
    try {
      s.anonymousVisibilityProbe = (await query("anonymous-count-only", `SELECT current_user AS role,
        (SELECT count(*)::int FROM public.universities) AS protected_universities_visible,
        (SELECT count(*)::int FROM public.school_research_records) AS research_records_visible,
        (SELECT count(*)::int FROM public.college_guides) AS guides_visible,
        (SELECT count(*)::int FROM public.school_confirmed_facts) AS confirmed_facts_visible`))[0];
    } catch (error) {
      const code = (error as any)?.code;
      if (code !== "42501") throw error;
      s.anonymousVisibilityProbe = { role: "anon", denied: true, code, message: "anonymous table reads denied as expected" };
      await client.query("ROLLBACK");
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = 60000");
    }
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ phase: "snapshot", databaseBytes: s.database.bytes, coverage: s.coverage, unsafeRlsTables: s.tables.filter((table: any) => !table.rls && (table.anon_select || table.anon_insert || table.anon_update || table.anon_delete)).map((table: any) => table.name) }));
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await client.end(); }
}

async function probes() {
  report.connectionProbes = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    const probe = new pg.Client({ ...connectionOptions, options: "-c default_transaction_read_only=on" });
    probe.on("error", () => {});
    const start = performance.now();
    try {
      await probe.connect(); const connected = performance.now();
      const warm: number[] = [];
      for (let i = 0; i < 3; i++) { const q = performance.now(); await probe.query("SELECT 1"); warm.push(Math.round(performance.now() - q)); }
      report.connectionProbes.push({ attempt, ok: true, connectMs: Math.round(connected - start), warmQueryMs: warm });
    } catch (error) { report.connectionProbes.push({ attempt, ok: false, ms: Math.round(performance.now() - start), code: (error as any).code ?? "CONNECTION_FAILURE" }); }
    finally { await probe.end().catch(() => {}); }
    console.log(JSON.stringify({ phase: "connection-probe", ...report.connectionProbes.at(-1) }));
  }
  report.apiProbes = [];
  for (const path of ["/api/health", "/api/ready", "/api/pathos/preview?endpoint=universities&state=CA", "/api/pathos/preview?endpoint=program-options&q=Computer%20Science", "/api/pathos/preview?endpoint=university&id=candidate-v2%3Astanford-university", "/api/information/facts?entityType=university&entityId=candidate-v2%3Astanford-university"]) {
    const start = performance.now();
    try {
      const response = await fetch(`${previewBaseUrl}${path}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
      const text = await response.text(); let body: any; try { body = JSON.parse(text); } catch { body = {}; }
      report.apiProbes.push({ path, status: response.status, ms: Math.round(performance.now() - start), bytes: Buffer.byteLength(text),
        code: body.code, schema: body.schema, statusLabel: body.status, schools: body.universities,
        returnedItems: Array.isArray(body) ? body.length : undefined, factCount: body.profile?.totalFacts });
    } catch (error) { report.apiProbes.push({ path, status: 0, ms: Math.round(performance.now() - start), code: (error as Error).name }); }
    console.log(JSON.stringify({ phase: "api-probe", ...report.apiProbes.at(-1) }));
  }
}

async function main() {
  try { await snapshot(); await probes(); }
  catch (error) { report.failure = { message: (error as Error).message, code: (error as any).code }; process.exitCode = 1; }
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/supabase-backend-audit.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ saved: "test-results/supabase-backend-audit.json", failure: report.failure ?? null }));
}
void main();
