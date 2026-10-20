import type { CollegeGuide, UniversitySummary } from "@/domain/dataset";
import type { Fact } from "@/domain/information/fact";
import {
  findMajorDefinition,
  MAJOR_PROFILES,
  type MajorDefinition,
} from "@/domain/information/major";

export type MajorAssociationSource =
  | "top_programs"
  | "guide_structured_programs"
  | "approved_fact";

export interface MajorSchoolAssociation {
  university: UniversitySummary;
  universityId: string;
  matchedProgramNames: string[];
  sources: MajorAssociationSource[];
}

export interface MajorFieldValue {
  id: string;
  label: string;
  status: "approved_fact" | "missing";
  value: string;
  missingReason: "not_collected" | "source_review_not_completed";
  sourceUrl?: string;
  academicYear?: string;
}

export interface MajorProfile {
  definition: MajorDefinition;
  schools: MajorSchoolAssociation[];
  representativeSchools: MajorSchoolAssociation[];
  applicationRequirements: MajorFieldValue[];
  outcomes: MajorFieldValue[];
  totalApprovedFacts: number;
  missingFieldCount: number;
}

export interface AggregateMajorInput {
  universities?: readonly UniversitySummary[];
  guides?: readonly CollegeGuide[];
  facts?: readonly Fact[];
}

interface MajorFieldDefinition {
  id: string;
  label: string;
  fieldKeys: readonly string[];
}

const REQUIREMENT_FIELDS: readonly MajorFieldDefinition[] = [
  { id: "math", label: "数学基础要求", fieldKeys: ["application.math", "program.math_requirement"] },
  { id: "portfolio", label: "作品 / 编程证明", fieldKeys: ["application.portfolio", "program.portfolio"] },
  { id: "lab", label: "实验 / 实践先修", fieldKeys: ["application.lab_prerequisite", "program.lab_requirement"] },
  { id: "english", label: "英语成绩政策", fieldKeys: ["application.english_policy", "program.english_policy"] },
];

const OUTCOME_FIELDS: readonly MajorFieldDefinition[] = [
  { id: "employment", label: "毕业后就业率", fieldKeys: ["outcome.employment_rate", "major.employment_rate"] },
  { id: "early_pay", label: "早期职业收入中位数", fieldKeys: ["outcome.early_career_pay", "major.early_career_pay"] },
  { id: "graduate_study", label: "继续深造比例", fieldKeys: ["outcome.graduate_study_rate", "major.graduate_study_rate"] },
];

function normalizeProgramName(value: string): string {
  return value.normalize("NFKD").replace(/\s+/g, " ").trim().toLowerCase();
}

function aliasesBySlug(slug: string): Set<string> {
  const definition = findMajorDefinition(slug);
  return new Set((definition?.aliases ?? []).map(normalizeProgramName));
}

function matchedPrograms(school: UniversitySummary, aliases: Set<string>): string[] {
  return (school.topPrograms ?? [])
    .map((program) => program.trim())
    .filter((program) => program.length > 0 && aliases.has(normalizeProgramName(program)));
}

function guidePrograms(guide: CollegeGuide | undefined, aliases: Set<string>): string[] {
  if (!guide) return [];
  const structured = guide.structured;
  const raw = structured.programs ?? structured.topPrograms ?? structured.majors;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && aliases.has(normalizeProgramName(value)));
}

function guideByUniversityId(guides: readonly CollegeGuide[]): Map<string, CollegeGuide> {
  const map = new Map<string, CollegeGuide>();
  for (const guide of guides) {
    const id = guide.universityId?.trim();
    if (id) map.set(id, guide);
  }
  return map;
}

function rankOf(school: UniversitySummary): number {
  const rank = school.rankingSummary?.nationalRank;
  return typeof rank === "number" && Number.isFinite(rank)
    ? rank
    : Number.MAX_SAFE_INTEGER;
}

function displayNameOf(school: UniversitySummary): string {
  return school.nameZh || school.chineseName || school.name;
}

function factValue(fact: Fact): string | null {
  if (fact.valueText != null && fact.valueText.trim()) return fact.valueText.trim();
  if (fact.valueNumber != null) return String(fact.valueNumber);
  if (fact.valueBoolean != null) return fact.valueBoolean ? "是" : "否";
  if (fact.valueRange) return fact.valueRange.min + " - " + fact.valueRange.max;
  if (fact.valueList && fact.valueList.length > 0) return fact.valueList.join("、");
  return null;
}

function isApproved(fact: Fact): boolean {
  return fact.reviewStatus === "approved";
}

function fieldForDefinition(
  definition: MajorFieldDefinition,
  fields: readonly MajorFieldValue[],
): MajorFieldValue {
  return fields.find((field) => field.status === "approved_fact") ?? {
    id: definition.id,
    label: definition.label,
    status: "missing",
    value: "待核验",
    missingReason: "not_collected",
  };
}

function fieldsForMajor(
  slug: string,
  facts: readonly Fact[],
  definitions: readonly MajorFieldDefinition[],
): MajorFieldValue[] {
  const majorFacts = facts.filter(
    (fact) => isApproved(fact) && fact.entityType === "major" && fact.entityId === slug,
  );
  return definitions.map((definition) => {
    const matched = definition.fieldKeys
      .flatMap((fieldKey) => majorFacts.filter((fact) => fact.fieldKey === fieldKey))
      .map((fact) => {
        const value = factValue(fact);
        return {
          id: definition.id,
          label: definition.label,
          status: "approved_fact" as const,
          value: value ?? "已审核缺失",
          missingReason: value ? ("not_collected" as const) : ("source_review_not_completed" as const),
          sourceUrl: fact.sourceUrl,
          academicYear: fact.academicYear ?? undefined,
        };
      });
    const fallback: MajorFieldValue[] = [{
      id: definition.id,
      label: definition.label,
      status: "missing",
      value: "待核验",
      missingReason: "not_collected",
    }];
    return fieldForDefinition(definition, matched.length > 0 ? matched : fallback);
  });
}

function createAssociation(
  university: UniversitySummary,
  programs: string[],
  source: MajorAssociationSource,
): MajorSchoolAssociation {
  return {
    university,
    universityId: university.id,
    matchedProgramNames: programs,
    sources: [source],
  };
}

function mergeAssociation(
  current: MajorSchoolAssociation,
  incoming: MajorSchoolAssociation,
): MajorSchoolAssociation {
  const programNames = new Set([...current.matchedProgramNames, ...incoming.matchedProgramNames]);
  const sources = new Set([...current.sources, ...incoming.sources]);
  return {
    ...current,
    matchedProgramNames: [...programNames],
    sources: [...sources],
  };
}

function associationsForMajor(
  definition: MajorDefinition,
  input: AggregateMajorInput,
  guideMap: Map<string, CollegeGuide>,
): MajorSchoolAssociation[] {
  const aliases = aliasesBySlug(definition.slug);
  const byUniversity = new Map<string, MajorSchoolAssociation>();

  for (const university of input.universities ?? []) {
    const programs = matchedPrograms(university, aliases);
    if (programs.length === 0) continue;
    byUniversity.set(university.id, createAssociation(university, programs, "top_programs"));
  }

  for (const university of input.universities ?? []) {
    const programs = guidePrograms(guideMap.get(university.id), aliases);
    if (programs.length === 0) continue;
    const incoming = createAssociation(university, programs, "guide_structured_programs");
    const current = byUniversity.get(university.id);
    byUniversity.set(university.id, current ? mergeAssociation(current, incoming) : incoming);
  }

  for (const fact of input.facts ?? []) {
    if (!isApproved(fact) || fact.entityType !== "major" || fact.entityId !== definition.slug) continue;
    if (fact.fieldKey !== "major.program_membership") continue;
    const university = (input.universities ?? []).find((item) => item.id === fact.valueText?.trim());
    if (!university) continue;
    const programName = university.topPrograms?.find(
      (program) => aliases.has(normalizeProgramName(program)),
    ) ?? definition.nameEn;
    const incoming = createAssociation(university, [programName], "approved_fact");
    const current = byUniversity.get(university.id);
    byUniversity.set(university.id, current ? mergeAssociation(current, incoming) : incoming);
  }

  return [...byUniversity.values()].sort((left, right) => {
    const rankDelta = rankOf(left.university) - rankOf(right.university);
    if (rankDelta !== 0) return rankDelta;
    return displayNameOf(left.university).localeCompare(displayNameOf(right.university), "zh-Hans-CN");
  });
}

export function aggregateMajorProfile(
  slug: string,
  input: AggregateMajorInput,
): MajorProfile | null {
  const definition = findMajorDefinition(slug);
  if (!definition) return null;
  const facts = input.facts ?? [];
  const schools = associationsForMajor(definition, input, guideByUniversityId(input.guides ?? []));
  const applicationRequirements = fieldsForMajor(definition.slug, facts, REQUIREMENT_FIELDS);
  const outcomes = fieldsForMajor(definition.slug, facts, OUTCOME_FIELDS);
  const totalApprovedFacts = facts.filter(
    (fact) => isApproved(fact) && fact.entityType === "major" && fact.entityId === definition.slug,
  ).length;

  return {
    definition,
    schools,
    representativeSchools: schools.slice(0, 8),
    applicationRequirements,
    outcomes,
    totalApprovedFacts,
    missingFieldCount:
      applicationRequirements.filter((field) => field.status === "missing").length +
      outcomes.filter((field) => field.status === "missing").length,
  };
}

export function aggregateMajorCatalog(input: AggregateMajorInput): MajorProfile[] {
  return MAJOR_PROFILES.map((definition) => aggregateMajorProfile(definition.slug, input)!);
}

export function majorCompareHref(profile: MajorProfile): string {
  const ids = profile.representativeSchools.slice(0, 2).map((item) => item.universityId);
  return ids.length > 0 ? `/compare?ids=${ids.map(encodeURIComponent).join(",")}` : "/compare";
}
