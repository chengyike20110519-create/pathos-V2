-- Detail-card query indexes.
-- The university card asks for the newest guide for one school. The
-- composite index lets PostgreSQL satisfy the filter and DESC/LIMIT 1
-- together instead of scanning the separate indexes and sorting.
CREATE INDEX IF NOT EXISTS idx_college_guides_university_snapshot
  ON college_guides(university_id, source_snapshot_year DESC);

-- Keep the migration idempotent for local preview and Supabase re-runs.
INSERT INTO schema_migrations (version) VALUES ('019-detail-query-indexes')
  ON CONFLICT (version) DO NOTHING;
