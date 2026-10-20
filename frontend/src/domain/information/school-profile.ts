import type { Fact } from "@/domain/information/fact";

export type SchoolFactGroupId =
  | "profile"
  | "admission"
  | "cost"
  | "outcome"
  | "program"
  | "deadline"
  | "other";

export interface SchoolFactGroup {
  id: SchoolFactGroupId;
  title: string;
  description: string;
  facts: Fact[];
}

export interface SchoolFactChange {
  factId: string;
  fieldKey: string;
  label: string;
  revision: number;
  updatedAt: string;
  sourceUrl: string;
}

export interface SchoolFactProfile {
  entityId: string;
  totalFacts: number;
  missingFacts: number;
  groups: SchoolFactGroup[];
  recentChanges: SchoolFactChange[];
}

const FIELD_LABELS: Record<string, string> = {
  "profile.city": "城市",
  "profile.state": "州 / 地区",
  "profile.school_type": "学校类型",
  "profile.degree_type": "学位类型",
  "profile.enrollment_undergraduate": "本科学生数",
  "profile.enrollment_graduate": "研究生学生数",
  "profile.student_faculty_ratio": "师生比",

  "admission.acceptance_rate": "录取率",
  "admission.sat_25": "SAT 25%",
  "admission.sat_75": "SAT 75%",
  "admission.act_25": "ACT 25%",
  "admission.act_75": "ACT 75%",
  "admission.gpa_average": "平均 GPA",
  "admission.test_policy": "标化政策",
  "admission.english_policy": "英语要求",
  "admission.application_platform": "申请系统",

  "cost.tuition": "学费",
  "cost.fees": "学杂费",
  "cost.housing": "住宿费",
  "cost.food": "餐饮费",
  "cost.insurance": "保险",
  "cost.books": "书籍材料",
  "cost.estimated_total": "预估总成本",
  "aid.scholarship_available": "奖学金可用性",

  "outcome.graduation_rate": "毕业率",
  "outcome.retention_rate": "大一保留率",
  "outcome.employment_rate": "就业率",
  "outcome.median_early_career_pay": "早期职业收入中位数",

  "program.offered_degrees": "开设学位",
  "program.fall_deadline": "秋季截止日",
  "program.spring_deadline": "春季截止日",
  "program.application_deadline": "申请截止日",
  "program.toefl_minimum": "TOEFL 最低分",
  "program.ielts_minimum": "IELTS 最低分",
  "program.gre_policy": "GRE 政策",
};

const GROUP_META: Array<{
  id: SchoolFactGroupId;
  title: string;
  description: string;
  prefixes: string[];
}> = [
  {
    id: "profile",
    title: "学校画像",
    description: "地点、类型、规模与师生结构。",
    prefixes: ["profile."],
  },
  {
    id: "admission",
    title: "录取现实",
    description: "录取率、标化区间与申请政策。",
    prefixes: ["admission."],
  },
  {
    id: "cost",
    title: "成本与资助",
    description: "学费、生活成本与奖学金事实。",
    prefixes: ["cost.", "aid."],
  },
  {
    id: "outcome",
    title: "学习成果",
    description: "毕业、保留与就业相关事实。",
    prefixes: ["outcome."],
  },
  {
    id: "program",
    title: "专业与项目",
    description: "项目开设、学位与项目要求。",
    prefixes: ["program."],
  },
  {
    id: "deadline",
    title: "申请时间",
    description: "申请轮次与材料截止日期。",
    prefixes: ["deadline."],
  },
  {
    id: "other",
    title: "其他已审核事实",
    description: "尚未纳入标准分组的事实。",
    prefixes: [],
  },
];

export function schoolFactLabel(fieldKey: string): string {
  return FIELD_LABELS[fieldKey] ?? fieldKey;
}

function groupForField(fieldKey: string): SchoolFactGroupId {
  const matched = GROUP_META.find((group) =>
    group.prefixes.some((prefix) => fieldKey.startsWith(prefix)),
  );
  return matched?.id ?? "other";
}

function factSort(left: Fact, right: Fact): number {
  const yearLeft = left.academicYear ?? "";
  const yearRight = right.academicYear ?? "";
  if (yearLeft !== yearRight) return yearRight.localeCompare(yearLeft);
  const scopeOrder = ["all", "international", "undergraduate", "graduate"];
  const scopeLeft = scopeOrder.indexOf(left.applicantScope ?? "all");
  const scopeRight = scopeOrder.indexOf(right.applicantScope ?? "all");
  if (scopeLeft !== scopeRight) return scopeLeft - scopeRight;
  return left.fieldKey.localeCompare(right.fieldKey);
}

export function createSchoolFactProfile(
  entityId: string,
  facts: readonly Fact[],
): SchoolFactProfile {
  const grouped = new Map<SchoolFactGroupId, Fact[]>();
  for (const fact of facts) {
    const groupId = groupForField(fact.fieldKey);
    if (!grouped.has(groupId)) grouped.set(groupId, []);
    grouped.get(groupId)!.push(fact);
  }

  const groups = GROUP_META.map((meta) => ({
    id: meta.id,
    title: meta.title,
    description: meta.description,
    facts: (grouped.get(meta.id) ?? []).slice().sort(factSort),
  })).filter((group) => group.facts.length > 0);

  const recentChanges = facts
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((fact) => ({
      factId: fact.id,
      fieldKey: fact.fieldKey,
      label: schoolFactLabel(fact.fieldKey),
      revision: fact.currentRevision,
      updatedAt: fact.updatedAt,
      sourceUrl: fact.sourceUrl,
    }));

  return {
    entityId,
    totalFacts: facts.length,
    missingFacts: facts.filter((fact) => fact.nullReason != null).length,
    groups,
    recentChanges,
  };
}
