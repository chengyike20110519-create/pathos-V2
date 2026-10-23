import fs from "node:fs";

const candidatePath = "data/reviewed/guide-source-candidates.json";
const detailPath = "data/preview/university-details/candidate-v2/stony-brook-university.json";
const candidates = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
const candidate = candidates.records.find((item) => item.universityId === "candidate-v2:stony-brook-university");
if (!candidate || !Array.isArray(candidate.observedProgramNames) || candidate.observedProgramNames.length === 0) {
  throw new Error("Stony Brook candidate catalog list is missing");
}
const detail = JSON.parse(fs.readFileSync(detailPath, "utf8"));
const sourceIds = ["official-source-0a6d8871c44fd9025230c52e"];
detail.allMajors = candidate.observedProgramNames.map((name) => ({
  degreeType: "bachelor_degree_program",
  displayName: name,
  listType: "official_undergraduate_major",
  name,
  sourceIds,
  status: "verified",
  warnings: [],
}));
detail.allMajorsStatus = {
  status: "verified_official_catalog",
  referenceYear: 2026,
  sourceIds,
  warnings: ["Official page lists undergraduate majors; degree title variants are preserved as displayed."],
};
detail.programs = detail.programs?.length ? detail.programs : detail.allMajors.slice(0, 5);
fs.writeFileSync(detailPath, `${JSON.stringify(detail, null, 2)}\n`);
console.log(JSON.stringify({ universityId: detail.id, allMajors: detail.allMajors.length, sourceIds }, null, 2));
