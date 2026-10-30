// Expected migration ledger, kept in sync with db/migrations/*.sql.
//
// The health endpoint compares this list against the schema_migrations
// table so a deploy that ships new code against an un-migrated database
// reports "degraded" instead of failing later inside a request handler.
//
// When adding db/migrations/00N-*.sql, append its version here.
export const EXPECTED_MIGRATIONS = [
  "001-commercial",
  "002-auth",
  "003-orgs",
  "004-shortlists",
  "005-report-versions",
  "007-track-events",
  "008-information-platform",
  "009-source-fetch-guards",
  "010-review-actions",
  "011-information-search",
  "012-school-research",
  "013-confirmed-policy-facts",
  "014-preview-rls",
  "015-server-only-public-schema",
  "016-source-reference-gaps",
  "017-university-media",
  "018-university-content",
  "019-detail-query-indexes",
] as const;

export interface SchemaReadiness {
  ready: boolean;
  applied: string[];
  missing: string[];
  // Migrations the database has but this deploy does not know about,
  // which usually means the database is ahead of the running code.
  unknown: string[];
}

export function evaluateSchemaReadiness(appliedVersions: string[]): SchemaReadiness {
  const applied = [...appliedVersions].sort();
  const appliedSet = new Set(applied);
  const expectedSet = new Set<string>(EXPECTED_MIGRATIONS);
  const missing = EXPECTED_MIGRATIONS.filter((v) => !appliedSet.has(v));
  const unknown = applied.filter((v) => !expectedSet.has(v));
  return { ready: missing.length === 0, applied, missing, unknown };
}
