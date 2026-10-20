-- Phase 1.7 -- Lightweight event tracking.
--
-- A single table to record minimal client-side events (button clicks,
-- conversion events, share-link opens). We deliberately do NOT track
-- per-element details; the table is small, the schema is wide.
--
-- PII posture:
--   - user_id is nullable and only populated when the visitor is
--     authenticated; it links to auth_users.id for funnel analysis.
--   - ip_hash is the salted SHA-256 of the request IP (see
--     lib/report-access.hashIp). Raw IPs are never stored.
--   - user_agent is truncated to 300 chars to keep rows small.
--
-- Why no FK on user_id: a deletion of an auth_users row should not
-- cascade through analytics; an orphaned event row is harmless.

BEGIN;

CREATE TABLE IF NOT EXISTS track_events (
  id            BIGSERIAL PRIMARY KEY,
  type          TEXT NOT NULL,
  path          TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id       TEXT,
  ip_hash       TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_track_events_type ON track_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_events_path ON track_events(path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_events_user ON track_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_events_created ON track_events(created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('007-track-events')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
