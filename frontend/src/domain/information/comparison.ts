import type { UniversitySummary } from "@/domain/dataset";
import type { Fact } from "@/domain/information/fact";
import { schoolFactLabel } from "@/domain/information/school-profile";

export const COMPARISON_PERSPECTIVES = [
  "admission",
  "cost",
  "outcome",
  "program",
  "location",
  "deadline",
] as const;
export type ComparisonPerspective = (typeof COMPARISON_PERSPECTIVES)[number];

export const COMPARISON_PERSPECTIVE_META: Record<
  ComparisonPerspective,
  { title: string; description: string }
> = {
  admission: {
    title: "录取",
    description: "录取率、标化区间与申请政策。approved facts 优先，Preview 字段显式降级展示。",
  },
  cost: {
    title: "成本",
    description: "学费、生活成本与总成本。货币单位统一为 USD，不同学年会逐格标注。",
  },
  outcome: {
    title: "成果",
    description: "毕业率、保留率、就业与收入。缺失不会折算为 0。",
  },
  program: {
    title: "专业",
    description: "已收录专业标签与项目级事实，不做跨校项目等同假设。",
  },
  location: {
    title: "地点",
    description: "州、城市、地理坐标与规模信息，来自当前院校档案。",
  },
  deadline: {
    title: "时间",
    description: "申请与项目截止日。只使用 approved facts，不用往年日期推断。",
  },
};

export type ComparisonCellSourceKind = "approved_fact" | "preview" | "missing";
export type ComparisonDirection = "higher_better" | "lower_better" | "none";

export interface ComparisonCellSource {
  kind: ComparisonCellSourceKind;
  label: string;
  url: string | null;
  sourceId?: string;
  retrievedAt?: string | null;
  reviewedAt?: string | null;
  confidence?: Fact["confidence"];
}

export interface ComparisonCell {
  key: string;
  value: string | null;
  numericValue: number | null;
  unit: string | null;
  academicYear: string | null;
  applicantScope: string | null;
  missingReason: string | null;
  source: ComparisonCellSource;
  isBest: boolean;
  isExtreme: boolean;
}

type ComparisonCellBase = Pick<
  ComparisonCell,
  "value" | "numericValue" | "unit" | "academicYear" | "applicantScope" | "missingReason"
>;

export interface ComparisonRow {
  id: string;
  perspective: ComparisonPerspective;
  label: string;
  description: string;
  direction: ComparisonDirection;
  yearMismatch: boolean;
  sourceMismatch: boolean;
  unitMismatch: boolean;
  cells: ComparisonCell[];
}

export interface UniversityComparison {
  university: UniversitySummary;
  approvedFactCount: number;
}

export interface UniversityComparisonModel {
  universities: UniversityComparison[];
  rows: ComparisonRow[];
}

export interface ComparisonModelInput {
  universities: readonly UniversitySummary[];
  factsByUniversity?: Readonly<Record<string, readonly Fact[]>>;
}

const MISSING_LABELS: Record<string, string> = {
  not_reported: "官方未报告",
  not_applicable: "不适用",
  source_blocked: "来源访问受限",
  source_unavailable: "来源暂不可用",
  source_review_not_completed: "来源审核未完成",
  requires_manual_review: "需人工复核",
};

const SCOPE_LABELS: Record<string, string> = {
  all: "全部申请人",
  international: "国际生",
  undergraduate: "本科生",
  graduate: "研究生",
};

const PREVIEW_SOURCE: ComparisonCellSource = {
  kind: "preview",
  label: "PathOS Preview 数据集",
  url: null,
};

const MISSING_SOURCE: ComparisonCellSource = {
  kind: "missing",
  label: "缺失",
  url: null,
};

interface FactRowSpec {
  id: string;
  perspective: ComparisonPerspective;
  fieldKey: string;
  direction?: ComparisonDirection;
  description?: string;
  fallback?: (university: UniversitySummary) => ComparisonCellBase | null;
}

interface SummaryRowSpec {
  id: string;
  perspective: ComparisonPerspective;
  label: string;
  description: string;
  direction?: ComparisonDirection;
  render: (university: UniversitySummary) => ComparisonCellBase;
}

const FACT_ROWS: readonly FactRowSpec[] = [
  { id: "acceptance_rate", perspective: "admission", fieldKey: "admission.acceptance_rate", direction: "none", fallback: university => fromNumber(university.acceptanceRate, "%") },
  { id: "sat_25", perspective: "admission", fieldKey: "admission.sat_25", direction: "higher_better", fallback: university => fromNumber(university.sat25, "分") },
  { id: "sat_75", perspective: "admission", fieldKey: "admission.sat_75", direction: "higher_better", fallback: university => fromNumber(university.sat75, "分") },
  { id: "act_25", perspective: "admission", fieldKey: "admission.act_25", direction: "higher_better" },
  { id: "act_75", perspective: "admission", fieldKey: "admission.act_75", direction: "higher_better" },
  { id: "test_policy", perspective: "admission", fieldKey: "admission.test_policy" },
  { id: "english_policy", perspective: "admission", fieldKey: "admission.english_policy" },

  { id: "tuition", perspective: "cost", fieldKey: "cost.tuition", direction: "lower_better", fallback: university => costSummaryCell(university) },
  { id: "fees", perspective: "cost", fieldKey: "cost.fees", direction: "lower_better" },
  { id: "housing", perspective: "cost", fieldKey: "cost.housing", direction: "lower_better" },
  { id: "food", perspective: "cost", fieldKey: "cost.food", direction: "lower_better" },
  { id: "insurance", perspective: "cost", fieldKey: "cost.insurance", direction: "lower_better" },
  { id: "books", perspective: "cost", fieldKey: "cost.books", direction: "lower_better" },
  { id: "estimated_total", perspective: "cost", fieldKey: "cost.estimated_total", direction: "lower_better" },
  { id: "scholarship_available", perspective: "cost", fieldKey: "aid.scholarship_available" },

  { id: "graduation_rate", perspective: "outcome", fieldKey: "outcome.graduation_rate", direction: "higher_better", fallback: university => fromNumber(university.graduationRate, "%") },
  { id: "retention_rate", perspective: "outcome", fieldKey: "outcome.retention_rate", direction: "higher_better", fallback: university => fromNumber(university.retentionRate, "%") },
  { id: "employment_rate", perspective: "outcome", fieldKey: "outcome.employment_rate", direction: "higher_better" },
  { id: "early_career_pay", perspective: "outcome", fieldKey: "outcome.median_early_career_pay", direction: "higher_better" },

  { id: "offered_degrees", perspective: "program", fieldKey: "program.offered_degrees" },
  { id: "application_deadline", perspective: "deadline", fieldKey: "program.application_deadline" },
  { id: "fall_deadline", perspective: "deadline", fieldKey: "program.fall_deadline" },
  { id: "spring_deadline", perspective: "deadline", fieldKey: "program.spring_deadline" },
  { id: "regular_deadline", perspective: "deadline", fieldKey: "deadline.regular_decision" },
];

const SUMMARY_ROWS: readonly SummaryRowSpec[] = [
  {
    id: "national_rank",
    perspective: "admission",
    label: "全美排名",
    description: "当前院校档案中的全美排名。",
    direction: "lower_better",
    render: university => fromNumber(university.rankingSummary?.nationalRank ?? university.nationalRanking ?? null, "#"),
  },
  {
    id: "location",
    perspective: "location",
    label: "城市 / 州",
    description: "院校档案中的地理位置。",
    render: university => ({
      value: [university.city, university.state, university.country].filter(Boolean).join(", ") || null,
      numericValue: null,
      unit: null,
      academicYear: null,
      applicantScope: null,
      missingReason: !university.city && !university.state ? "not_reported" : null,
    }),
  },
  {
    id: "coordinates",
    perspective: "location",
    label: "坐标",
    description: "地图定位使用的经纬度。",
    render: university => ({
      value: university.latitude != null && university.longitude != null
        ? `${university.latitude.toFixed(3)}, ${university.longitude.toFixed(3)}`
        : null,
      numericValue: null,
      unit: null,
      academicYear: null,
      applicantScope: null,
      missingReason: university.latitude == null || university.longitude == null ? "not_reported" : null,
    }),
  },
  {
    id: "undergraduate_enrollment",
    perspective: "location",
    label: "本科学生数",
    description: "当前院校档案中的本科规模。",
    render: university => fromNumber(university.enrollmentSummary?.undergraduate ?? null, "人"),
  },
  {
    id: "graduate_enrollment",
    perspective: "location",
    label: "研究生学生数",
    description: "当前院校档案中的研究生规模。",
    render: university => fromNumber(university.enrollmentSummary?.graduate ?? null, "人"),
  },
  {
    id: "student_faculty_ratio",
    perspective: "location",
    label: "师生比",
    description: "当前院校档案中的师生比。",
    render: university => {
      const value = university.studentFacultyRatio;
      if (typeof value !== "number" || !Number.isFinite(value)) return missingCellBase();
      return {
        value: `1 : ${value.toLocaleString("zh-CN")}`,
        numericValue: value,
        unit: null,
        academicYear: null,
        applicantScope: null,
        missingReason: null,
      };
    },
  },
  {
    id: "program_tags",
    perspective: "program",
    label: "已收录专业标签",
    description: "来自院校汇总数据的专业标签；仅表示已收录，不代表项目等同。",
    render: university => ({
      value: university.topPrograms?.length ? university.topPrograms.slice(0, 8).join(" / ") : null,
      numericValue: university.topPrograms?.length ?? null,
      unit: "项",
      academicYear: null,
      applicantScope: null,
      missingReason: !university.topPrograms?.length ? "not_reported" : null,
    }),
  },
];

function fromNumber(
  value: number | null | undefined,
  unit: string,
): ComparisonCellBase {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return missingCellBase(unit);
  }
  return {
    value: `${value.toLocaleString("zh-CN")}${unit === "%" ? "%" : unit === "#" ? "" : ` ${unit}`}`,
    numericValue: value,
    unit,
    academicYear: null,
    applicantScope: null,
    missingReason: null,
  };
}

function missingCellBase(unit: string | null = null) {
  return {
    value: null,
    numericValue: null as number | null,
    unit,
    academicYear: null as string | null,
    applicantScope: null as string | null,
    // Absence here means PathOS has not collected an approved fact for this
    // slot. It does not mean the school officially reported nothing.
    missingReason: "not_collected",
  };
}

function costSummaryCell(university: UniversitySummary) {
  const summary = university.costSummary;
  if (!summary || (summary.minimumUsd == null && summary.maximumUsd == null)) {
    return missingCellBase("USD");
  }
  const min = summary.minimumUsd ?? summary.maximumUsd!;
  const max = summary.maximumUsd ?? summary.minimumUsd!;
  return {
    value: min === max
      ? `$${min.toLocaleString("zh-CN")}`
      : `$${min.toLocaleString("zh-CN")} - $${max.toLocaleString("zh-CN")}`,
    numericValue: min === max ? min : (min + max) / 2,
    unit: "USD",
    academicYear: null,
    applicantScope: null,
    missingReason: null,
  };
}

function scopePriority(scope: Fact["applicantScope"]): number {
  if (scope === "international") return 0;
  if (scope === "undergraduate") return 1;
  if (scope === "graduate") return 2;
  return 3;
}

function preferredFact(facts: readonly Fact[]): Map<string, Fact> {
  const grouped = new Map<string, Fact[]>();
  for (const fact of facts) {
    grouped.set(fact.fieldKey, [...(grouped.get(fact.fieldKey) ?? []), fact]);
  }
  const preferred = new Map<string, Fact>();
  for (const [fieldKey, candidates] of grouped) {
    const selected = candidates.slice().sort((left, right) => {
      const yearDelta = (right.academicYear ?? "").localeCompare(left.academicYear ?? "");
      if (yearDelta !== 0) return yearDelta;
      const scopeDelta = scopePriority(left.applicantScope) - scopePriority(right.applicantScope);
      if (scopeDelta !== 0) return scopeDelta;
      return new Date(right.retrievedAt).getTime() - new Date(left.retrievedAt).getTime();
    })[0];
    if (selected) preferred.set(fieldKey, selected);
  }
  return preferred;
}

function factValue(fact: Fact): {
  value: string | null;
  numericValue: number | null;
  unit: string | null;
} {
  if (fact.nullReason) return { value: null, numericValue: null, unit: fact.unit ?? null };
  if (fact.valueRange) {
    const suffix = fact.unit ? ` ${fact.unit}` : "";
    return {
      value: `${fact.valueRange.min.toLocaleString("zh-CN")}${suffix} - ${fact.valueRange.max.toLocaleString("zh-CN")}${suffix}`,
      numericValue: (fact.valueRange.min + fact.valueRange.max) / 2,
      unit: fact.unit ?? null,
    };
  }
  if (fact.valueList?.length) {
    return { value: fact.valueList.join(" / "), numericValue: null, unit: fact.unit ?? null };
  }
  if (fact.valueBoolean != null) {
    return { value: fact.valueBoolean ? "是" : "否", numericValue: null, unit: fact.unit ?? null };
  }
  if (fact.valueNumber != null) {
    const prefix = fact.valueType === "currency" ? (fact.currency === "CNY" ? "¥" : "$") : "";
    const suffix = fact.valueType === "percent" ? "%" : "";
    return {
      value: `${prefix}${fact.valueNumber.toLocaleString("zh-CN")}${suffix}`,
      numericValue: fact.valueNumber,
      unit: fact.valueType === "currency"
        ? fact.currency ?? "USD"
        : fact.unit ?? null,
    };
  }
  if (fact.valueText) {
    if (fact.valueType === "date") {
      const date = new Date(fact.valueText);
      return {
        value: Number.isNaN(date.getTime()) ? fact.valueText : date.toISOString().slice(0, 10),
        numericValue: Number.isNaN(date.getTime()) ? null : date.getTime(),
        unit: "UTC",
      };
    }
    return { value: fact.valueText, numericValue: null, unit: fact.unit ?? null };
  }
  return { value: null, numericValue: null, unit: fact.unit ?? null };
}

function factSource(fact: Fact): ComparisonCellSource {
  return {
    kind: "approved_fact",
    label: "Approved fact",
    url: fact.sourceUrl,
    sourceId: fact.sourceId,
    retrievedAt: fact.retrievedAt instanceof Date ? fact.retrievedAt.toISOString() : fact.retrievedAt,
    reviewedAt: fact.reviewedAt instanceof Date ? fact.reviewedAt.toISOString() : fact.reviewedAt,
    confidence: fact.confidence,
  };
}

function factCell(fact: Fact, key: string): ComparisonCell {
  const value = factValue(fact);
  return {
    key,
    value: fact.nullReason ? null : value.value,
    numericValue: fact.nullReason ? null : value.numericValue,
    unit: value.unit,
    academicYear: fact.academicYear ?? null,
    applicantScope: fact.applicantScope ? SCOPE_LABELS[fact.applicantScope] ?? fact.applicantScope : null,
    missingReason: fact.nullReason ?? (value.value == null ? "requires_manual_review" : null),
    source: factSource(fact),
    isBest: false,
    isExtreme: false,
  };
}

function previewCell(
  key: string,
  base: ComparisonCellBase,
): ComparisonCell {
  return {
    key,
    ...base,
    source: base.value == null && base.missingReason ? MISSING_SOURCE : PREVIEW_SOURCE,
    isBest: false,
    isExtreme: false,
  };
}

function markDifferences(row: ComparisonRow): ComparisonRow {
  const numeric = row.cells
    .map(cell => cell.numericValue)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length < 2 || row.direction === "none") return row;
  const units = new Set(row.cells
    .filter(cell => cell.numericValue != null && cell.value != null)
    .map(cell => cell.unit ?? ""));
  if (units.size > 1) return row;
  const best = row.direction === "higher_better" ? Math.max(...numeric) : Math.min(...numeric);
  const worst = row.direction === "higher_better" ? Math.min(...numeric) : Math.max(...numeric);
  const cells = row.cells.map(cell => ({
    ...cell,
    isBest: cell.numericValue === best,
    isExtreme: cell.numericValue === worst && worst !== best,
  }));
  return { ...row, cells };
}

function rowFlags(cells: readonly ComparisonCell[]) {
  const years = cells
    .map(cell => cell.academicYear)
    .filter((value): value is string => Boolean(value));
  const activeSourceKinds = cells
    .filter(cell => cell.source.kind !== "missing")
    .map(cell => cell.source.kind);
  const approvedSources = cells
    .filter(cell => cell.source.kind === "approved_fact" && cell.source.sourceId)
    .map(cell => cell.source.sourceId!);
  return {
    yearMismatch: new Set(years).size > 1,
    sourceMismatch: new Set(activeSourceKinds).size > 1 || new Set(approvedSources).size > 1,
    unitMismatch: new Set(cells
      .filter(cell => cell.value != null)
      .map(cell => cell.unit ?? "")).size > 1,
  };
}

export function createUniversityComparison(
  input: ComparisonModelInput,
): UniversityComparisonModel {
  const universities = input.universities.slice(0, 4);
  const preferred = new Map(universities.map(university => [
    university.id,
    preferredFact(input.factsByUniversity?.[university.id] ?? []),
  ]));

  const rows: ComparisonRow[] = [];
  for (const spec of FACT_ROWS) {
    const cells = universities.map((university, index) => {
      const key = `${university.id}:${spec.id}`;
      const fact = preferred.get(university.id)?.get(spec.fieldKey);
      if (fact) return factCell(fact, key);
      if (spec.fallback) {
        const fallback = spec.fallback(university);
        return fallback ? previewCell(key, fallback) : previewCell(key, missingCellBase());
      }
      return previewCell(key, missingCellBase());
    });
    const flags = rowFlags(cells);
    rows.push(markDifferences({
      id: spec.id,
      perspective: spec.perspective,
      label: schoolFactLabel(spec.fieldKey),
      description: spec.description ?? `${spec.fieldKey} 的已审核事实比较。`,
      direction: spec.direction ?? "none",
      ...flags,
      cells,
    }));
  }

  for (const spec of SUMMARY_ROWS) {
    const cells = universities.map((university, index) =>
      previewCell(`${university.id}:${spec.id}`, spec.render(university)),
    );
    const flags = rowFlags(cells);
    rows.push(markDifferences({
      id: spec.id,
      perspective: spec.perspective,
      label: spec.label,
      description: spec.description,
      direction: spec.direction ?? "none",
      ...flags,
      cells,
    }));
  }

  return {
    universities: universities.map(university => ({
      university,
      approvedFactCount: input.factsByUniversity?.[university.id]?.length ?? 0,
    })),
    rows,
  };
}

export function comparisonRowsForPerspective(
  model: UniversityComparisonModel,
  perspective: ComparisonPerspective,
): ComparisonRow[] {
  return model.rows.filter(row => row.perspective === perspective);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function comparisonToCsv(model: UniversityComparisonModel): string {
  const header = [
    "视角",
    "字段",
    ...model.universities.map(item => item.university.nameZh || item.university.chineseName || item.university.name),
    "学年口径一致",
    "来源口径一致",
    "单位口径一致",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of model.rows) {
    lines.push([
      COMPARISON_PERSPECTIVE_META[row.perspective].title,
      row.label,
      ...row.cells.map(cell => cell.value ?? comparisonMissingLabel(cell)),
      row.yearMismatch ? "否" : "是",
      row.sourceMismatch ? "否" : "是",
      row.unitMismatch ? "否" : "是",
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

export function comparisonMissingLabel(cell: ComparisonCell): string {
  if (cell.missingReason === "not_collected") return "未采集";
  return MISSING_LABELS[cell.missingReason ?? ""] ?? "缺失";
}
