import { getPool } from "@/server/db";
import {
  createCoverageReport,
  type CoverageReport,
  type CoverageReviewTaskInput,
  type CoverageSchoolInput,
  type CoverageSourceFailureInput,
} from "@/domain/information/coverage";
import { listApprovedFacts } from "@/server/information/fact-repository";
import { listHotNoResultQueries } from "@/server/information/search-service";

interface UniversityRow {
  id: string;
  name: string;
  chinese_name: string | null;
  preview_only: boolean;
}

interface ReviewTaskRow {
  task_id: string;
  task_type: CoverageReviewTaskInput["taskType"];
  severity: CoverageReviewTaskInput["severity"];
  entity_id: string | null;
  field_key: string | null;
  created_at: Date | string;
}

interface SourceFailureRow {
  source_id: string;
  source_name: string | null;
  failure_count: string | number;
  last_failed_at: Date | string;
  affected_school_ids: string[] | null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function listCoverageSchools(): Promise<CoverageSchoolInput[]> {
  const result = await getPool().query<UniversityRow>(
    `SELECT id, name, chinese_name, preview_only
       FROM universities
      ORDER BY national_ranking ASC NULLS LAST, name ASC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    chineseName: row.chinese_name,
    previewOnly: row.preview_only,
  }));
}

async function listOpenCoverageReviewTasks(): Promise<CoverageReviewTaskInput[]> {
  const result = await getPool().query<ReviewTaskRow>(
    `SELECT t.id AS task_id, t.task_type, t.severity,
            f.entity_id, f.field_key, t.created_at
       FROM review_tasks t
       JOIN facts f ON f.id = t.fact_id
      WHERE t.status IN ('pending', 'recheck')
      ORDER BY t.created_at ASC`,
  );
  return result.rows.map((row) => ({
    taskId: row.task_id,
    taskType: row.task_type,
    severity: row.severity,
    entityId: row.entity_id,
    fieldKey: row.field_key,
    createdAt: iso(row.created_at),
  }));
}

async function listRecentSourceFailures(): Promise<CoverageSourceFailureInput[]> {
  const result = await getPool().query<SourceFailureRow>(
    `SELECT d.source_id,
            s.name AS source_name,
            COUNT(*)::bigint AS failure_count,
            MAX(d.fetched_at) AS last_failed_at,
            ARRAY_AGG(DISTINCT f.entity_id) FILTER (
              WHERE f.entity_id IS NOT NULL AND f.entity_type = 'university'
            ) AS affected_school_ids
       FROM source_documents d
       LEFT JOIN sources s ON s.id = d.source_id
       LEFT JOIN facts f ON f.source_document_id = d.id
      WHERE d.fetch_status IN ('failed', 'blocked')
        AND d.fetched_at >= NOW() - INTERVAL '30 days'
      GROUP BY d.source_id, s.name
      ORDER BY failure_count DESC, last_failed_at DESC
      LIMIT 20`,
  );
  return result.rows.map((row) => ({
    sourceId: row.source_id,
    sourceName: row.source_name ?? row.source_id,
    failureCount: Number(row.failure_count),
    lastFailedAt: iso(row.last_failed_at),
    affectedSchoolIds: row.affected_school_ids ?? [],
  }));
}

export async function buildInformationCoverageReport(now: Date = new Date()): Promise<CoverageReport> {
  const [schools, facts, reviewTasks, sourceFailures, hotNoResultQueries] = await Promise.all([
    listCoverageSchools(),
    listApprovedFacts({ entityType: "university" }),
    listOpenCoverageReviewTasks(),
    listRecentSourceFailures(),
    listHotNoResultQueries(3, 30),
  ]);

  return createCoverageReport({
    schools,
    facts,
    reviewTasks,
    sourceFailures,
    hotNoResultQueries,
    now,
  });
}
