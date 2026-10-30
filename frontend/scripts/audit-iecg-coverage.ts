// PathOS — UI placeholder × guide-preview field × school-coverage audit
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractGuidePreview } from "../src/lib/guide-preview";

const project = path.resolve(__dirname, "..");
const iecg = JSON.parse(
  readFileSync(path.join(project, "data/college-guides/iecg-2025.json"), "utf8"),
);
const mapUniversities = JSON.parse(
  readFileSync(path.join(project, "data/preview/universities.json"), "utf8"),
) as Array<{ name?: string; nameZh?: string; chineseName?: string }>;

// This audit measures IECG guide coverage, not the existence of the lighter
// university-detail JSON. Keep the two scopes explicit so a 94-school map
// cannot be mistaken for an 88-profile guide bundle.
const normalizeSchoolName = (value: string) => value
  .toLowerCase()
  .replace(/university|college|the|of|at|in|and|\([^)]*\)/g, "")
  .replace(/[\u4e00-\u9fff]/g, "")
  .replace(/[^a-z0-9]/g, "");
const guideNames = iecg.profiles
  .map((p: { schoolNameRaw?: string }) => normalizeSchoolName(p.schoolNameRaw || ""))
  .filter(Boolean);
const mapOnlySchools = mapUniversities.filter((school) => {
  const candidate = normalizeSchoolName(`${school.name || ""} ${school.nameZh || school.chineseName || ""}`);
  return candidate.length > 0 && !guideNames.some((guide: string) => guide.includes(candidate) || candidate.includes(guide));
});

const fields = [
  "officialWebsite","founded","schoolType","campusSize","climate","location",
  "undergraduateStudents","graduateStudents","studentFacultyRatio",
  "freshmanRetentionRate","graduationRate4Yr","graduationRate6Yr",
  "classSize","usNewsRanks","tuition","acceptanceRatePercent",
  "applicationDeadlines","applicationRequirements","testPolicy","midRangeScores",
  "academicSystem","curriculumSummary","curriculumUrl","strongPrograms",
  "academicCulture","selectionFactors","programs","resourceUrls",
  "studentFeedbackSnippet",
];

const total = iecg.profiles.length;
const missingCount: Record<string, string[]> = Object.fromEntries(
  fields.map((f) => [f, []]),
);
const fullyEmpty: Array<{ name: string; id: string }> = [];

for (const p of iecg.profiles) {
  const structured = (p as any).structured || {};
  const sections = (p as any).sections || [];
  const gp = extractGuidePreview({ structured, sections });
  let anyField = false;
  for (const f of fields) {
    const v = (gp as any)[f];
    const isPresent =
      v !== undefined && v !== null && v !== "" &&
      !(Array.isArray(v) && v.length === 0) &&
      !(typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
    if (!isPresent) {
      missingCount[f].push((p as any).schoolNameRaw || "(no name)");
    } else {
      anyField = true;
    }
  }
  if (!anyField) {
    fullyEmpty.push({ name: (p as any).schoolNameRaw || "(no name)", id: p.id });
  }
}

console.log("\n=== Per-field missing school list (print all) ===\n");
console.log(`IECG guide profiles: ${total} | map roster: ${mapUniversities.length} | map schools without IECG profile: ${mapOnlySchools.length}`);
mapOnlySchools.forEach((school) => console.log(`   - ${school.name || "(no English name)"} ${school.nameZh || school.chineseName || ""}`));
console.log("");
for (const f of fields) {
  const list = missingCount[f];
  if (list.length === 0) {
    console.log(`${f.padEnd(28)} 0 / ${total}   (ALL COVERED)`);
  } else if (list.length === total) {
    console.log(`${f.padEnd(28)} ${total} / ${total}   (UNIVERSAL — never extracted)`);
  } else {
    console.log(`${f.padEnd(28)} ${list.length} / ${total}  missing:`);
    list.forEach((n) => console.log("   - " + n));
  }
}

console.log("\n=== Fully empty profiles ===\n");
fullyEmpty.forEach((s) => console.log("  * " + s.name + "  (" + s.id + ")"));
console.log("(total fully empty: " + fullyEmpty.length + ")");
