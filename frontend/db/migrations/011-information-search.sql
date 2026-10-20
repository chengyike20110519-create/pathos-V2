-- WP14 -- Global search statistics and bounded information retrieval.
--
-- The search service runs four independent LIMIT-ed queries in parallel:
-- universities, locations, approved facts, and published information events.
-- These indexes keep each branch index-supported as the fact ledger grows.

BEGIN;

-- Preview school locations support substring as well as exact-state lookup.
CREATE INDEX IF NOT EXISTS idx_universities_city_trgm
  ON universities USING GIN (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_universities_state_trgm
  ON universities USING GIN (state gin_trgm_ops);

-- Public facts are searched only after review and effective-date filtering.
-- FTS handles words; trigram handles Chinese substrings and partial names.
CREATE INDEX IF NOT EXISTS idx_facts_public_search_fts
  ON facts USING GIN ((to_tsvector('simple',
      COALESCE(entity_id, '') || ' ' || COALESCE(field_key, '') || ' ' ||
      COALESCE(value_text, '') || ' ' || COALESCE(notes, ''))))
  WHERE review_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_facts_public_search_trgm
  ON facts USING GIN ((COALESCE(entity_id, '') || ' ' || COALESCE(field_key, '') || ' ' ||
      COALESCE(value_text, '') || ' ' || COALESCE(notes, '')) gin_trgm_ops)
  WHERE review_status = 'approved';

-- Information events are public only when explicitly published.
CREATE INDEX IF NOT EXISTS idx_information_events_search_fts
  ON information_events USING GIN ((to_tsvector('simple',
      COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' ||
      COALESCE(what_changed, '') || ' ' || COALESCE(why_it_matters, ''))))
  WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_information_events_search_trgm
  ON information_events USING GIN ((COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' ||
      COALESCE(what_changed, '') || ' ' || COALESCE(why_it_matters, '')) gin_trgm_ops)
  WHERE is_published = TRUE;

-- One aggregate row per normalized query plus one append-only run sample.
-- The sample table makes p95 observable instead of inferred from one request.
CREATE TABLE IF NOT EXISTS search_queries (
  query_key          TEXT PRIMARY KEY,
  query              TEXT NOT NULL,
  request_count      BIGINT NOT NULL DEFAULT 1,
  no_result_count    BIGINT NOT NULL DEFAULT 0,
  last_result_count  INTEGER NOT NULL,
  last_group_counts  JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_response_ms   INTEGER NOT NULL CHECK (last_response_ms >= 0),
  worst_response_ms  INTEGER NOT NULL CHECK (worst_response_ms >= 0),
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_queries_recent
  ON search_queries(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_hot_misses
  ON search_queries(no_result_count DESC, last_seen_at DESC)
  WHERE no_result_count > 0;

CREATE TABLE IF NOT EXISTS search_query_runs (
  id              BIGSERIAL PRIMARY KEY,
  query_key       TEXT NOT NULL REFERENCES search_queries(query_key) ON DELETE CASCADE,
  result_count    INTEGER NOT NULL CHECK (result_count >= 0),
  response_ms     INTEGER NOT NULL CHECK (response_ms >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_query_runs_query_time
  ON search_query_runs(query_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_query_runs_duration
  ON search_query_runs(query_key, response_ms DESC);
CREATE INDEX IF NOT EXISTS idx_search_query_runs_no_result
  ON search_query_runs(query_key, created_at DESC)
  WHERE result_count = 0;

INSERT INTO schema_migrations (version) VALUES ('011-information-search')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
