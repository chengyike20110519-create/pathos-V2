-- Shared editorial content for every university surface.
-- The map, campus discovery and full profile must read the same record.
CREATE TABLE IF NOT EXISTS university_content (
  university_id TEXT PRIMARY KEY REFERENCES universities(id) ON DELETE CASCADE,
  overview_zh TEXT,
  overview_status TEXT NOT NULL DEFAULT 'pending',
  motto TEXT,
  motto_zh TEXT,
  motto_status TEXT NOT NULL DEFAULT 'pending',
  motto_source_url TEXT,
  motto_source_type TEXT,
  motto_checked_on DATE,
  program_spotlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (overview_status IN ('reviewed', 'pending', 'rejected')),
  CHECK (motto_status IN ('confirmed', 'candidate', 'pending', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_university_content_motto_status ON university_content(motto_status);
