// PathOS — verify the 35 new POIs pick up IECG guidePreview data
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractGuidePreview } from "../src/lib/guide-preview";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");

const iecg = JSON.parse(
  readFileSync(path.join(project, "data/college-guides/iecg-2025.json"), "utf8"),
);
const univ = JSON.parse(
  readFileSync(path.join(project, "data/preview/universities.json"), "utf8"),
);

// Replicate guideMatchKey from src/server/fixture-preview.ts
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

// Build the same cache as fixture-preview.ts:loadGuidePreviewIndex()
const index = new Map<string, ReturnType<typeof extractGuidePreview>>();
for (const profile of iecg.profiles ?? []) {
  const structured = (profile.structured as any) ?? {};
  const sections = (profile.sections as any) ?? [];
  const preview = extractGuidePreview({ structured, sections });
  const raw = profile.schoolNameRaw ?? "";
  const englishOnly = raw.replace(/[^\x00-\x7F]+/g, " ").trim();
  const englishKey = guideMatchKey(englishOnly);
  const fullKey = guideMatchKey(raw);
  if (englishKey) index.set(englishKey, preview);
  if (fullKey && fullKey !== englishKey) index.set(fullKey, preview);
}

console.log("\n=== IECG cache keys:", index.size, "===\n");

// For each new POI (the 35 we just added), check if it gets a guidePreview
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

let matched = 0, unmatched = 0;
for (const u of univ) {
  if (!u.id.startsWith("candidate-v2:")) continue;
  const slug = u.id.slice("candidate-v2:".length);
  if (!NEW_IDS.has(slug)) continue;

  const key1 = guideMatchKey(u.name);
  const key2 = guideMatchKey(u.chineseName);
  const gp = index.get(key1) ?? index.get(key2);
  if (gp) {
    matched++;
    console.log(`OK   ${u.name.padEnd(45)} -> ${(gp.programs?.length ?? 0)} programs, tuition ${gp.tuition?.total ?? "?"}`);
  } else {
    unmatched++;
    console.log(`MISS ${u.name.padEnd(45)} (key1="${key1.slice(0,30)}", key2="${key2.slice(0,30)}")`);
  }
}
console.log(`\nMatched: ${matched} / Unmatched: ${unmatched} (out of ${matched + unmatched} new POIs)`);

