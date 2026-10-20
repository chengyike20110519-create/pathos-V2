-- Official institution-level research payloads linked to the existing preview IDs.
-- The raw payload is retained so later field mapping does not destroy provenance.
CREATE TABLE IF NOT EXISTS school_research_records (
  university_id TEXT PRIMARY KEY REFERENCES universities(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL,
  official_name TEXT,
  operating BOOLEAN,
  payload JSONB NOT NULL,
  source JSONB NOT NULL,
  retrieved_on DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_research_unit_id
  ON school_research_records(unit_id);
