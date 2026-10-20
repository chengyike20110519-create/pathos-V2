# Information Platform WP00 Baseline

Date: 2026-10-15
Branch: `codex/target-mode`
Product mode default: `information`

## 1. Purpose

This document locks the pre-implementation baseline before WP01. It protects the
launched PathOS behavior while the product pivots from commercial MVP work to an
information aggregation platform.

WP00 does not delete any P0/P1 capability. Commercial, authentication,
organization, report, shortlist, CRM, and tracking routes remain addressable.

## 2. Product Mode Contract

`src/lib/product-mode.ts` defines:

```text
PATHOS_PRODUCT_MODE=information  # default, fail-closed
PATHOS_PRODUCT_MODE=commercial   # explicit opt-in
```

Rules:

1. Missing, empty, or invalid values resolve to `information`.
2. `commercial` is a presentation mode only; it does not grant authorization.
3. Authentication and organization roles continue to use the existing session
   and admin-auth code.

## 3. Public Entry Changes

The global navigation already prioritized information and tool routes, so
`NavBar.tsx` required no commercial change.

`Footer.tsx` now behaves as follows in information mode:

1. The brand-level CTA points to `/opportunities` as “查看信息动态”.
2. The commercial group is retitled “数据与协作”.
3. `/pricing` remains as a low-weight “顾问协作” link.
4. `/account/subscription` is removed from the public footer while remaining a
   direct route.

In commercial mode, the previous footer behavior is retained.

`sitemap.xml` no longer advertises `/pricing` or `/account/subscription` in
information mode. Both routes stay directly accessible for existing users and
operators.

## 4. Route Ownership

### 4.1 Public Information Routes

| Route | Current owner | WP status |
|---|---|---|
| `/` | `src/app/page.tsx` plus `src/components/home/*` | Information desk; already non-commercial |
| `/entry/map`, `/map` | map entry and `MapPageShell` | Preserve, feed from facts later |
| `/university/[id]` | university detail surface | Upgrade in WP06 |
| `/search` | global search | Upgrade in WP14 |
| `/news` | news list | Preserve |
| `/opportunities` | opportunities surface | Event-driven upgrade in WP07 |
| `/guides` | college guide list | Preserve |
| `/topics/cs-engineering` | curated topic page | Generalize in WP15 |
| `/xuanxiao` | school-selection route | Preserve as compatibility surface |

### 4.2 Decision Tool Routes

| Route | Current owner | WP status |
|---|---|---|
| `/entry/match`, `/match` | preference matching | Preserve |
| `/entry/assessment`, `/assessment` | AI school assessment | Preserve; must cite verified facts |
| `/entry/portfolio`, `/portfolio` | AI portfolio review | Preserve; must cite verified facts |
| `/calculator` | calculator hub | Connect to cost facts in WP11 |
| `/compare`, `/s/compare` | comparison surfaces | Consolidate around WP12 |
| `/s/calculator/gpa` | GPA calculator | Preserve |
| `/s/calculator/roi` | ROI calculator | Preserve |
| `/f/calculator/roi` | family ROI calculator | Preserve |

### 4.3 V2 Compatibility Routes

| Route group | Current owner | WP status |
|---|---|---|
| `/s/home`, `/f/home` | `V2Workbench` | Preserve as signed-in workbench |
| `/s/majors`, `/s/major/[id]` | workbench major modes | Feed major facts in WP09 |
| `/f/major/[id]` | family major mode | Preserve |
| `/s/cases`, `/s/case/[id]`, `/f/case/[id]` | case surfaces | Preserve |
| `/s/timeseries` | time-series mode | Preserve |
| `/s/radar`, `/f/policy` | radar/policy modes | Feed from events in WP07 |
| `/s/school/[slug]`, `/f/school/[slug]` | school modes | Preserve compatibility |
| `/s/topic/*` | topic/news detail routes | Preserve |

### 4.4 Account, Organization, And Workbench Routes

| Route | Current owner | WP00 decision |
|---|---|---|
| `/login` | magic-link login | Preserve |
| `/invite/[token]` | invitation acceptance | Preserve |
| `/account/api-keys` | API key account page | Preserve |
| `/account/subscription` | subscription status page | Preserve route, remove footer prominence |
| `/workbench/orgs` | organization list | Preserve |
| `/workbench/orgs/[id]` | organization detail | Preserve |
| `/workbench/shortlists` | shortlist list | Preserve |
| `/workbench/shortlists/[id]` | shortlist detail | Preserve |
| `/s/home` | signed-in workbench | Preserve |

### 4.5 Commercial Route

| Route | Current owner | WP00 decision |
|---|---|---|
| `/pricing` | pricing page and subscription form | Preserve route, remove public sitemap prominence, keep low-weight footer link |

Commercial implementation remains usable for an operator, but no new payment,
paywall, lead-nurture, or subscription feature may be added during WP01-WP16.

### 4.6 Internal Operator Routes

| Route | Current owner | WP00 decision |
|---|---|---|
| `/admin/leads` | lead CRM | Preserve; advisor/owner only |
| `/api/admin/leads` | lead list API | Preserve |
| `/api/admin/leads/[id]` | lead update API | Preserve |
| `/api/admin/leads/stats` | lead counters | Preserve |
| `/api/admin/enrich-summaries` | summary enrichment | Preserve |

`AdvisorLeadsCard` remains advisor-only and is not a public navigation entry.

### 4.7 Data And Report APIs

| Route | Current owner | WP status |
|---|---|---|
| `/api/pathos/preview` | canonical preview BFF | Preserve |
| `/api/v1/universities` | public API v1 | Preserve |
| `/api/v1/universities/[id]` | public API v1 detail | Preserve |
| `/api/xuanxiao/universities` | compatibility API | Preserve |
| `/api/reports/generate` | report generation | Preserve |
| `/api/reports/[id]` | report retrieval | Preserve |
| `/api/reports/[id]/revoke` | report revocation | Preserve |
| `/api/reports/[id]/rotate` | report token rotation | Preserve |
| `/api/track` | event tracking | Preserve |

Information-platform APIs will be added under `/api/information/*` in later work
packages rather than replacing these routes.

## 5. Verification Baseline

Command:

```powershell
npx vitest run
```

Result:

```text
Test Files: 6 failed / 24 passed (30)
Tests:      33 failed / 662 passed (695)
Duration:   47.64s
```

This is the authoritative WP00 starting baseline. WP00 must not increase either
failure count.

### 5.1 Known Failing Files

| File | Failed tests |
|---|---:|
| `src/test/unit/feature-entry-restoration.test.ts` | 2 |
| `src/test/unit/local-ai-demo.test.ts` | 3 |
| `src/test/unit/pathos-coupling-integration.test.ts` | 2 |
| `src/test/unit/stage5-closing-ui.test.ts` | 4 |
| `src/test/unit/stage5-integration.test.ts` | 20 |
| `src/test/unit/stage7b-a1-closing-patch-v2.test.ts` | 2 |

### 5.2 Known Failing Tests

```text
feature-entry-restoration > routes only the four restored home entries through entry pages
feature-entry-restoration > routes the primary navigation and footer through every restored entry experience

local-ai-demo > assessment shows an explicit local demo without calling the disabled AI endpoint
local-ai-demo > portfolio shows an explicit local demo without calling the disabled AI endpoint
local-ai-demo > keeps demo output free of fabricated admissions scores

pathos-coupling-integration > uses only canonical, buildable product routes from the integrated home
pathos-coupling-integration > retains the canonical Preview BFF and forbids fixture fallback in integration

stage5-closing-ui > 09 real backend Bundle has 62 unique stable route IDs
stage5-closing-ui > 10 missing Bundle fails closed
stage5-closing-ui > 12 normal backend university detail remains available
stage5-closing-ui > 13 missing source index is a Bundle failure, not university 404

stage5-integration > 01 backend DataSource success
stage5-integration > 07 detail 404 has no fallback
stage5-integration > 07b encoded dynamic-route IDs resolve exactly once
stage5-integration > 11 missing manifest has no fallback
stage5-integration > 13 Summary schema normalization
stage5-integration > 14 Detail schema normalization
stage5-integration > 16 warning mapping
stage5-integration > 17 source mapping
stage5-integration > 18 null preservation
stage5-integration > 20 rank null semantics
stage5-integration > 21 SAT/ACT not_reported
stage5-integration > 22 test policy pending
stage5-integration > 23 English policy pending
stage5-integration > 24 county scope
stage5-integration > 25 source_review_not_completed remains a gap
stage5-integration > 26 quarantined people are excluded
stage5-integration > 27 region metrics blocked
stage5-integration > 30 source index resolution
stage5-integration > 31 Summary/Detail consistency
stage5-integration > 31b backend search covers region and top programs

stage7b-a1-closing-patch-v2 > B2 uses history.replaceState
stage7b-a1-closing-patch-v2 > G4 MapRuntimeClient uses a mounted gate
```

## 6. WP00 Acceptance Checklist

- [x] Full Vitest baseline rerun and recorded.
- [x] Product mode switch added with fail-safe default.
- [x] Product mode unit tests added.
- [x] Global navigation audited; no commercial entry was present.
- [x] Footer commercial CTA deprioritized in information mode.
- [x] Commercial routes remain directly addressable.
- [x] Sitemap no longer promotes commercial pages in information mode.
- [x] P0/P1 auth, org, report, shortlist, CRM, and tracking routes preserved.
- [x] Route ownership documented.

## 7. WP00 Verification Result

### 7.1 Targeted Tests

```powershell
npx vitest run src/test/unit/product-mode.test.ts
```

Result: all six product-mode and public-entry contract tests passed.

### 7.2 Typecheck

```powershell
npx tsc --noEmit
```

Result: passed with no TypeScript errors.

### 7.3 Production Build

```powershell
npm run build
```

Result: compiled successfully. `/pricing` remains addressable and `/sitemap.xml`
remains a dynamic route.

### 7.4 Full Regression After WP00

```text
Test Files: 6 failed / 25 passed (31)
Tests:      33 failed / 668 passed (701)
```

Interpretation:

1. The six failing files are unchanged from the starting baseline.
2. The same 33 test names fail; WP00 introduced no new failure.
3. Six tests were added, increasing the total from 695 to 701.
