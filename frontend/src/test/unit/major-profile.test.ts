import type { CollegeGuide, UniversitySummary } from "@/domain/dataset";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Fact } from "@/domain/information/fact";
import { MAJOR_PROFILES, MAJOR_SLUGS } from "@/domain/information/major";
import { describe, expect, it } from "vitest";
import {
  aggregateMajorCatalog,
  aggregateMajorProfile,
  majorCompareHref,
} from "@/server/information/aggregate-major";

const NOW = "2026-10-15T08:00:00.000Z";
const ROOT = resolve(__dirname, "../../..");

function university(extra: Partial<UniversitySummary> = {}): UniversitySummary {
  return {
    id: "example-university",
    name: "Example University",
    nameZh: "示例大学",
    chineseName: "示例大学",
    latitude: 38,
    longitude: -97,
    topPrograms: [],
    displayTier: "preview",
    previewOnly: true,
    datasetVersion: "test",
    nullableFields: [],
    ...extra,
  };
}

function fact(extra: Partial<Fact> = {}): Fact {
  return {
    entityType: "major",
    entityId: "computer-science",
    fieldKey: "application.english_policy",
    valueType: "text",
    valueText: "TOEFL / IELTS 均可",
    academicYear: "2026-2027",
    applicantScope: "international",
    sourceId: "source-1",
    sourceUrl: "https://example.edu/program",
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

function guide(extra: Partial<CollegeGuide>): CollegeGuide {
  return {
    id: "guide-1",
    sourceFile: "example.md",
    sourceSnapshotYear: 2026,
    sections: [],
    structured: {},
    displayTier: "preview",
    sourceStatus: "source_review_not_completed",
    ...extra,
  };
}

describe("major domain taxonomy", () => {
  it("keeps the planned core twelve majors first and adds data-backed extensions", () => {
    expect(MAJOR_SLUGS.slice(0, 12)).toEqual([
      "computer-science",
      "engineering",
      "business-administration",
      "economics",
      "mathematics",
      "data-science",
      "biology",
      "chemistry",
      "psychology",
      "political-science",
      "communications",
      "art-and-design",
    ]);
    expect(MAJOR_SLUGS.slice(12)).toEqual([
      "finance",
      "nursing",
      "mechanical-engineering",
      "electrical-engineering",
      "computer-engineering",
      "biomedical-engineering",
    ]);
    expect(new Set(MAJOR_SLUGS).size).toBe(MAJOR_SLUGS.length);
    expect(MAJOR_PROFILES.every((major) => major.boundary.length > 0)).toBe(true);
    expect(MAJOR_PROFILES.every((major) => major.adjacent.length === 2)).toBe(true);
  });

  it("maps only explicit program-name variants and keeps adjacent majors separate", () => {
    const ranked = university({
      id: "ranked",
      topPrograms: ["Computer and Information Sciences, General", "Computer Engineering"],
      rankingSummary: { nationalRank: 10 },
    });
    const profile = aggregateMajorProfile("computer-science", { universities: [ranked] });
    const computerEngineering = aggregateMajorProfile("computer-engineering", {
      universities: [ranked],
    });

    expect(profile?.schools).toHaveLength(1);
    expect(profile?.schools[0].matchedProgramNames).toEqual([
      "Computer and Information Sciences, General",
    ]);
    expect(computerEngineering?.schools[0].matchedProgramNames).toEqual(["Computer Engineering"]);
  });
});

describe("major aggregation", () => {
  it("derives, ranks, and deduplicates school associations from real school fields", () => {
    const lowerRank = university({
      id: "lower",
      topPrograms: ["Computer Science"],
      rankingSummary: { nationalRank: 20 },
    });
    const higherRank = university({
      id: "higher",
      topPrograms: ["Computer Science"],
      rankingSummary: { nationalRank: 5 },
    });
    const guideOnly = university({ id: "guide-only" });
    const profile = aggregateMajorProfile("computer-science", {
      universities: [lowerRank, higherRank, guideOnly],
      guides: [
        guide({
          universityId: "guide-only",
          structured: { programs: ["Computer Science"] },
        }),
      ],
    });

    expect(profile?.schools.map((item) => item.universityId)).toEqual([
      "higher",
      "lower",
      "guide-only",
    ]);
    expect(profile?.schools[2].sources).toEqual(["guide_structured_programs"]);
  });

  it("accepts approved membership facts and rejects unreviewed facts", () => {
    const explicit = university({ id: "fact-only" });
    const profile = aggregateMajorProfile("computer-science", {
      universities: [explicit],
      facts: [
        fact({
          id: "membership",
          fieldKey: "major.program_membership",
          valueText: "fact-only",
        }),
        fact({
          id: "pending-membership",
          fieldKey: "major.program_membership",
          valueText: "fact-only",
          reviewStatus: "pending",
        }),
      ],
    });

    expect(profile?.schools).toHaveLength(1);
    expect(profile?.schools[0].sources).toEqual(["approved_fact"]);
  });

  it("fills application and outcome fields only from approved major facts", () => {
    const profile = aggregateMajorProfile("computer-science", {
      facts: [
        fact({ id: "english", fieldKey: "application.english_policy" }),
        fact({
          id: "pay",
          fieldKey: "outcome.early_career_pay",
          valueType: "currency",
          valueText: null,
          valueNumber: 82000,
          currency: "USD",
        }),
        fact({
          id: "pending",
          fieldKey: "outcome.employment_rate",
          valueType: "percent",
          valueText: null,
          valueNumber: 95,
          reviewStatus: "pending",
        }),
      ],
    });

    expect(profile?.applicationRequirements.find((field) => field.id === "english")).toMatchObject({
      status: "approved_fact",
      value: "TOEFL / IELTS 均可",
      sourceUrl: "https://example.edu/program",
    });
    expect(profile?.outcomes.find((field) => field.id === "early_pay")).toMatchObject({
      status: "approved_fact",
      value: "82000",
    });
    expect(profile?.outcomes.find((field) => field.id === "employment")).toMatchObject({
      status: "missing",
      value: "待核验",
    });
  });

  it("keeps every catalog major explicit even when no school association exists", () => {
    const catalog = aggregateMajorCatalog({});
    expect(catalog).toHaveLength(18);
    expect(catalog.every((profile) => profile.schools.length === 0)).toBe(true);
    expect(catalog.every((profile) => profile.missingFieldCount === 7)).toBe(true);
  });

  it("builds a compare deep link from the top two ranked schools", () => {
    const first = university({
      id: "first",
      topPrograms: ["Biology"],
      rankingSummary: { nationalRank: 1 },
    });
    const second = university({
      id: "second",
      topPrograms: ["Biology"],
      rankingSummary: { nationalRank: 2 },
    });
    const profile = aggregateMajorProfile("biology", { universities: [second, first] });

    expect(profile && majorCompareHref(profile)).toBe("/compare?ids=first,second");
  });
});

describe("major page integration contract", () => {
  it("feeds school tags and structured guide records into both major pages", () => {
    const index = readFileSync(
      resolve(ROOT, "src/components/major/MajorIndexView.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      resolve(ROOT, "src/components/major/MajorDetailView.tsx"),
      "utf8",
    );
    for (const source of [index, detail]) {
      expect(source).toContain("useCollegeGuides(source)");
      expect(source).toContain("guides: guideRecords");
    }
    expect(detail).toContain("field.sourceUrl");
  });
});
