-- Phase 1.4 -- Versioned report share tokens.
--
-- Each report gets a version integer that bumps every time the share
-- token is rotated or revoked. Only the current version hash is
-- accepted by GET; old hashes are not kept on the row, but every
-- failed access is logged in report_access_log so an old link can
-- still be tied back to when it was active.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS plus an UPDATE that defaults
-- any pre-existing row to version 1.

BEGIN;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Keep existing revoked rows but make sure their version reads as 1 so
-- the API surface is uniform.
UPDATE reports SET version = 1 WHERE version IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_version ON reports(version);

INSERT INTO schema_migrations (version) VALUES ('005-report-versions')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
