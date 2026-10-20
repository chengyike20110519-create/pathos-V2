import type { UniversitySummary } from "@/domain/dataset";
import type { Fact } from "@/domain/information/fact";

export const ANSWER_CARD_SLUGS = [
  "computer-science-schools",
  "engineering-schools",
  "us-university-cost-comparison",
  "test-optional-universities",
  "application-deadline-planning",
] as const;
export type AnswerCardSlug = (typeof ANSWER_CARD_SLUGS)[number];

export interface AnswerCardDefinition {
  slug: AnswerCardSlug;
  title: string;
  question: string;
  description: string;
  keywords: readonly string[];
  relatedLinks: readonly { label: string; href: string; description: string }[];
}

export const ANSWER_CARD_DEFINITIONS: Record<AnswerCardSlug, AnswerCardDefinition> = {
  "computer-science-schools": {
    slug: "computer-science-schools",
    title: "美国大学计算机科学选校清单",
    question: "哪些美国大学当前被 PathOS 收录为计算机科学相关选校对象？",
    description: "基于已审核专业隶属事实或可追溯 Preview 专业标签生成答案卡，不推断项目强弱或录取概率。",
    keywords: ["美国计算机科学选校", "CS 本科申请", "美国大学 CS 名单"],
    relatedLinks: [
      { label: "计算机科学专业档案", href: "/majors/computer-science", description: "查看专业边界和相近专业差异" },
      { label: "六视角对比", href: "/compare", description: "把候选学校放进同一口径比较" },
    ],
  },
  "engineering-schools": {
    slug: "engineering-schools",
    title: "美国大学工程方向选校清单",
    question: "哪些美国大学当前被 PathOS 收录为工程方向选校对象？",
    description: "基于已审核专业隶属事实或可追溯 Preview 专业标签生成答案卡，标签不代表项目质量评级。",
    keywords: ["美国工程方向选校", "工程本科申请", "美国大学工程专业"],
    relatedLinks: [
      { label: "工程专业档案", href: "/majors/engineering", description: "查看工程专业的边界说明" },
      { label: "六视角对比", href: "/compare", description: "比较录取、成本、项目等信息" },
    ],
  },
  "us-university-cost-comparison": {
    slug: "us-university-cost-comparison",
    title: "美国大学学费成本对比",
    question: "当前事实层能比较哪些美国大学的官方学费或 Preview 学费区间？",
    description: "优先展示已审核 USD 成本事实；没有已审核成本时显式降级到 Preview 学费区间，并保留学年与比较安全标记。",
    keywords: ["美国大学学费对比", "留学成本", "美国学费查询"],
    relatedLinks: [
      { label: "成本与奖学金中心", href: "/costs", description: "计算多年成本和人民币区间" },
      { label: "数据工作台", href: "/s/home", description: "管理选校清单和报告" },
    ],
  },
  "test-optional-universities": {
    slug: "test-optional-universities",
    title: "Test Optional 美国大学名单",
    question: "哪些学校的已审核事实明确写着 test optional 标化政策？",
    description: "只收录已审核 admission.test_policy 事实中明确出现 test optional 的学校；缺失、模糊或待审核政策不进入名单。",
    keywords: ["test optional 名单", "美国大学标化政策", "无需 SAT ACT"],
    relatedLinks: [
      { label: "申请日历", href: "/deadlines", description: "查看已审核截止日期" },
      { label: "六视角对比", href: "/compare", description: "比较标化区间和录取口径" },
    ],
  },
  "application-deadline-planning": {
    slug: "application-deadline-planning",
    title: "美国大学申请截止日规划",
    question: "当前事实层有哪些可核验的美国大学申请截止日期？",
    description: "只使用已审核 date facts 排列申请截止时间；不把往年日期加一年，也不用默认日期补齐缺失学校。",
    keywords: ["美国大学申请截止日", "申请日历", "留学时间规划"],
    relatedLinks: [
      { label: "申请日历中心", href: "/deadlines", description: "查看完整日历和缺失状态" },
      { label: "成本与奖学金中心", href: "/costs", description: "同步规划资金材料" },
    ],
  },
};

export const ANSWER_CARD_PATHS = ANSWER_CARD_SLUGS.map((slug) => `/topics/${slug}`);

export function isAnswerCardSlug(value: string): value is AnswerCardSlug {
  return (ANSWER_CARD_SLUGS as readonly string[]).includes(value);
}

export function findAnswerCardDefinition(slug: string): AnswerCardDefinition | null {
  return isAnswerCardSlug(slug) ? ANSWER_CARD_DEFINITIONS[slug] : null;
}

export type AnswerEvidenceGrade = "approved_fact" | "preview";

export interface AnswerEvidence {
  grade: AnswerEvidenceGrade;
  sourceLabel: string;
  sourceUrl: string | null;
  factId?: string;
  fieldKey?: string;
  sourceId?: string;
  retrievedAt?: string;
  reviewedAt?: string;
  confidence?: Fact["confidence"];
  datasetVersion?: string;
  sourceCommit?: string;
  artifactHash?: string;
}

export interface AnswerItem {
  id: string;
  label: string;
  value?: string;
  detail?: string;
  href?: string;
  evidence: readonly AnswerEvidence[];
}

export interface AnswerSection {
  id: string;
  title: string;
  statement: string;
  items: readonly AnswerItem[];
  coverageCount: number;
  evidenceCount: number;
}

export interface PreviewProvenance {
  datasetVersion: string;
  sourceCommit: string | null;
  artifactHash: string | null;
}

export type DataLayerAvailability = "available" | "unavailable";

export interface AnswerCardModelInput {
  facts?: readonly Fact[];
  universities?: readonly UniversitySummary[];
  preview?: PreviewProvenance | null;
  approvedFactsAvailability?: DataLayerAvailability;
  previewAvailability?: DataLayerAvailability;
  notices?: readonly string[];
  now?: Date | string;
}

export interface AnswerCard {
  definition: AnswerCardDefinition;
  generatedAt: string;
  dataAsOf: string | null;
  answer: string;
  limitations: readonly string[];
  sections: readonly AnswerSection[];
  availability: {
    approvedFacts: DataLayerAvailability;
    preview: DataLayerAvailability;
  };
  notices: readonly string[];
}

const CS_KEYWORDS = [
  "computer science", "computing", "informatics", "software", "data science",
  "artificial intelligence", "machine learning", "cybersecurity", "computer engineering",
];

const ENGINEERING_KEYWORDS = [
  "engineering", "mechanical engineering", "electrical engineering", "civil engineering",
  "chemical engineering", "aerospace", "biomedical engineering", "industrial engineering",
  "materials engineering",
];

function normalizeNow(now: Date | string = new Date()): string {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error("invalid answer card timestamp");
  return date.toISOString();
}

function previewEvidence(preview: PreviewProvenance | null | undefined): AnswerEvidence {
  return {
    grade: "preview",
    sourceLabel: "PathOS 可追溯 Preview 数据集",
    sourceUrl: null,
    datasetVersion: preview?.datasetVersion,
    sourceCommit: preview?.sourceCommit ?? undefined,
    artifactHash: preview?.artifactHash ?? undefined,
  };
}

function factEvidence(fact: Fact): AnswerEvidence {
  return {
    grade: "approved_fact",
    sourceLabel: "Approved fact",
    sourceUrl: fact.sourceUrl,
    factId: fact.id,
    fieldKey: fact.fieldKey,
    sourceId: fact.sourceId,
    retrievedAt: fact.retrievedAt instanceof Date ? fact.retrievedAt.toISOString() : fact.retrievedAt,
    reviewedAt: (fact.reviewedAt instanceof Date ? fact.reviewedAt.toISOString() : fact.reviewedAt) ?? undefined,
    confidence: fact.confidence,
  };
}

function universityLabel(university: UniversitySummary | undefined, id: string): string {
  return university?.nameZh || university?.name || id;
}

function nationalRank(university: UniversitySummary | undefined): number | null {
  const rank = university?.rankingSummary?.nationalRank ?? university?.nationalRanking;
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? rank : null;
}

function sortUniversities(
  left: { university?: UniversitySummary; id: string },
  right: { university?: UniversitySummary; id: string },
): number {
  const leftRank = nationalRank(left.university);
  const rightRank = nationalRank(right.university);
  if (leftRank != null && rightRank != null) return leftRank - rightRank;
  if (leftRank != null) return -1;
  if (rightRank != null) return 1;
  return universityLabel(left.university, left.id).localeCompare(
    universityLabel(right.university, right.id),
    "zh-Hans-CN",
  );
}

function factTextValues(fact: Fact): string[] {
  if (fact.valueList != null && fact.valueList.length > 0) return fact.valueList;
  if (fact.valueText != null && fact.valueText.trim()) {
    return fact.valueText.split(/[,，;；]/).map((value) => value.trim()).filter(Boolean);
  }
  return [];
}

function factMoney(fact: Fact): { min: number; max: number; label: string } | null {
  if (fact.currency !== "USD" || fact.nullReason != null) return null;
  if (fact.valueType === "currency" && typeof fact.valueNumber === "number") {
    return { min: fact.valueNumber, max: fact.valueNumber, label: "$" + Math.round(fact.valueNumber).toLocaleString("en-US") };
  }
  if (fact.valueType === "range" && fact.valueRange != null) {
    return {
      min: fact.valueRange.min,
      max: fact.valueRange.max,
      label: "$" + Math.round(fact.valueRange.min).toLocaleString("en-US") + " - $" + Math.round(fact.valueRange.max).toLocaleString("en-US"),
    };
  }
  return null;
}

function unavailableSection(id: string, title: string, statement: string): AnswerSection {
  return { id, title, statement, items: [], coverageCount: 0, evidenceCount: 0 };
}

function sectionEvidenceCount(items: readonly AnswerItem[]): number {
  const ids = new Set<string>();
  for (const item of items) {
    for (const evidence of item.evidence) {
      ids.add(evidence.factId ?? evidence.grade + ":" + (evidence.datasetVersion ?? ""));
    }
  }
  return ids.size;
}

function createProgramMembershipCard(
  definition: AnswerCardDefinition,
  majorId: string,
  keywords: readonly string[],
  input: AnswerCardModelInput,
): AnswerCard {
  const universitiesById = new Map((input.universities ?? []).map((item) => [item.id, item]));
  const membershipFacts = (input.facts ?? []).filter((fact) =>
    fact.reviewStatus === "approved" &&
    fact.entityType === "major" &&
    fact.entityId === majorId &&
    fact.fieldKey === "major.program_membership" &&
    factTextValues(fact).length > 0,
  );

  let items: AnswerItem[];
  let coverageCount = 0;
  if (membershipFacts.length > 0) {
    const factIds = new Set(membershipFacts.flatMap((fact) => factTextValues(fact)));
    coverageCount = factIds.size;
    items = [...factIds]
      .map((id) => ({ id, university: universitiesById.get(id) }))
      .sort(sortUniversities)
      .slice(0, 24)
      .map(({ id, university }) => ({
        id,
        label: universityLabel(university, id),
        value: nationalRank(university) ? "US News #" + nationalRank(university) : "未进入当前数值排名口径",
        href: university ? "/university/" + encodeURIComponent(university.id) : undefined,
        evidence: membershipFacts.filter((fact) => factTextValues(fact).includes(id)).map(factEvidence),
      }));
  } else {
    const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
    const matches = (input.universities ?? [])
      .filter((university) => {
        const text = (university.topPrograms ?? []).join(" ").toLowerCase();
        return lowerKeywords.some((keyword) => text.includes(keyword));
      });
    coverageCount = matches.length;
    items = matches
      .sort((left, right) => sortUniversities({ id: left.id, university: left }, { id: right.id, university: right }))
      .slice(0, 24)
      .map((university) => ({
        id: university.id,
        label: universityLabel(university, university.id),
        value: nationalRank(university) ? "US News #" + nationalRank(university) : "未进入当前数值排名口径",
        detail: (university.topPrograms ?? []).filter((program) => {
          const text = program.toLowerCase();
          return lowerKeywords.some((keyword) => text.includes(keyword));
        }).slice(0, 3).join(" / "),
        href: "/university/" + encodeURIComponent(university.id),
        evidence: [previewEvidence(input.preview)],
      }));
  }

  const grade = membershipFacts.length > 0 ? "已审核事实" : "可追溯 Preview";
  const section = items.length ? {
    id: "program-membership",
    title: definition.title + " · " + grade,
    statement: membershipFacts.length > 0
      ? "当前事实层覆盖 " + coverageCount + " 所学校，页面最多展示 24 所，来源为 approved major.program_membership。"
      : "当前 Preview 标签覆盖 " + coverageCount + " 所学校，页面最多展示 24 所，来源为 topPrograms。",
    items,
    coverageCount,
    evidenceCount: sectionEvidenceCount(items),
  } : unavailableSection(
    "program-membership",
    definition.title + " · 未覆盖",
    "当前没有可用的已审核专业隶属事实，也没有可匹配的 Preview 专业标签。",
  );

  return finalizeCard(definition, input, [section], [
    membershipFacts.length > 0
      ? "名单只表示已审核专业隶属关系，不表示项目质量、录取难度或就业结果。"
      : "Preview 专业标签只表示当前数据集收录了相关名称，不等于项目等同或质量评级。",
  ]);
}

function createCostComparisonCard(definition: AnswerCardDefinition, input: AnswerCardModelInput): AnswerCard {
  const universitiesById = new Map((input.universities ?? []).map((item) => [item.id, item]));
  const byUniversity = new Map<string, Fact[]>();
  for (const fact of input.facts ?? []) {
    if (fact.reviewStatus !== "approved" || fact.entityType !== "university") continue;
    if (fact.fieldKey !== "cost.estimated_total" && fact.fieldKey !== "cost.tuition") continue;
    if (factMoney(fact) == null) continue;
    byUniversity.set(fact.entityId, [...(byUniversity.get(fact.entityId) ?? []), fact]);
  }

  let items: AnswerItem[];
  let coverageCount = 0;
  if (byUniversity.size > 0) {
    coverageCount = byUniversity.size;
    items = [...byUniversity.entries()]
      .map(([id, facts]) => {
        const selected = facts.slice().sort((left, right) => {
          const priority = left.fieldKey === "cost.estimated_total" ? 0 : 1;
          const other = right.fieldKey === "cost.estimated_total" ? 0 : 1;
          if (priority !== other) return priority - other;
          return new Date(right.retrievedAt).getTime() - new Date(left.retrievedAt).getTime();
        })[0];
        const amount = factMoney(selected);
        const university = universitiesById.get(id);
        return {
          id,
          label: universityLabel(university, id),
          value: amount?.label ?? "金额不可用",
          detail: selected.fieldKey + " · " + (selected.academicYear ?? "学年缺失"),
          href: university ? "/university/" + encodeURIComponent(university.id) : undefined,
          evidence: [factEvidence(selected)],
          sortValue: amount,
        };
      })
      .sort((left, right) => (left.sortValue?.min ?? Infinity) - (right.sortValue?.min ?? Infinity))
      .slice(0, 24)
      .map(({ sortValue, ...item }) => item);
  } else {
    const matches = (input.universities ?? [])
      .filter((university) => university.costSummary?.minimumUsd != null || university.costSummary?.maximumUsd != null)
    coverageCount = matches.length;
    items = matches
      .sort((left, right) => {
        const leftCost = left.costSummary?.minimumUsd ?? left.costSummary?.maximumUsd ?? Infinity;
        const rightCost = right.costSummary?.minimumUsd ?? right.costSummary?.maximumUsd ?? Infinity;
        return leftCost - rightCost;
      })
      .slice(0, 24)
      .map((university) => {
        const min = university.costSummary?.minimumUsd ?? university.costSummary?.maximumUsd;
        const max = university.costSummary?.maximumUsd ?? university.costSummary?.minimumUsd;
        return {
          id: university.id,
          label: universityLabel(university, university.id),
          value: min != null && max != null
            ? "$" + Math.round(min).toLocaleString("en-US") + " - $" + Math.round(max).toLocaleString("en-US")
            : "金额不可用",
          detail: university.costSummary?.comparisonSafe === false
            ? "Preview 标记为不同 scope，不能直接等同比较"
            : "Preview 学费区间",
          href: "/university/" + encodeURIComponent(university.id),
          evidence: [previewEvidence(input.preview)],
        };
      });
  }

  const section = items.length ? {
    id: "cost-comparison",
    title: byUniversity.size > 0 ? "官方已审核成本事实" : "可追溯 Preview 学费区间",
    statement: byUniversity.size > 0
      ? "当前有 " + coverageCount + " 所学校具备 approved USD 成本事实，页面最多展示 24 所并按低值升序。"
      : "当前有 " + coverageCount + " 所学校具备 Preview 学费区间，页面最多展示 24 所并按低值升序。",
    items,
    coverageCount,
    evidenceCount: sectionEvidenceCount(items),
  } : unavailableSection("cost-comparison", "成本对比 · 未覆盖", "当前没有 approved USD 成本事实，也没有可用 Preview 学费区间。");

  return finalizeCard(definition, input, [section], [
    "金额只表示当前来源口径下的学费或估算总成本，不包含未提供的个人支出、汇率波动或后续涨价。",
  ]);
}

function createTestOptionalCard(definition: AnswerCardDefinition, input: AnswerCardModelInput): AnswerCard {
  const universitiesById = new Map((input.universities ?? []).map((item) => [item.id, item]));
  const explicitFacts = (input.facts ?? []).filter((fact) => {
    const text = fact.valueText ?? "";
    return fact.reviewStatus === "approved" && fact.entityType === "university" &&
      fact.fieldKey === "admission.test_policy" &&
      (/test[-\s]?optional/i.test(text) || /不要求\s*(sat|act)/i.test(text));
  });
  const coverageCount = explicitFacts.length;
  const items = explicitFacts
    .map((fact) => {
      const university = universitiesById.get(fact.entityId);
      return {
        id: fact.id,
        label: universityLabel(university, fact.entityId),
        value: fact.valueText?.trim() ?? "政策文本缺失",
        detail: (fact.academicYear ?? "学年缺失") + " · " + (fact.applicantScope ?? "all"),
        href: university ? "/university/" + encodeURIComponent(university.id) : undefined,
        evidence: [factEvidence(fact)],
        sortValue: nationalRank(university),
      };
    })
    .sort((left, right) => {
      if (left.sortValue != null && right.sortValue != null) return left.sortValue - right.sortValue;
      if (left.sortValue != null) return -1;
      if (right.sortValue != null) return 1;
      return left.label.localeCompare(right.label, "zh-Hans-CN");
    });

  const section = items.length ? {
    id: "test-optional",
    title: "明确 test optional 的已审核政策",
    statement: "当前有 " + items.length + " 条 approved admission.test_policy 事实明确写出 test optional。",
    items,
    coverageCount,
    evidenceCount: sectionEvidenceCount(items),
  } : unavailableSection(
    "test-optional",
    "Test optional · 未生成名单",
    "当前没有明确写出 test optional 的已审核政策事实。缺失、模糊或待审核政策不会被推断为 test optional。",
  );

  return finalizeCard(definition, input, [section], [
    "test optional 不等于免交所有材料，也不代表国际生英语要求豁免；申请前仍需核对项目细则。",
  ]);
}

function createDeadlinePlanningCard(definition: AnswerCardDefinition, input: AnswerCardModelInput): AnswerCard {
  const universitiesById = new Map((input.universities ?? []).map((item) => [item.id, item]));
  const items: Array<AnswerItem & { sortValue: number }> = [];
  for (const fact of input.facts ?? []) {
    if (fact.reviewStatus !== "approved" || fact.entityType !== "university") continue;
    if (!fact.fieldKey.toLowerCase().includes("deadline") || fact.valueType !== "date" || fact.valueText == null) continue;
    const due = new Date(fact.valueText);
    if (Number.isNaN(due.getTime())) continue;
    const university = universitiesById.get(fact.entityId);
    items.push({
      id: fact.id,
      label: universityLabel(university, fact.entityId),
      value: due.toISOString(),
      detail: fact.fieldKey + " · " + (fact.academicYear ?? "学年缺失"),
      href: university ? "/university/" + encodeURIComponent(university.id) : undefined,
      evidence: [factEvidence(fact)],
      sortValue: due.getTime(),
    });
  }
  const coverageCount = items.length;
  const ordered = items.sort((left, right) => left.sortValue - right.sortValue)
    .slice(0, 24)
    .map(({ sortValue, ...item }) => item);

  const section = ordered.length ? {
    id: "deadline-planning",
    title: "可核验申请截止日期",
    statement: "当前有 " + coverageCount + " 条有效 approved date facts，页面最多展示 24 条并按时间升序。",
    items: ordered,
    coverageCount,
    evidenceCount: sectionEvidenceCount(ordered),
  } : unavailableSection(
    "deadline-planning",
    "截止日规划 · 未覆盖",
    "当前没有可解析的 approved date deadline facts；页面不使用往年日期推断新周期。",
  );

  return finalizeCard(definition, input, [section], [
    "日期按事实原文转换成 UTC 展示；事实层未携带来源 IANA 时区时，不猜测校园当地时间。",
  ]);
}

function finalizeCard(
  definition: AnswerCardDefinition,
  input: AnswerCardModelInput,
  sections: readonly AnswerSection[],
  cardLimitations: readonly string[],
): AnswerCard {
  const evidenceDates = (input.facts ?? [])
    .map((fact) => new Date(fact.retrievedAt).getTime())
    .filter((value) => Number.isFinite(value));
  const supported = sections.filter((section) => section.items.length > 0);
  return {
    definition,
    generatedAt: normalizeNow(input.now),
    dataAsOf: evidenceDates.length ? new Date(Math.max(...evidenceDates)).toISOString() : input.preview?.datasetVersion ?? null,
    answer: supported.length
      ? supported[0].statement + " 答案只引用页面下方列出的证据来源。"
      : "当前证据不足以生成结论性名单；页面保持显式未覆盖状态。",
    limitations: [...cardLimitations, ...(input.notices ?? [])],
    sections,
    availability: {
      approvedFacts: input.approvedFactsAvailability ?? "available",
      preview: input.previewAvailability ?? (input.universities?.length ? "available" : "unavailable"),
    },
    notices: input.notices ?? [],
  };
}

export function createAnswerCard(slug: AnswerCardSlug, input: AnswerCardModelInput = {}): AnswerCard {
  const definition = ANSWER_CARD_DEFINITIONS[slug];
  switch (slug) {
    case "computer-science-schools":
      return createProgramMembershipCard(definition, "computer-science", CS_KEYWORDS, input);
    case "engineering-schools":
      return createProgramMembershipCard(definition, "engineering", ENGINEERING_KEYWORDS, input);
    case "us-university-cost-comparison":
      return createCostComparisonCard(definition, input);
    case "test-optional-universities":
      return createTestOptionalCard(definition, input);
    case "application-deadline-planning":
      return createDeadlinePlanningCard(definition, input);
  }
}

export function answerCardJsonLd(card: AnswerCard, siteUrl: string): Record<string, unknown> {
  const origin = siteUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: origin + "/topics/" + card.definition.slug,
    mainEntity: {
      "@type": "Question",
      name: card.definition.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: [
          card.answer,
          ...card.sections.map((section) => section.title + "：" + section.statement),
          ...card.limitations.map((limitation) => "边界：" + limitation),
        ].join("\n"),
      },
    },
  };
}
