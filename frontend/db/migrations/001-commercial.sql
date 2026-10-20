-- 001-commercial: bring an EXISTING PathOS database up to the current
-- commercial schema. Safe to re-run.
--
-- Why this file exists: db/schema.sql uses CREATE TABLE IF NOT EXISTS,
-- which silently skips tables that already exist and therefore never
-- adds new columns. Render does not run migrations automatically, so
-- apply this by hand (or via `npm run db:migrate`) after deploying:
--
--   DATABASE_URL=postgresql://... npm run db:migrate

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version         TEXT PRIMARY KEY,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- subscription_leads ---------------------------------------------------
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

-- api_keys -------------------------------------------------------------
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
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS calls_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS quota_reset_at TIMESTAMPTZ NOT NULL
  DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- reports --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,
  lead_id         TEXT REFERENCES subscription_leads(id) ON DELETE SET NULL,
  plan            TEXT NOT NULL DEFAULT 'single_report',
  profile         JSONB NOT NULL DEFAULT '{}'::jsonb,
  schools         JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending',
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS access_token_hash TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_lead ON reports(lead_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_token_hash ON reports(access_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_idempotency ON reports(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Pre-existing rows were readable with ?token=<reportId>. That is no
-- longer accepted, and they have no real token, so revoke them rather
-- than leaving them publicly enumerable.
UPDATE reports
   SET revoked_at = NOW()
 WHERE access_token_hash IS NULL
   AND revoked_at IS NULL;

-- report_access_log ----------------------------------------------------
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

-- rate_limit_buckets ---------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key      TEXT PRIMARY KEY,
  hits            INTEGER NOT NULL DEFAULT 1,
  window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON rate_limit_buckets(window_start);

INSERT INTO schema_migrations (version) VALUES ('001-commercial')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
