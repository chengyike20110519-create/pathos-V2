-- WP04 -- Append-only review action audit trail.
--
-- `review_tasks` carries the current queue state. It must not be the only
-- record of a review decision: a task can later reopen after a source changes,
-- and regulators/operators still need to know who approved which revision and
-- when. Every action therefore writes one immutable review_actions row.

BEGIN;

CREATE TABLE IF NOT EXISTS review_actions (
  id                  TEXT PRIMARY KEY,
  review_task_id      TEXT NOT NULL REFERENCES review_tasks(id) ON DELETE RESTRICT,
  actor_user_id       TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  action              TEXT NOT NULL
    CHECK (action IN ('approve', 'reject', 'recheck', 'stale', 'resolve')),
  reason              TEXT,
  task_status_before  TEXT NOT NULL
    CHECK (task_status_before IN ('pending', 'approved', 'rejected', 'recheck', 'stale', 'resolved')),
  task_status_after   TEXT NOT NULL
    CHECK (task_status_after IN ('pending', 'approved', 'rejected', 'recheck', 'stale', 'resolved')),
  fact_status_before  TEXT
    CHECK (fact_status_before IS NULL OR fact_status_before IN ('pending', 'approved', 'rejected', 'stale')),
  fact_status_after   TEXT
    CHECK (fact_status_after IS NULL OR fact_status_after IN ('pending', 'approved', 'rejected', 'stale')),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_actions_task
  ON review_actions(review_task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_actions_actor
  ON review_actions(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_actions_created
  ON review_actions(created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('010-review-actions')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
