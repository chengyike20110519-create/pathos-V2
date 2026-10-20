import type { UniversitySummary } from "@/domain/dataset";
import type { Fact, FactEntityType, FactValueType } from "@/domain/information/fact";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ANSWER_CARD_PATHS,
  ANSWER_CARD_SLUGS,
  answerCardJsonLd,
  createAnswerCard,
} from "@/domain/information/answer-card";
import { describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: queryMock }),
}));

vi.mock("@/lib/product-mode", () => ({
  isInformationPlatformMode: () => true,
}));

vi.mock("@/server/information/fact-repository", () => ({
  listApprovedFacts: vi.fn(),
}));

import { GET as sitemapGet } from "@/app/sitemap.xml/route";
import { loadTraceablePreviewBundle } from "@/server/information/answer-card-service";

const NOW = "2026-10-15T08:00:00.000Z";
const PREVIEW = {
  datasetVersion: "stage5-preview-test",
  sourceCommit: "1234567890abcdef",
  artifactHash: "abcdef1234567890",
};

function university(extra: Partial<UniversitySummary> = {}): UniversitySummary {
  return {
    id: "university-a",
    name: "University A",
    nameZh: "示例大学 A",
    chineseName: "示例大学 A",
    latitude: 38,
    longitude: -97,
    topPrograms: [],
    displayTier: "preview",
    previewOnly: true,
    datasetVersion: PREVIEW.datasetVersion,
    nullableFields: [],
    ...extra,
  };
}

function fact(extra: Partial<Fact> = {}): Fact {
  return {
    entityType: "university",
    entityId: "university-a",
    fieldKey: "admission.test_policy",
    valueType: "text",
    valueText: "Test optional",
    academicYear: "2026-2027",
    applicantScope: "international",
    sourceId: "source-a",
    sourceUrl: "https://example.edu/policy",
    retrievedAt: NOW,
    reviewedAt: NOW,
    reviewStatus: "approved",
    confidence: "high",
    nullReason: null,
    notes: null,
    id: "fact-1",
    factKey: "fact-key-1",
    currentRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

describe("answer card taxonomy", () => {
  it("keeps five canonical high-intent pages and excludes the legacy combined topic", () => {
    expect(ANSWER_CARD_SLUGS).toEqual([
      "computer-science-schools",
      "engineering-schools",
      "us-university-cost-comparison",
      "test-optional-universities",
      "application-deadline-planning",
    ]);
    expect(new Set(ANSWER_CARD_SLUGS).size).toBe(ANSWER_CARD_SLUGS.length);
    expect(ANSWER_CARD_PATHS).not.toContain("/topics/cs-engineering");
  });

  it("emits only canonical topic pages in the real sitemap response", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const response = await sitemapGet();
    const xml = await response.text();
    for (const topicPath of ANSWER_CARD_PATHS) {
      expect(xml).toContain("<loc>https://personal-os-zu9q.onrender.com" + topicPath + "</loc>");
    }
    expect(xml).not.toContain("<loc>https://personal-os-zu9q.onrender.com/topics</loc>");
    expect(xml).not.toContain("/topics/cs-engineering");
  });
});

describe("answer card aggregation", () => {
  it("prefers approved membership facts over Preview program tags", () => {
    const previewOnly = university({
      id: "preview-only",
      name: "Preview Only University",
      nameZh: "Preview 学校",
      topPrograms: ["Mechanical Engineering"],
    });
    const factBacked = university({
      id: "fact-backed",
      name: "Fact Backed University",
      nameZh: "事实学校",
      topPrograms: [],
    });
    const card = createAnswerCard("computer-science-schools", {
      universities: [previewOnly, factBacked],
      facts: [fact({
        id: "membership-1",
        entityType: "major" as FactEntityType,
        entityId: "computer-science",
        fieldKey: "major.program_membership",
        valueText: "fact-backed",
      })],
      preview: PREVIEW,
      now: NOW,
    });

    expect(card.sections[0].title).toContain("已审核事实");
    expect(card.sections[0].items.map((item) => item.id)).toEqual(["fact-backed"]);
    expect(card.sections[0].items[0].evidence[0]).toMatchObject({
      grade: "approved_fact",
      factId: "membership-1",
      sourceUrl: "https://example.edu/policy",
    });
  });

  it("uses traceable Preview evidence only when approved membership facts are absent", () => {
    const cs = university({ id: "cs", topPrograms: ["Computer Science"] });
    const engineering = university({ id: "engineering", topPrograms: ["Mechanical Engineering"] });
    const card = createAnswerCard("computer-science-schools", {
      universities: [cs, engineering],
      preview: PREVIEW,
      now: NOW,
    });

    expect(card.sections[0].items.map((item) => item.id)).toEqual(["cs"]);
    expect(card.sections[0].items[0].evidence[0]).toMatchObject({
      grade: "preview",
      datasetVersion: PREVIEW.datasetVersion,
      sourceCommit: PREVIEW.sourceCommit,
      artifactHash: PREVIEW.artifactHash,
    });
  });

  it("keeps engineering matching independent from the CS card", () => {
    const cs = university({ id: "cs", topPrograms: ["Computer Science"] });
    const engineering = university({ id: "engineering", topPrograms: ["Mechanical Engineering"] });
    const input = { universities: [cs, engineering], preview: PREVIEW, now: NOW };
    expect(createAnswerCard("engineering-schools", input).sections[0].items.map((item) => item.id))
      .toEqual(["engineering"]);
    expect(createAnswerCard("computer-science-schools", input).sections[0].items.map((item) => item.id))
      .toEqual(["cs"]);
  });

  it("uses approved USD costs and does not fall back to Preview when they exist", () => {
    const expensive = university({
      id: "expensive",
      name: "Expensive University",
      nameZh: "高成本学校",
      costSummary: { minimumUsd: 100, maximumUsd: 200, comparisonSafe: true },
    });
    const affordable = university({
      id: "affordable",
      name: "Affordable University",
      nameZh: "低成本学校",
    });
    const card = createAnswerCard("us-university-cost-comparison", {
      universities: [expensive, affordable],
      facts: [
        fact({
          id: "cost-expensive",
          entityId: "expensive",
          fieldKey: "cost.tuition",
          valueType: "currency" as FactValueType,
          valueText: null,
          valueNumber: 60000,
          currency: "USD",
        }),
        fact({
          id: "cost-affordable",
          entityId: "affordable",
          fieldKey: "cost.tuition",
          valueType: "currency" as FactValueType,
          valueText: null,
          valueNumber: 40000,
          currency: "USD",
        }),
      ],
      preview: PREVIEW,
      now: NOW,
    });

    expect(card.sections[0].items.map((item) => item.id)).toEqual(["affordable", "expensive"]);
    expect(card.sections[0].items.every((item) => item.evidence[0].grade === "approved_fact")).toBe(true);
    expect(card.sections[0].items.some((item) => item.value === "$100 - $200")).toBe(false);
  });

  it("only publishes explicit test-optional facts and never infers from missing policies", () => {
    const optional = university({ id: "optional", name: "Optional University", nameZh: "可选学校" });
    const required = university({ id: "required", name: "Required University", nameZh: "必需学校" });
    const card = createAnswerCard("test-optional-universities", {
      universities: [optional, required],
      facts: [
        fact({ id: "optional-policy", entityId: "optional", valueText: "Test optional for 2026" }),
        fact({ id: "required-policy", entityId: "required", valueText: "SAT or ACT required" }),
        fact({ id: "pending-policy", entityId: "optional", valueText: "Test flexible", reviewStatus: "pending" }),
      ],
      now: NOW,
    });

    expect(card.sections[0].items.map((item) => item.id)).toEqual(["optional-policy"]);
    expect(card.answer).toContain("1 条 approved admission.test_policy");
  });

  it("reflects approved deadline fact changes without reusing the previous answer", () => {
    const base = {
      universities: [university()],
      now: NOW,
    };
    const oldCard = createAnswerCard("application-deadline-planning", {
      ...base,
      facts: [fact({
        id: "deadline-old",
        fieldKey: "deadline.regular_decision",
        valueType: "date" as FactValueType,
        valueText: "2027-01-01T23:59:59.000Z",
      })],
    });
    const newCard = createAnswerCard("application-deadline-planning", {
      ...base,
      facts: [fact({
        id: "deadline-new",
        fieldKey: "deadline.regular_decision",
        valueType: "date" as FactValueType,
        valueText: "2027-01-10T23:59:59.000Z",
      })],
    });

    expect(oldCard.sections[0].items[0].value).toBe("2027-01-01T23:59:59.000Z");
    expect(newCard.sections[0].items[0].value).toBe("2027-01-10T23:59:59.000Z");
    expect(newCard.sections[0].items[0].evidence[0].factId).toBe("deadline-new");
  });

  it("stays explicitly uncovered when neither approved facts nor Preview tags support a conclusion", () => {
    const card = createAnswerCard("computer-science-schools", {
      universities: [university({ topPrograms: [] })],
      preview: null,
      now: NOW,
    });
    expect(card.sections[0].items).toHaveLength(0);
    expect(card.answer).toContain("证据不足");
    expect(card.answer).not.toContain("0 所学校");
  });

  it("creates FAQ structured data bound to the canonical topic URL and visible answer", () => {
    const card = createAnswerCard("test-optional-universities", {
      facts: [fact()],
      universities: [university()],
      now: NOW,
    });
    const jsonLd = answerCardJsonLd(card, "https://pathos.example/");
    expect(jsonLd).toMatchObject({
      "@type": "FAQPage",
      url: "https://pathos.example/topics/test-optional-universities",
    });
    const answer = (jsonLd.mainEntity as { acceptedAnswer: { text: string } }).acceptedAnswer.text;
    expect(answer).toContain(card.answer);
    expect(answer).toContain("边界：");
  });

  it("keeps program tags and provenance when the frozen Preview artifact uses legacy nullable fields", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pathos-answer-card-"));
    try {
      await Promise.all([
        writeFile(path.join(dir, "manifest.json"), JSON.stringify({
          datasetVersion: "stage5-legacy",
          sourceCommit: "commit-123",
          artifactHashes: { "universities.json": "artifact-456" },
        })),
        writeFile(path.join(dir, "universities.json"), JSON.stringify([{
          id: "legacy",
          name: "Legacy University",
          nameZh: "旧格式学校",
          latitude: 38,
          longitude: -97,
          rankingSummary: { nationalRank: 12 },
          topPrograms: ["Computer Science"],
        }])),
      ]);
      const bundle = await loadTraceablePreviewBundle({ PATHOS_PREVIEW_BUNDLE_DIR: dir });
      expect(bundle.universities).toHaveLength(1);
      expect(bundle.universities[0].topPrograms).toEqual(["Computer Science"]);
      expect(bundle.provenance).toEqual({
        datasetVersion: "stage5-legacy",
        sourceCommit: "commit-123",
        artifactHash: "artifact-456",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
