-- Phase 1.3 -- School shortlists with reach/match/safety grouping.
--
-- A shortlist is a container owned by a single user. Items reference
-- universities by id and are tagged with one of three buckets:
--   - reach   : aspirational, the student`s chances are below the
--               school`s middle-50%, but the upside is real.
--   - match   : the realistic middle of the application list.
--   - safety  : the student is well above the middle-50%, expected
--               admit. A list with zero safety items is treated as
--               incomplete by downstream tooling.
--
-- Why a separate table instead of a JSONB array on shortlists:
--   1. The bucket is its own column so we can GROUP BY it cheaply.
--   2. We can attach per-item notes (why this school, what to ask
--      the consultant about) without bloating the container row.
--   3. The (shortlist_id, university_id) UNIQUE constraint makes
--      adding the same school twice impossible, which is the
--      single most common accidental-state bug in college apps.
--
-- Idempotent: every CREATE uses IF NOT EXISTS so re-running on an
-- already-migrated database is a no-op.

CREATE TABLE IF NOT EXISTS shortlists (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  season        TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shortlists_owner ON shortlists(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shortlist_items (
  id              TEXT PRIMARY KEY,
  shortlist_id    TEXT NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
  university_id   TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  bucket          TEXT NOT NULL DEFAULT 'match'
    CHECK (bucket IN ('reach', 'match', 'safety')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shortlist_id, university_id)
);
CREATE INDEX IF NOT EXISTS idx_shortlist_items_list ON shortlist_items(shortlist_id, bucket);
CREATE INDEX IF NOT EXISTS idx_shortlist_items_school ON shortlist_items(university_id);
