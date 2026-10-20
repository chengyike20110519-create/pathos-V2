-- Curated campus images. The table stores provenance and review state so
-- presentation assets never become untraceable hardcoded decoration.
BEGIN;

CREATE TABLE IF NOT EXISTS university_media (
  id              TEXT PRIMARY KEY,
  university_id   TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  media_type      TEXT NOT NULL DEFAULT 'campus_photo'
    CHECK (media_type IN ('campus_photo', 'logo', 'campus_video')),
  url             TEXT NOT NULL,
  thumbnail_url   TEXT,
  label           TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  publisher       TEXT NOT NULL,
  license_status  TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (license_status IN ('verified', 'pending_review', 'not_suitable')),
  review_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('approved', 'pending', 'rejected')),
  checked_on      DATE,
  display_order   INTEGER NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_university_media_visible
  ON university_media(university_id, media_type, review_status, license_status, display_order);

ALTER TABLE university_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE university_media FROM anon, authenticated;

INSERT INTO schema_migrations (version) VALUES ('017-university-media')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
