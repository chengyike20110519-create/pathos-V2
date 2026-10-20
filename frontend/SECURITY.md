# PathOS Security Procedures

> **This document is read by humans, not by code.**
> Last reviewed: 2026-09-18.

## 1. Why this file exists

PathOS production runs on Render with a Supabase Postgres backend. The
`DATABASE_URL` environment variable is the master credential: it grants
read/write access to all preview data (universities, news, college guides,
manifests) and any future user-generated content.

If `DATABASE_URL` is exposed outside its approved location (chat history,
screen recordings, public logs, accidental git commits, screenshots,
shared terminals), treat it as a credential leak and rotate it.

---

## 2. Where the credential lives (and where it MUST NOT live)

| Location | Status |
|---|---|
| Render Web Service environment | **Authoritative. This is the only place a real value should live in production.** |
| GitHub repository | **Forbidden.** The repo does not contain a real `DATABASE_URL`. |
| `frontend/.env.example` | Placeholder template only. Shipped with the repo on purpose. |
| `frontend/.env.local` | Placeholder template only. Gitignored, but a real value here is still a leak. |
| `~/.bash_history`, `~/.zsh_history` | Forbidden. If the URL appears here, rotate. |
| Logs / screenshots / chat | Forbidden. If anyone pastes a real URL there, rotate. |
| Backup archives | Forbidden. Any backup containing `.env.local` should be re-encrypted or purged. |

The local repo ships with `npm run predev` (and `prebuild` / `prestart`)
hooks that run `scripts/check-secrets.ts`. The hook exits with a loud
warning in dev mode and fails the build in production mode if
`.env.local` contains a non-placeholder `DATABASE_URL`. See
`scripts/check-secrets.ts` for the exact rules.

---

## 3. How to rotate `DATABASE_URL` (production)

### When to rotate

- Any time the credential appears outside its approved locations above.
- On a quarterly cadence (calendar reminder).
- When any team member with credential access leaves the project.
- Before sharing a development machine with a third party.

### Rotation steps (Supabase)

1. Open the Supabase dashboard → Project → **Settings** → **Database**.
2. Under **Connection Pooling**, click **Reset database password** (or
   create a new dedicated role for the application).
3. Copy the new connection string.
4. If the old password may already be exposed, do not pause: rotate
   immediately. Application traffic will fail for ~30 seconds while you
   update Render.

### Rotation steps (Render)

1. Open Render dashboard → **PathOS** service → **Environment**.
2. Edit the `DATABASE_URL` variable. Paste the new connection string.
3. Save. Render triggers a redeploy.
4. Watch the deploy log for `sslmode=verify-full` or `sslmode=require`
   being applied. If TLS errors appear, see section 5.

### Verification

1. Open `https://<render-host>/api/health/ready` in a browser. Expect
   HTTP 200 with `mode: backend`.
2. Open a representative page (`/map`, `/university/harvard-university`,
   `/opportunities`) and confirm data loads.
3. Confirm no Supabase Postgres errors in Render logs.

### Post-rotation

1. Update the team password manager / 1Password entry for `PathOS
   Production DATABASE_URL`.
2. Notify the team: "`DATABASE_URL` rotated on YYYY-MM-DD; if your
   local `.env.local` still contains the old value, replace it with the
   placeholder from `.env.example` and re-pull from 1Password if you
   need to talk to prod."
3. If the rotation was triggered by a leak, document the incident
   (when, where, what data was at risk, who was informed) in this
   file under section 7.

---

## 4. Local development

**Default: do not put a real `DATABASE_URL` in `.env.local`.**

- For most development, use fixture mode:
  ```
  PATHOS_DATA_MODE=fixture
  ```
  No database is required.
- If you need real backend access, retrieve the staging connection
  string from 1Password, paste it into `.env.local`, and accept the
  warning from `predev`.
- Override the warning (NOT recommended):
  ```
  PATHOS_SKIP_SECRET_CHECK=1 npm run dev
  ```
- Before committing, run `npm run secrets:check` to confirm your local
  file does not contain a real credential that would block a teammate's
  setup.

---

## 5. TLS verification

The production database connection must verify the server certificate
(`sslmode=verify-full` or equivalent). PathOS applies this in
`src/server/db.ts`. Disabling TLS verification (e.g.
`rejectUnauthorized: false`) is reserved for emergency local debugging
and must be reverted before any commit touches production.

If you see TLS errors during a rotation, the most common cause is a
new Supabase pooler host that the bundled CA does not yet trust.
Pull the latest CA bundle from the Supabase dashboard before changing
the application code.

---

## 6. Admin endpoints

`POST /api/admin/enrich-summaries` requires a signed token. The static
token that historically guarded this endpoint has been retired; access
now uses a short-lived HMAC signature that expires in 5 minutes. The
endpoint also takes a Postgres advisory lock to prevent concurrent runs.

If you need to invoke this endpoint:

1. Generate a signed token via the team's admin CLI (see `scripts/`).
2. Pass it via the `Authorization: Bearer ...` header.
3. Audit logs (request id, operator id, changed row count) are written
   to Supabase and can be queried for incident response.

---

## 7. Incident log

| Date | Trigger | Action taken | Status |
|---|---|---|---|
| 2026-09-18 | `frontend/.env.local` was found to contain a real production `DATABASE_URL` on a developer workstation. | Local file sanitized to placeholder values; `scripts/check-secrets.ts` added as a predev / prebuild / prestart hook; `SECURITY.md` published; **production credential must be rotated in Supabase + Render** as a separate operation by the operator with dashboard access. | Local mitigation complete. Production rotation pending operator action. |
