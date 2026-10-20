-- Phase 1.2 -- Organizations, memberships, and email-based invitations.
--
-- Why a separate membership table instead of a denormalized
-- `user.org_id` column: a single user can belong to multiple
-- organizations (an advisor may freelance across two firms), and the
-- same person can switch from owner to advisor when handing a firm to
-- a partner. A join table is the smallest schema that supports both.
--
-- Invitations are token-hashed the same way as magic links: only the
-- SHA-256 is stored, the raw token is delivered by email exactly once.
-- A row is single-use (`accepted_at` set on first hit) and expires.
--
-- The file is idempotent so it can be re-applied after a partial
-- failure without breaking an already-migrated database.

CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'team'
    CHECK (plan IN ('team', 'agency', 'studio')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by_user_id);

CREATE TABLE IF NOT EXISTS org_memberships (
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'advisor'
    CHECK (role IN ('owner', 'advisor')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_role ON org_memberships(role);

CREATE TABLE IF NOT EXISTS invitations (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'advisor'
    CHECK (role IN ('advisor', 'student')),
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  accepted_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  invited_by_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_accepted ON invitations(accepted_at)
  WHERE accepted_at IS NULL;
