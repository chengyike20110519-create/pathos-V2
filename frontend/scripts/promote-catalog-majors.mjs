import fs from "node:fs";

const [universityId, slug, sourceId] = process.argv.slice(2);
if (!universityId || !slug || !sourceId) throw new Error("Usage: node scripts/promote-catalog-majors.mjs <universityId> <slug> <sourceId>");
const candidates = JSON.parse(fs.readFileSync("data/reviewed/guide-source-candidates.json", "utf8"));
const candidate = candidates.records.find((item) => item.universityId === universityId);
if (!candidate?.observedProgramNames?.length) throw new Error(`No extracted catalog names for ${universityId}`);
const candidatePath = `data/preview/university-details/candidate-v2/${slug}.json`;
const legacyPath = `data/preview/university-details/${slug}.json`;
const path = fs.existsSync(candidatePath) ? candidatePath : legacyPath;
const detail = JSON.parse(fs.readFileSync(path, "utf8"));
const sourceIds = [sourceId];
detail.allMajors = candidate.observedProgramNames.map((name) => ({
  degreeType: "bachelor_degree_program",
  displayName: name,
  listType: "official_undergraduate_major",
  name,
  sourceIds,
  status: "verified",
  warnings: [],
}));
detail.allMajorsStatus = { status: "verified_official_catalog", referenceYear: 2026, sourceIds, warnings: ["Official catalog item preserved as displayed; degree and concentration labels are not collapsed."] };
detail.programs = detail.programs?.length ? detail.programs : detail.allMajors.slice(0, 5);
fs.writeFileSync(path, `${JSON.stringify(detail, null, 2)}\n`);
console.log(JSON.stringify({ universityId, allMajors: detail.allMajors.length, sourceIds }, null, 2));
