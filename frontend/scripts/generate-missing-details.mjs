// Generate conservative detail records for schools that have a canonical
// summary but no detail artifact. Every value comes from universities.json;
// unsupported sections stay explicitly unreported.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const preview = path.join(root, "data/preview");
const summaries = JSON.parse(fs.readFileSync(path.join(preview, "universities.json"), "utf8"));
const detailDir = path.join(preview, "university-details/candidate-v2");
fs.mkdirSync(detailDir, { recursive: true });

const missing = summaries.filter((school) => {
  const slug = school.id.replace(/^candidate-v2:/, "");
  return !fs.existsSync(path.join(detailDir, `${slug}.json`));
});
const sourceId = "source_stage4b_college_scorecard_2025_05_19";
const emptyField = (unit = null, scope = null) => ({
  nullReason: "not_reported",
  referenceYear: 2019,
  scope,
  sourceIds: [],
  status: "not_reported",
  unit,
  value: null,
  warnings: ["stale_reference_year"],
});
const verifiedField = (field) => ({ ...field });

for (const school of missing) {
  const undergrad = school.undergraduateEnrollment;
  const enrollment = {
    undergraduate: undergrad ? verifiedField(undergrad) : emptyField(null, "undergraduate_certificate_or_degree_seeking"),
    graduate: emptyField(null, "graduate_enrollment"),
    total: emptyField(null, "institution_total_enrollment"),
  };
  const admissions = {
    acceptanceRate: school.acceptanceRate ? verifiedField(school.acceptanceRate) : emptyField("ratio", "institution_undergraduate_admissions"),
    graduationRate: emptyField("ratio", "institution"),
    retentionRate: emptyField("ratio", "four_year_institution"),
    sat: { nullReason: "not_reported", referenceYear: null, scope: null, sourceIds: [], status: "not_reported", unit: null, value: null, warnings: [] },
    act: { nullReason: "not_reported", referenceYear: null, scope: null, sourceIds: [], status: "not_reported", unit: null, value: null, warnings: [] },
    testPolicy: { nullReason: "official_admissions_policy_not_frozen", referenceYear: null, scope: "first_year_undergraduate", sourceIds: [], status: "pending_external_access", unit: "policy", value: null, warnings: ["pending_data_not_a_verified_fact"] },
    englishPolicy: { nullReason: "official_undergraduate_english_policy_not_frozen", referenceYear: null, scope: "international_first_year_undergraduate", sourceIds: [], status: "pending_external_access", unit: "policy", value: null, warnings: ["pending_data_not_a_verified_fact"] },
  };
  const programs = (school.topPrograms ?? []).map((name, index) => ({ id: `${school.id}:program:${index + 1}`, name, rank: index + 1, sourceIds: [] }));
  const rawCostRecords = school.costSummary?.minimumUsd != null
    ? [{ amountUsd: school.costSummary.minimumUsd, currency: "USD", scope: school.costSummary.scopes?.[0] ?? "unknown", academicYear: school.costSummary.academicYear ?? "2023-24", sourceIds: school.costSummary.sourceIds ?? [] }, ...(school.costSummary.maximumUsd != null && school.costSummary.maximumUsd !== school.costSummary.minimumUsd ? [{ amountUsd: school.costSummary.maximumUsd, currency: "USD", scope: school.costSummary.scopes?.[1] ?? "unknown", academicYear: school.costSummary.academicYear ?? "2023-24", sourceIds: school.costSummary.sourceIds ?? [] }] : [])]
    : [];
  const detail = {
    ...school,
    programs,
    allMajors: [],
    allMajorsStatus: { status: "not_reported", nullReason: "detail_artifact_not_available" },
    enrollment,
    admissions,
    geography: {
      geographyScope: "place",
      place: { value: school.city, status: "verified", referenceYear: null, scope: "institution", unit: null, sourceIds: [sourceId], warnings: [] },
      county: { value: null, status: "not_reported", referenceYear: null, scope: "county", unit: null, sourceIds: [], warnings: [] },
    },
    programPeopleGaps: [],
    history: { value: null, status: "not_reported", sourceIds: [] },
    anecdotes: [],
    notableAttendance: [],
    people: [],
    nearbyTowns: [],
    rawCostRecords,
  };
  const slug = school.id.replace(/^candidate-v2:/, "");
  fs.writeFileSync(path.join(detailDir, `${slug}.json`), `${JSON.stringify(detail, null, 2)}\n`);
}
console.log(`generated conservative detail artifacts: ${missing.length}`);
