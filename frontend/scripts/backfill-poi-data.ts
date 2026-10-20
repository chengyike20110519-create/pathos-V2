// PathOS — Backfill costSummary / enrollmentSummary / acceptanceRate for the
// 35 newly-added POIs by reading IECG guidePreview. The guidePreview cache
// is built the same way fixture-preview.ts does it.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractGuidePreview } from "../src/lib/guide-preview";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");

const iecg = JSON.parse(
  readFileSync(path.join(project, "data/college-guides/iecg-2025.json"), "utf8"),
);
const univPath = path.join(project, "data/preview/universities.json");
const univ = JSON.parse(readFileSync(univPath, "utf8"));

// Same guideMatchKey as fixture-preview.ts
function guideMatchKey(value: unknown): string {
  const s = String(value ?? "").toLowerCase();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/[a-z0-9\u4e00-\u9fff]/.test(c)) out += c;
    else if (out && out[out.length - 1] !== " ") out += " ";
  }
  return out.trim();
}

// Build index
const index = new Map<string, ReturnType<typeof extractGuidePreview>>();
for (const profile of iecg.profiles ?? []) {
  const preview = extractGuidePreview({
    structured: (profile.structured as any) ?? {},
    sections: (profile.sections as any) ?? [],
  });
  const raw = profile.schoolNameRaw ?? "";
  const englishOnly = raw.replace(/[^\x00-\x7F]+/g, " ").trim();
  const englishKey = guideMatchKey(englishOnly);
  const fullKey = guideMatchKey(raw);
  if (englishKey) index.set(englishKey, preview);
  if (fullKey && fullKey !== englishKey) index.set(fullKey, preview);
}

// Parse "$86,700" / "USD 86,700" / "$65,800-190,800" → number
function parseUsd(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/\$?\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseRange(s: string | undefined): { min: number | null; max: number | null } {
  if (!s) return { min: null, max: null };
  const pattern = /([\d,]+(?:\.\d+)?)/g;
  const matches: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(s)) !== null) {
    matches.push(parseFloat(match[0].replace(/,/g, "")));
  }
  if (matches.length === 0) return { min: null, max: null };
  if (matches.length === 1) return { min: matches[0], max: matches[0] };
  return { min: Math.min(...matches), max: Math.max(...matches) };
}

function parseIntLoose(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/[\d,]+/);
  if (!m) return null;
  return parseInt(m[0].replace(/,/g, ""), 10);
}

const NEW_IDS = new Set([
  "university-of-north-carolina-at-chapel-hill", "university-of-texas-at-austin",
  "university-of-illinois-at-urbana-champaign", "wake-forest-university",
  "case-western-reserve-university", "virginia-polytechnic-institute-and-state-university",
  "florida-state-university", "college-of-william-and-mary", "university-of-california-merced",
  "north-carolina-state-university", "stony-brook-university", "villanova-university",
  "university-of-massachusetts-amherst", "george-washington-university",
  "pennsylvania-state-university", "michigan-state-university", "brandeis-university",
  "tulane-university", "university-of-miami", "rensselaer-polytechnic-institute",
  "university-of-pittsburgh", "university-of-connecticut", "syracuse-university",
  "university-of-california-riverside", "stevens-institute-of-technology",
  "colorado-school-of-mines", "university-at-buffalo", "university-of-illinois-at-chicago",
  "clemson-university", "university-of-california-santa-cruz", "worcester-polytechnic-institute",
  "university-of-delaware", "marquette-university", "southern-methodist-university",
  "fordham-university",
]);

let filledCost = 0, filledEnrollment = 0, filledAcceptance = 0;
for (const u of univ) {
  if (!u.id.startsWith("candidate-v2:")) continue;
  const slug = u.id.slice("candidate-v2:".length);
  if (!NEW_IDS.has(slug)) continue;

  const gp = index.get(guideMatchKey(u.name)) ?? index.get(guideMatchKey(u.chineseName));
  if (!gp) continue;

  // ── Backfill costSummary from gp.tuition.total ──
  if ((!u.costSummary?.minimumUsd || u.costSummary.minimumUsd === null) && gp.tuition?.total) {
    const { min, max } = parseRange(gp.tuition.total);
    if (min !== null) {
      u.costSummary = {
        minimumUsd: min,
        maximumUsd: max ?? min,
        displayLabel: gp.tuition.total.includes("$") || gp.tuition.total.includes("USD")
          ? gp.tuition.total
          : `$${min.toLocaleString()}`,
        comparisonSafe: true,
        scopes: ["institution_undergraduate_tuition_published"],
        sourceIds: [],
        warnings: [],
        academicYear: "2025-26",
        currency: "USD",
      };
      // Remove from nullableFields
      u.nullableFields = (u.nullableFields ?? []).filter(
        (f: string) => f !== "costSummary.minimumUsd" && f !== "costSummary.maximumUsd",
      );
      filledCost++;
    }
  }

  // ── Backfill enrollmentSummary from gp ──
  if (!u.enrollmentSummary?.undergraduate && gp.undergraduateStudents) {
    u.enrollmentSummary = {
      undergraduate: gp.undergraduateStudents,
      graduate: gp.graduateStudents ?? null,
      total: (gp.undergraduateStudents ?? 0) + (gp.graduateStudents ?? 0),
      referenceYear: 2024,
    };
    u.nullableFields = (u.nullableFields ?? []).filter(
      (f: string) => !f.startsWith("enrollmentSummary."),
    );
    filledEnrollment++;
  }

  // ── Backfill acceptanceRate from gp ──
  if (u.acceptanceRate === null && typeof gp.acceptanceRatePercent === "number") {
    u.acceptanceRate = gp.acceptanceRatePercent;
    u.nullableFields = (u.nullableFields ?? []).filter((f: string) => f !== "acceptanceRate");
    filledAcceptance++;
  }

  // ── Also fill sfr / grad / retention from gp if available ──
  if (u.studentFacultyRatio === null && gp.studentFacultyRatio) {
    const sfrMatch = gp.studentFacultyRatio.match(/(\d+)\s*[:：]\s*(\d+)/);
    if (sfrMatch) {
      const n = parseInt(sfrMatch[2], 10); // the "1" is always 1, ratio is the 2nd
      if (n > 0) {
        u.studentFacultyRatio = n;
        u.nullableFields = (u.nullableFields ?? []).filter((f: string) => f !== "studentFacultyRatio");
      }
    }
  }
  if (u.graduationRate === null && gp.graduationRate4Yr) {
    const n = parseIntLoose(gp.graduationRate4Yr);
    if (n !== null && n > 0 && n <= 100) {
      u.graduationRate = n;
      u.nullableFields = (u.nullableFields ?? []).filter((f: string) => f !== "graduationRate");
    }
  }
  if (u.retentionRate === null && gp.freshmanRetentionRate) {
    const n = parseIntLoose(gp.freshmanRetentionRate);
    if (n !== null && n > 0 && n <= 100) {
      u.retentionRate = n;
      u.nullableFields = (u.nullableFields ?? []).filter((f: string) => f !== "retentionRate");
    }
  }
}

writeFileSync(univPath, JSON.stringify(univ, null, 2) + "\n", "utf8");
console.log(`Backfilled:`);
console.log(`  costSummary       : ${filledCost} / 35`);
console.log(`  enrollmentSummary : ${filledEnrollment} / 35`);
console.log(`  acceptanceRate    : ${filledAcceptance} / 35`);
