-- Officially confirmed admissions-policy facts, kept separate from raw research.
CREATE TABLE IF NOT EXISTS school_confirmed_facts (
  id BIGSERIAL PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  fact_type TEXT NOT NULL DEFAULT 'admissions_testing_policy',
  fact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  source_url TEXT NOT NULL,
  confirmed_on DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (university_id, fact_type)
);

CREATE INDEX IF NOT EXISTS idx_school_confirmed_facts_university
  ON school_confirmed_facts(university_id);
