-- WP02 -- Controlled source retrieval.
--
-- A source row in WP01 described authority; it did not yet encode the
-- operator's robots/terms decision or the runtime guards. Those belong in the
-- database so a restart cannot silently turn an unreviewed source into a
-- crawler target.

BEGIN;

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS robots_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (robots_review_status IN ('pending', 'allowed', 'disallowed', 'not_applicable')),
  ADD COLUMN IF NOT EXISTS terms_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (terms_review_status IN ('pending', 'allowed', 'disallowed', 'not_applicable')),
  ADD COLUMN IF NOT EXISTS fetch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS timeout_ms INTEGER NOT NULL DEFAULT 10000
    CHECK (timeout_ms BETWEEN 250 AND 60000),
  ADD COLUMN IF NOT EXISTS max_response_bytes INTEGER NOT NULL DEFAULT 10485760
    CHECK (max_response_bytes BETWEEN 1024 AND 52428800),
  ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT 'PathOS-Information-Platform/1.0';

CREATE INDEX IF NOT EXISTS idx_sources_fetch_enabled
  ON sources(fetch_enabled, robots_review_status, terms_review_status)
  WHERE fetch_enabled;

-- `source_documents` is a retrieval audit log, not a content store. Repeated
-- unchanged fetches still matter operationally, so hash uniqueness is replaced
-- by a lookup index; pipeline idempotency is handled by comparing the latest
-- content hash before parsing.
DROP INDEX IF EXISTS uq_source_documents_hash;
CREATE INDEX IF NOT EXISTS idx_source_documents_hash
  ON source_documents(source_id, content_hash, fetched_at DESC)
  WHERE content_hash IS NOT NULL;

ALTER TABLE source_documents
  ADD COLUMN IF NOT EXISTS fetch_outcome TEXT,
  ADD COLUMN IF NOT EXISTS final_url TEXT,
  ADD COLUMN IF NOT EXISTS redirect_count INTEGER NOT NULL DEFAULT 0
    CHECK (redirect_count >= 0),
  ADD COLUMN IF NOT EXISTS content_type TEXT;

UPDATE source_documents
   SET fetch_outcome = CASE fetch_status
     WHEN 'failed' THEN 'failed'
     WHEN 'blocked' THEN 'blocked'
     ELSE 'changed'
   END
 WHERE fetch_outcome IS NULL;

ALTER TABLE source_documents
  ALTER COLUMN fetch_outcome SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_source_documents_fetch_outcome'
       AND conrelid = 'source_documents'::regclass
  ) THEN
    ALTER TABLE source_documents
      ADD CONSTRAINT chk_source_documents_fetch_outcome
        CHECK (fetch_outcome IN ('changed', 'unchanged', 'failed', 'blocked'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_source_documents_outcome
  ON source_documents(source_id, fetch_outcome, fetched_at DESC);

INSERT INTO schema_migrations (version) VALUES ('009-source-fetch-guards')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
