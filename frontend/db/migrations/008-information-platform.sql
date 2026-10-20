-- WP01 -- Information platform foundation.
--
-- The tables in this migration form an append-mostly information ledger:
--   sources             what we are allowed to retrieve and how authoritative it is
--   source_documents    one row per retrieval attempt / immutable document identity
--   facts               the current version of each scoped machine-readable fact
--   fact_revisions      every published value that ever occupied a fact slot
--   review_tasks        operator queue for changes, conflicts, and stale values
--   information_events  user-facing "what changed and why it matters" records
--
-- Design rule: `facts` is the only table public queries need to touch. It is
-- current, indexed, and small. Historical values live in fact_revisions and are
-- never overwritten.

BEGIN;

CREATE TABLE IF NOT EXISTS sources (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  url                TEXT NOT NULL UNIQUE,
  authority          TEXT NOT NULL
    CHECK (authority IN ('A', 'B', 'C', 'D', 'E', 'F')),
  source_type        TEXT NOT NULL
    CHECK (source_type IN ('official_html', 'pdf', 'csv', 'json_api', 'common_data_set', 'ipeds')),
  publisher          TEXT,
  license_note       TEXT,
  parser_name        TEXT NOT NULL DEFAULT 'generic',
  rate_limit_seconds INTEGER NOT NULL DEFAULT 3600
    CHECK (rate_limit_seconds >= 0),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sources_authority ON sources(authority, is_active);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type, is_active);

CREATE TABLE IF NOT EXISTS source_documents (
  id                TEXT PRIMARY KEY,
  source_id         TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  http_status       INTEGER,
  content_hash      TEXT,
  fetch_duration_ms INTEGER
    CHECK (fetch_duration_ms IS NULL OR fetch_duration_ms >= 0),
  response_bytes    INTEGER
    CHECK (response_bytes IS NULL OR response_bytes >= 0),
  fetch_status      TEXT NOT NULL
    CHECK (fetch_status IN ('succeeded', 'failed', 'blocked')),
  error_code        TEXT,
  error_message     TEXT,
  parser_metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_source_documents_source ON source_documents(source_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_documents_status ON source_documents(fetch_status, fetched_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_documents_hash
  ON source_documents(source_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS facts (
  id                 TEXT PRIMARY KEY,
  fact_key           TEXT NOT NULL UNIQUE,
  entity_type        TEXT NOT NULL
    CHECK (entity_type IN ('university', 'program', 'major', 'location', 'scholarship', 'opportunity')),
  entity_id          TEXT NOT NULL,
  field_key          TEXT NOT NULL,
  value_type         TEXT NOT NULL
    CHECK (value_type IN ('number', 'currency', 'percent', 'date', 'text', 'boolean', 'enum', 'range', 'list')),
  value_number       NUMERIC,
  value_text         TEXT,
  value_boolean      BOOLEAN,
  value_range_min    NUMERIC,
  value_range_max    NUMERIC,
  value_list         JSONB,
  unit               TEXT,
  currency           TEXT
    CHECK (currency IS NULL OR currency IN ('USD', 'CNY')),
  academic_year      TEXT,
  effective_from     TIMESTAMPTZ,
  effective_to       TIMESTAMPTZ,
  applicant_scope    TEXT
    CHECK (applicant_scope IS NULL OR applicant_scope IN ('all', 'international', 'undergraduate', 'graduate')),
  source_id          TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  source_document_id TEXT,
  source_url         TEXT NOT NULL,
  retrieved_at       TIMESTAMPTZ NOT NULL,
  reviewed_at        TIMESTAMPTZ,
  review_status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'stale')),
  confidence         TEXT NOT NULL
    CHECK (confidence IN ('high', 'medium', 'low')),
  null_reason        TEXT
    CHECK (null_reason IS NULL OR null_reason IN (
      'not_reported', 'not_applicable', 'source_blocked', 'source_unavailable',
      'source_review_not_completed', 'requires_manual_review'
    )),
  notes              TEXT,
  current_revision   INTEGER NOT NULL DEFAULT 1
    CHECK (current_revision > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, source_id),
  CONSTRAINT fk_fact_source_document
    FOREIGN KEY (source_document_id, source_id)
      REFERENCES source_documents(id, source_id) ON DELETE RESTRICT,
  CONSTRAINT chk_fact_range
    CHECK (value_range_min IS NULL OR value_range_max IS NULL OR value_range_min <= value_range_max),
  CONSTRAINT chk_fact_null_not_value
    CHECK (
      null_reason IS NULL OR (
        value_number IS NULL AND value_text IS NULL AND value_boolean IS NULL AND
        value_range_min IS NULL AND value_range_max IS NULL AND value_list IS NULL
      )
    )
);
CREATE INDEX IF NOT EXISTS idx_facts_entity ON facts(entity_type, entity_id, field_key);
CREATE INDEX IF NOT EXISTS idx_facts_public ON facts(review_status, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_facts_year ON facts(academic_year, entity_type);
CREATE INDEX IF NOT EXISTS idx_facts_effective ON facts(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_facts_source ON facts(source_id, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS fact_revisions (
  id                 TEXT PRIMARY KEY,
  fact_id            TEXT NOT NULL REFERENCES facts(id) ON DELETE RESTRICT,
  revision_number    INTEGER NOT NULL
    CHECK (revision_number > 0),
  entity_type        TEXT NOT NULL,
  entity_id          TEXT NOT NULL,
  field_key          TEXT NOT NULL,
  value_type         TEXT NOT NULL,
  value_number       NUMERIC,
  value_text         TEXT,
  value_boolean      BOOLEAN,
  value_range_min    NUMERIC,
  value_range_max    NUMERIC,
  value_list         JSONB,
  unit               TEXT,
  currency           TEXT,
  academic_year      TEXT,
  effective_from     TIMESTAMPTZ,
  effective_to       TIMESTAMPTZ,
  applicant_scope    TEXT,
  source_id          TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  source_document_id TEXT REFERENCES source_documents(id) ON DELETE SET NULL,
  source_url         TEXT NOT NULL,
  retrieved_at       TIMESTAMPTZ NOT NULL,
  reviewed_at        TIMESTAMPTZ,
  review_status      TEXT NOT NULL
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'stale')),
  confidence         TEXT NOT NULL,
  null_reason        TEXT,
  notes              TEXT,
  change_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fact_id, revision_number),
  UNIQUE (id, fact_id),
  UNIQUE (id, source_id),
  CONSTRAINT fk_revision_source_document
    FOREIGN KEY (source_document_id, source_id)
      REFERENCES source_documents(id, source_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_fact_revisions_fact ON fact_revisions(fact_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_fact_revisions_source ON fact_revisions(source_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_fact_revisions_created ON fact_revisions(created_at DESC);

CREATE TABLE IF NOT EXISTS review_tasks (
  id                   TEXT PRIMARY KEY,
  fact_id              TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  task_type            TEXT NOT NULL
    CHECK (task_type IN ('new_fact', 'value_change', 'conflict', 'source_failure', 'stale_fact')),
  severity             TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'recheck', 'stale', 'resolved')),
  from_revision_id     TEXT,
  to_revision_id       TEXT,
  reason               TEXT,
  assigned_to_user_id  TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_review_from_revision
    FOREIGN KEY (from_revision_id, fact_id) REFERENCES fact_revisions(id, fact_id),
  CONSTRAINT fk_review_to_revision
    FOREIGN KEY (to_revision_id, fact_id) REFERENCES fact_revisions(id, fact_id)
);
CREATE INDEX IF NOT EXISTS idx_review_tasks_queue
  ON review_tasks(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_tasks_fact ON review_tasks(fact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_tasks_open ON review_tasks(created_at DESC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS information_events (
  id                   TEXT PRIMARY KEY,
  event_type           TEXT NOT NULL
    CHECK (event_type IN (
      'admission_policy', 'deadline', 'cost', 'new_program', 'program_discontinued',
      'scholarship', 'ranking', 'requirement', 'official_announcement'
    )),
  title                TEXT NOT NULL,
  summary              TEXT NOT NULL,
  what_changed         TEXT NOT NULL,
  why_it_matters       TEXT NOT NULL,
  action_steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  entity_type          TEXT NOT NULL,
  entity_id            TEXT NOT NULL,
  field_key            TEXT,
  previous_value       JSONB,
  new_value            JSONB,
  audience             JSONB NOT NULL DEFAULT '[]'::jsonb,
  importance           TEXT NOT NULL DEFAULT 'medium'
    CHECK (importance IN ('low', 'medium', 'high', 'critical')),
  action_deadline      TIMESTAMPTZ,
  fact_id              TEXT NOT NULL REFERENCES facts(id) ON DELETE RESTRICT,
  from_revision_id     TEXT,
  to_revision_id       TEXT,
  source_id            TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  source_url           TEXT NOT NULL,
  is_published         BOOLEAN NOT NULL DEFAULT FALSE,
  published_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fact_id, from_revision_id, to_revision_id, event_type),
  CONSTRAINT fk_event_fact_source
    FOREIGN KEY (fact_id, source_id) REFERENCES facts(id, source_id),
  CONSTRAINT fk_event_from_revision
    FOREIGN KEY (from_revision_id, fact_id) REFERENCES fact_revisions(id, fact_id),
  CONSTRAINT fk_event_to_revision
    FOREIGN KEY (to_revision_id, fact_id) REFERENCES fact_revisions(id, fact_id)
);
CREATE INDEX IF NOT EXISTS idx_information_events_public
  ON information_events(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_information_events_entity
  ON information_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_information_events_type
  ON information_events(event_type, importance, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_information_events_deadline
  ON information_events(action_deadline)
  WHERE is_published AND action_deadline IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('008-information-platform')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
