import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type School = { id: string; name: string; nameZh?: string; chineseName?: string };
type Source = {
  url: string;
  title: string;
  evidenceZh: string;
  accessMethod: "live_official_page" | "official_search_index";
};
type Overview = {
  universityId: string;
  overviewZh: string;
  reviewStatus: string;
  sources: Source[];
};
type Dataset = { schemaVersion: number; checkedOn: string; schools: Overview[] };

const root = new URL("../", import.meta.url);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, root)), "utf8"));
const canonical = readJson<School[]>("data/preview/universities.json");
const dataset = readJson<Dataset>("data/reviewed/university-overviews.json");
const expected = new Map(canonical.map((school) => [school.id, school]));
const errors: string[] = [];
const seen = new Set<string>();
const overviewTexts = new Set<string>();
const indexOnly: string[] = [];
let liveSources = 0;
let indexedSources = 0;
let schoolsWithIndexedSources = 0;

if (dataset.schemaVersion !== 1) errors.push("Unsupported schemaVersion");
if (!/^\d{4}-\d{2}-\d{2}$/.test(dataset.checkedOn)) errors.push("Invalid checkedOn");
if (canonical.length !== 94 || dataset.schools.length !== 94) {
  errors.push("This research batch must match all 94 mapped universities");
}

for (const school of dataset.schools) {
  const label = school.universityId;
  if (!expected.has(label)) errors.push(`Unknown university: ${label}`);
  if (seen.has(label)) errors.push(`Duplicate university: ${label}`);
  seen.add(label);
  if (school.reviewStatus !== "reviewed") errors.push(`Unreviewed: ${label}`);
  if (typeof school.overviewZh !== "string" || school.overviewZh.trim().length < 80 || school.overviewZh.length > 240) {
    errors.push(`Overview must contain 80–240 characters: ${label}`);
  }
  if (overviewTexts.has(school.overviewZh)) errors.push(`Duplicate overview text: ${label}`);
  overviewTexts.add(school.overviewZh);
  if (/待补充|TODO|TBD|Lorem ipsum|保证录取|保证就业|排名第一|全美第一|全球第一/i.test(school.overviewZh)) {
    errors.push(`Placeholder or unsupported superlative: ${label}`);
  }
  if (!Array.isArray(school.sources) || school.sources.length === 0) {
    errors.push(`Missing sources: ${label}`);
    continue;
  }
  const urls = new Set<string>();
  const roots = new Set<string>();
  let liveForSchool = 0;
  let indexedForSchool = 0;
  for (const source of school.sources) {
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:" || !url.hostname.endsWith(".edu") || url.username || url.password) {
        errors.push(`Expected credential-free official education URL: ${label}`);
      }
      // Host shape is a structural check, not proof of institutional ownership.
      roots.add(url.hostname.split(".").slice(-2).join("."));
    } catch {
      errors.push(`Invalid source URL: ${label}`);
    }
    if (urls.has(source.url)) errors.push(`Duplicate source URL: ${label}`);
    urls.add(source.url);
    if (!source.title?.trim() || !source.evidenceZh?.trim()) errors.push(`Missing evidence metadata: ${label}`);
    if (source.accessMethod === "live_official_page") {
      liveSources += 1;
      liveForSchool += 1;
    } else if (source.accessMethod === "official_search_index") {
      indexedSources += 1;
      indexedForSchool += 1;
    } else {
      errors.push(`Unknown accessMethod: ${label}`);
    }
  }
  if (roots.size > 1) errors.push(`Check cross-institution source roots: ${label}`);
  if (indexedForSchool > 0) schoolsWithIndexedSources += 1;
  if (liveForSchool === 0) indexOnly.push(expected.get(label)?.name ?? label);
}

for (const school of canonical) {
  if (!seen.has(school.id)) errors.push(`Missing mapped university: ${school.id}`);
}

console.log(JSON.stringify({
  scope: "University overviews only; not a full university/program data audit",
  checkedOn: dataset.checkedOn,
  mappedSchools: canonical.length,
  overviews: dataset.schools.length,
  uniqueSchools: seen.size,
  liveOfficialSources: liveSources,
  officialIndexSources: indexedSources,
  schoolsWithIndexedSources,
  schoolsWithAtLeastOneLiveSource: dataset.schools.length - indexOnly.length,
  indexOnlySchools: indexOnly,
  structuralErrors: errors,
  publication: "This command is read-only. It does not import, publish or confirm database contents.",
  limitation: "Schema/coverage checks do not automatically verify the truth of prose or source ownership.",
}, null, 2));
if (errors.length > 0) process.exitCode = 1;
