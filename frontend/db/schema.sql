-- PathOS Preview schema for Supabase (PostgreSQL 15+).
-- Run once in Supabase SQL Editor, or via `npm run db:reset`.
-- Safe to re-run: every CREATE uses IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Universities: 1 row per school. Top-level scalars are extracted to
-- columns for filter / index. Everything else stays in `payload` JSONB.
CREATE TABLE IF NOT EXISTS universities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  chinese_name    TEXT,
  city            TEXT,
  state           TEXT,
  region          TEXT,
  school_type     TEXT,
  ranking_band    TEXT,
  ranking_tier    TEXT,
  national_ranking INTEGER,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  display_tier    TEXT,
  source_status   TEXT,
  source_commit   TEXT,
  dataset_version TEXT,
  preview_only    BOOLEAN NOT NULL DEFAULT TRUE,
  payload         JSONB NOT NULL,
  search_text     TSVECTOR,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_universities_state ON universities(state);
CREATE INDEX IF NOT EXISTS idx_universities_tier  ON universities(ranking_tier);
CREATE INDEX IF NOT EXISTS idx_universities_geo   ON universities(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_universities_fts   ON universities USING GIN(search_text);
CREATE INDEX IF NOT EXISTS idx_universities_trgm  ON universities USING GIN(name gin_trgm_ops, chinese_name gin_trgm_ops);

-- Actionable college updates. Kept separate from university_details because
-- each update has its own deadline, urgency, audience, and source lifecycle.
CREATE TABLE IF NOT EXISTS news_articles (
  id                    TEXT PRIMARY KEY,
  university_id         TEXT REFERENCES universities(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  title_en              TEXT,
  summary               TEXT,
  what_changed          TEXT,
  why_it_matters        TEXT,
  action_steps          JSONB NOT NULL DEFAULT '[]'::jsonb,
  category              TEXT NOT NULL DEFAULT 'campus_update',
  event_type            TEXT NOT NULL DEFAULT 'other',
  audience              JSONB NOT NULL DEFAULT '[]'::jsonb,
  source                TEXT NOT NULL,
  url                   TEXT NOT NULL,
  published_at          TIMESTAMPTZ NOT NULL,
  action_deadline       TIMESTAMPTZ,
  importance            TEXT NOT NULL DEFAULT 'medium',
  display_tier          TEXT NOT NULL DEFAULT 'preview',
  source_status         TEXT NOT NULL DEFAULT 'source_review_not_completed',
  search_text           TSVECTOR,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_university ON news_articles(university_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles(category, event_type);
CREATE INDEX IF NOT EXISTS idx_news_articles_search ON news_articles USING GIN(search_text);
-- University detail: 1 row per school, large JSONB blob.
CREATE TABLE IF NOT EXISTS university_details (
  university_id  TEXT PRIMARY KEY REFERENCES universities(id) ON DELETE CASCADE,
  payload        JSONB NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Region metrics envelope: stored as one JSONB blob because the current
-- preview is `status=blocked, records=[]`. When choropleth is enabled,
-- add a separate region_metric_records table here.
CREATE TABLE IF NOT EXISTS region_envelope (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status dictionary: keyed by code, payload holds icon/label/tone.
CREATE TABLE IF NOT EXISTS status_dictionary (
  code        TEXT PRIMARY KEY,
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Source index: array of source references. Single row.
CREATE TABLE IF NOT EXISTS source_index (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Manifest: dataset metadata + hash table. Single row.
CREATE TABLE IF NOT EXISTS manifest (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Source-preserving college guides imported from IECG Word profiles.
-- These are explanatory snapshots, not live admissions policy.
CREATE TABLE IF NOT EXISTS college_guides (
  id                    TEXT PRIMARY KEY,
  university_id         TEXT REFERENCES universities(id) ON DELETE SET NULL,
  source_file           TEXT NOT NULL,
  source_snapshot_year INTEGER NOT NULL,
  school_name_raw       TEXT,
  source_url            TEXT,
  sections              JSONB NOT NULL DEFAULT '[]'::jsonb,
  structured            JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_text              TEXT NOT NULL,
  display_tier          TEXT NOT NULL DEFAULT 'preview',
  source_status         TEXT NOT NULL DEFAULT 'archived_source',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_college_guides_university ON college_guides(university_id);
CREATE INDEX IF NOT EXISTS idx_college_guides_snapshot ON college_guides(source_snapshot_year DESC);
CREATE INDEX IF NOT EXISTS idx_college_guides_search ON college_guides USING GIN(to_tsvector('simple', COALESCE(school_name_raw, '') || ' ' || COALESCE(raw_text, '')));
-- ---------------------------------------------------------------------------
-- Commercial v2 tables. Idempotent. See docs in V2-PRODUCT-STRATEGY.md.
-- ---------------------------------------------------------------------------

-- subscription_leads: intake from /pricing and inline lead forms.
CREATE TABLE IF NOT EXISTS subscription_leads (
  id              TEXT PRIMARY KEY,
  plan            TEXT NOT NULL,
  contact_name    TEXT,
  phone           TEXT,
  wechat          TEXT,
  email           TEXT,
  company         TEXT,
  notes           TEXT,
  source          TEXT,
  status          TEXT NOT NULL DEFAULT 'new',
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscription_leads_status ON subscription_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_leads_plan ON subscription_leads(plan, created_at DESC);

-- api_keys: programmatic access for the data API (opportunity A).
CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  owner_label     TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  scopes          TEXT NOT NULL DEFAULT 'universities.read',
  rate_limit      INTEGER NOT NULL DEFAULT 60,
  monthly_quota   INTEGER NOT NULL DEFAULT 10000,
  calls_this_month INTEGER NOT NULL DEFAULT 0,
  quota_reset_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
  status          TEXT NOT NULL DEFAULT 'active',
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- reports: AI interpretation report (opportunity A).
CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  lead_id         TEXT REFERENCES subscription_leads(id) ON DELETE SET NULL,
  plan            TEXT NOT NULL DEFAULT 'single_report',
  profile         JSONB NOT NULL DEFAULT '{}'::jsonb,
  schools         JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  error           TEXT,
  -- Access control. The plaintext share token is returned to the
  -- creator exactly once; only its SHA-256 hash is persisted so a DB
  -- leak cannot be replayed into report access.
  access_token_hash TEXT,
  token_expires_at  TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  idempotency_key   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_lead ON reports(lead_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_token_hash ON reports(access_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_idempotency ON reports(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- report_access_log: who opened which report, and whether we allowed it.
-- Reports carry student grades and target schools, so every read attempt
-- is auditable.
CREATE TABLE IF NOT EXISTS report_access_log (
  id              BIGSERIAL PRIMARY KEY,
  report_id       TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  ip_hash         TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_access_log_report ON report_access_log(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_access_log_outcome ON report_access_log(outcome, created_at DESC);

-- rate_limit_buckets: minute-window counter for /api/v1/*.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key      TEXT PRIMARY KEY,
  hits            INTEGER NOT NULL DEFAULT 1,
  window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON rate_limit_buckets(window_start);

-- schema_migrations: applied migration ledger. `db/schema.sql` builds a
-- fresh database; `db/migrations/*.sql` upgrades an existing one.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version         TEXT PRIMARY KEY,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (version) VALUES ('001-commercial')
  ON CONFLICT (version) DO NOTHING;
