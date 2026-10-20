-- Track legacy detail source IDs that cannot currently be resolved to a URL.
-- These references remain visible as source-review-pending, never approved facts.
BEGIN;

CREATE TABLE IF NOT EXISTS source_reference_gaps (
  id            TEXT PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  source_id     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'rejected')),
  reason        TEXT NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (university_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_source_reference_gaps_queue
  ON source_reference_gaps(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_reference_gaps_university
  ON source_reference_gaps(university_id, status);

INSERT INTO schema_migrations (version) VALUES ('016-source-reference-gaps')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
