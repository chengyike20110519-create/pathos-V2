# Information Platform Deep Check - 2026-10-16

Branch: `codex/target-mode`

## Verification

- Initial full regression: `33 failed / 863 passed (896)`; all 33 legacy failures were diagnosed and repaired in the follow-up quality pass.
- Final full regression: `52 files passed / 906 tests passed`.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed.
- Migration contracts: 35/35 targeted migration/information tests passed.
- Secret scan: `npm run secrets:check` passed.
- Runtime page smoke: 10 core pages returned 200, had no page JavaScript errors, and had zero horizontal overflow at 1440px.
- Information APIs: all tested information APIs returned 503 with `Cache-Control: no-store` when `DATABASE_URL` is invalid, as intended.
- Playwright information-platform journey: 11/11 passed, including the 390px no-overflow sweep.

## Migration Audit

New information-platform migrations are transactional and registered:

- `008-information-platform.sql`
- `009-source-fetch-guards.sql`
- `010-review-actions.sql`
- `011-information-search.sql`

Legacy migrations `002-auth.sql` through `004-shortlists.sql` do not wrap themselves in transactions, but the migration runner records their versions after successful execution. Do not rewrite already-applied historical files; if needed, add a future compatibility migration.

## Production Dependency Audit

`npm audit --omit=dev` currently reports 5 vulnerabilities:

| Package | Severity | Finding | Safe remediation path |
|---|---|---|---|
| `next` | Critical | Multiple request smuggling, cache poisoning, DoS, SSRF, RCE advisories affecting installed 14.x | Dedicated major upgrade gate to a supported release, followed by route/build/E2E verification |
| `maplibre-gl` | Critical | DOM sanitizer bypass | Major upgrade gate from 5.x to 6.x with map visual regression checks |
| `nanoid` | High | Non-secure generator infinite loops | Transitive override or dependency update after ownership audit |
| `postcss` | High | XSS / source-map disclosure | Follows the Next major upgrade |
| `source-map-js` | High | Event-loop DoS | Transitive override or dependency update after ownership audit |

Do not run `npm audit fix --force` on this branch. A forced upgrade would install Next 16 and MapLibre 6 simultaneously without a regression gate.

## Required Security Upgrade Gate

Before upgrading:

1. Freeze the current E2E baseline.
2. Upgrade one major runtime at a time.
3. Prefer order: transitive high advisories, Next, MapLibre.
4. After each step run:
   - `npx tsc --noEmit`
   - targeted information-platform tests
   - full Vitest baseline
   - `npm run build`
   - Playwright desktop/mobile map and information journeys
5. Compare map tiles, markers, popups, selected-state rendering, and URL state.
6. Only advance to the next runtime after the previous upgrade is green.

## Configuration Status

The local `.env.local` contains no valid Postgres connection. This is intentional until the final configuration pass. Until a valid `DATABASE_URL` is configured and migrations 008-011 run, information APIs and fact-backed surfaces must fail closed or explicitly show Preview provenance.
