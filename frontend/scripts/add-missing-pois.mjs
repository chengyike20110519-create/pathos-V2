// PathOS — Add the 35 IECG schools that aren't yet in universities.json.
// Uses publicly-known lat/lng (Google Maps public data). After running,
// npx tsx scripts/audit-iecg-matching.ts should show "0 / 88" missing.
//
// Usage: node scripts/add-missing-pois.mjs
// The script MUTATES data/preview/universities.json. Make a backup first
// (or rely on git).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "..");

// Public lat/lng for the 35 missing schools (Google Maps convention).
// Format: [englishSlug, nameZh, state, city, lat, lng]
const SEEDS = [
  ["university-of-north-carolina-at-chapel-hill", "北卡教堂山", "NC", "Chapel Hill", 35.9049, -79.0469],
  ["university-of-texas-at-austin", "德州奥斯汀", "TX", "Austin", 30.2849, -97.7341],
  ["university-of-illinois-at-urbana-champaign", "UIUC", "IL", "Champaign", 40.1020, -88.2272],
  ["wake-forest-university", "维克森林", "NC", "Winston-Salem", 36.1337, -80.2785],
  ["case-western-reserve-university", "凯斯西储", "OH", "Cleveland", 41.5047, -81.6087],
  ["virginia-polytechnic-institute-and-state-university", "弗吉尼亚理工", "VA", "Blacksburg", 37.2284, -80.4234],
  ["florida-state-university", "佛州州立", "FL", "Tallahassee", 30.4419, -84.2985],
  ["college-of-william-and-mary", "威廉玛丽", "VA", "Williamsburg", 37.2707, -76.7081],
  ["university-of-california-merced", "UC Merced", "CA", "Merced", 37.3641, -120.4248],
  ["north-carolina-state-university", "NC State", "NC", "Raleigh", 35.7847, -78.6821],
  ["stony-brook-university", "Stony Brook", "NY", "Stony Brook", 40.9171, -73.1234],
  ["villanova-university", "维拉诺瓦", "PA", "Villanova", 40.0349, -75.3373],
  ["university-of-massachusetts-amherst", "UMass Amherst", "MA", "Amherst", 42.3868, -72.5301],
  ["george-washington-university", "乔治华盛顿", "DC", "Washington", 38.9012, -77.0447],
  ["pennsylvania-state-university", "Penn State", "PA", "University Park", 40.7982, -77.8599],
  ["michigan-state-university", "密歇根州立", "MI", "East Lansing", 42.7018, -84.4822],
  ["brandeis-university", "Brandeis", "MA", "Waltham", 42.3657, -71.2653],
  ["tulane-university", "杜兰", "LA", "New Orleans", 29.9400, -90.1200],
  ["university-of-miami", "迈阿密", "FL", "Coral Gables", 25.7215, -80.2791],
  ["rensselaer-polytechnic-institute", "RPI", "NY", "Troy", 42.7301, -73.6767],
  ["university-of-pittsburgh", "匹兹堡", "PA", "Pittsburgh", 40.4444, -79.9606],
  ["university-of-connecticut", "UConn", "CT", "Storrs", 41.8072, -72.2534],
  ["syracuse-university", "Syracuse", "NY", "Syracuse", 43.0392, -76.1351],
  ["university-of-california-riverside", "UC Riverside", "CA", "Riverside", 33.9737, -117.3281],
  ["stevens-institute-of-technology", "Stevens", "NJ", "Hoboken", 40.7450, -74.0253],
  ["colorado-school-of-mines", "科罗拉多矿业", "CO", "Golden", 39.7507, -105.2217],
  ["university-at-buffalo", "UB", "NY", "Buffalo", 43.0008, -78.7890],
  ["university-of-illinois-at-chicago", "UIC", "IL", "Chicago", 41.8721, -87.6480],
  ["clemson-university", "Clemson", "SC", "Clemson", 34.6762, -82.8393],
  ["university-of-california-santa-cruz", "UC Santa Cruz", "CA", "Santa Cruz", 36.9914, -122.0609],
  ["worcester-polytechnic-institute", "WPI", "MA", "Worcester", 42.2747, -71.8063],
  ["university-of-delaware", "特拉华", "DE", "Newark", 39.6790, -75.7491],
  ["marquette-university", "Marquette", "WI", "Milwaukee", 43.0389, -87.9280],
  ["southern-methodist-university", "SMU", "TX", "Dallas", 32.8422, -96.7844],
  ["fordham-university", "Fordham", "NY", "Bronx", 40.8617, -73.8857],
];

const englishName = (slug) => slug.split("-").map(s => {
  const lower = s.toLowerCase();
  if (["of", "at", "the", "and"].includes(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}).join(" ");

const uniPath = path.join(project, "data/preview/universities.json");
const existing = JSON.parse(readFileSync(uniPath, "utf8"));
const datasetVersion = existing[0]?.datasetVersion ?? "stage5-preview-ec8c66e";
const sourceCommit = existing[0]?.sourceCommit ?? "ec8c66e200b566dba4de35987aa5213960749a57";

const existingIds = new Set(existing.map((u) => u.id));

const additions = [];
let skipped = 0;
for (const [slug, nameZh, state, city, lat, lng] of SEEDS) {
  const id = `candidate-v2:${slug}`;
  if (existingIds.has(id)) { skipped++; continue; }
  additions.push({
    id,
    name: englishName(slug),
    nameZh,
    chineseName: nameZh,
    aliases: [],
    latitude: lat,
    longitude: lng,
    state,
    city,
    country: "US",
    rankingTier: "other",
    rankingBand: "outside_numeric_scope",
    rankingSummary: {
      nationalRank: null,
      rankingTier: "other",
      rankingLabel: "Not in selected national ranking scope",
      sourceIds: [],
      status: "not_in_current_national_scope",
      filterBehavior: "exclude_from_numeric_range",
    },
    enrollmentSummary: {
      undergraduate: null,
      graduate: null,
      total: null,
      referenceYear: null,
    },
    costSummary: {
      minimumUsd: null,
      maximumUsd: null,
      displayLabel: "Data pending source verification",
      comparisonSafe: false,
    },
    topPrograms: [],
    studentFacultyRatio: null,
    acceptanceRate: null,
    sat25: null,
    sat75: null,
    graduationRate: null,
    retentionRate: null,
    schoolType: "private",
    displayTier: "preview",
    previewOnly: true,
    sourceCommit,
    sourceStatus: "pending_source_review",
    datasetVersion,
    warningSummary: {
      codes: ["candidate-v2_added_from_iecg_seed"],
      count: 1,
      hasWarnings: true,
    },
    nullableFields: [
      "acceptanceRate",
      "graduationRate",
      "retentionRate",
      "sat25",
      "sat75",
      "studentFacultyRatio",
      "costSummary.minimumUsd",
      "costSummary.maximumUsd",
      "enrollmentSummary.undergraduate",
      "enrollmentSummary.graduate",
      "enrollmentSummary.total",
    ],
  });
}

const merged = existing.concat(additions);
writeFileSync(uniPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
console.log(`Added ${additions.length} schools (skipped ${skipped} duplicates).`);
console.log(`Total universities: ${merged.length} (was ${existing.length}).`);
