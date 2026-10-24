import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeStage5Summary } from "@/schemas/stage5-preview.schema";
import { parseProgramSpotlights, parseUniversityDetail } from "@/schemas/dataset.schema";
import { cacheableViewport, viewportContains } from "@/lib/map-viewport";
import { programDefinition, programExploreHref, schoolProgramNames } from "@/lib/university-programs";

const sample = normalizeStage5Summary(JSON.parse(readFileSync("data/preview/universities.json", "utf8"))[0]);
const distinctive = { name: "Symbolic Systems", nameZh: "符号系统学", kind: "distinctive", reason: "Official interdisciplinary description", sourceUrl: "https://symsys.stanford.edu/", checkedOn: "2026-10-19" };

describe("evidence-aware program exploration", () => {
  it("repairs empty legacy admission fields without inventing school facts", () => {
    const detail = parseUniversityDetail({ ...sample, previewMetadata: { admissions: { acceptanceRate: {} } } });
    const field = detail.previewMetadata!.admissions.acceptanceRate;
    expect(field).toMatchObject({ value: null, sourceIds: [], warnings: [], status: "source_review_not_completed" });
    expect(detail.previewMetadata!.enrollment.undergraduate.value).toBeNull();
    expect(detail.previewMetadata!.admissions.testPolicy.sourceIds).toEqual([]);
  });
  it("preserves sourced values and rejects malformed metadata arrays and numeric values", () => {
    const field = { value: 0.156, status: "live_verified_exact", referenceYear: 2025, sourceIds: ["official", 42], warnings: [null, "scope_limited"] };
    const detail = parseUniversityDetail({ ...sample, previewMetadata: { admissions: { acceptanceRate: field }, enrollment: { total: { value: "unknown", sourceIds: "bad" } } } });
    expect(detail.previewMetadata!.admissions.acceptanceRate).toMatchObject({ value: 0.156, referenceYear: 2025, status: "live_verified_exact", sourceIds: ["official"], warnings: ["scope_limited"] });
    expect(detail.previewMetadata!.enrollment.total).toMatchObject({ value: null, sourceIds: [] });
  });
  it("retains uncommon and late alphabetical programs, merges duplicates, and never fabricates top membership", () => {
    const detail = parseUniversityDetail({ ...sample,
      programs: [{ id: "1", name: "Mathematics" }, { id: "2", name: "Symbolic Systems" }],
      previewMetadata: { allMajors: ["Anthropology", "Mathematics", "Zoology"] },
      programSpotlights: [distinctive],
    });
    expect(schoolProgramNames(detail)).toEqual(["Anthropology", "Mathematics", "Symbolic Systems", "Zoology"]);
    expect(detail.programs.every((program) => program.membership === undefined)).toBe(true);
    expect(detail.programSpotlights).toHaveLength(1);
  });
  it("does not promote unreviewed or undated claims to strengths", () => {
    expect(parseProgramSpotlights([{ ...distinctive, kind: "strength" }])).toEqual([]);
    expect(parseProgramSpotlights([{ ...distinctive, sourceUrl: "javascript:alert(1)" }])).toEqual([]);
    expect(parseProgramSpotlights([{ ...distinctive, checkedOn: "" }])).toEqual([]);
    const strength = { ...distinctive, kind: "strength", rankingYear: 2027, educationLevel: "undergraduate", rankingPublisher: "Example publisher", rankingScope: "national_undergraduate_program", rank: 1, tied: false, publishedOn: "2026-09-22" };
    expect(parseProgramSpotlights([strength])).toHaveLength(1);
    expect(parseProgramSpotlights([{ ...strength, educationLevel: "graduate" }])).toEqual([]);
    expect(parseProgramSpotlights([{ ...strength, rankingScope: "overall_university" }])).toEqual([]);
    expect(parseProgramSpotlights([{ ...strength, tied: undefined }])).toEqual([]);
  });
  it("uses a reviewed current directory without appending historical award categories", () => {
    const detail = parseUniversityDetail({ ...sample,
      programs: [{ id: "legacy", name: "Computer and Information Sciences, General" }],
      previewMetadata: {
        allMajors: ["Computer Science", "Mathematics", "Symbolic Systems"],
        allMajorsStatus: { status: "verified_official_undergraduate_majors", nullReason: null },
      },
      programSpotlights: [distinctive],
    });
    expect(schoolProgramNames(detail)).toEqual(["Computer Science", "Mathematics", "Symbolic Systems"]);
    expect(detail.programSpotlights).toHaveLength(1);
  });
  it("keeps exact academic boundaries instead of treating similar names as the same major", () => {
    expect(programDefinition("Computer Science")?.slug).toBe("computer-science");
    expect(programDefinition("Computer Science and Philosophy")).toBeUndefined();
    const href = programExploreHref("Arts & Sciences", "candidate:school");
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("name")).toBe("Arts & Sciences");
    expect(params.get("universityId")).toBe("candidate:school");
  });
  it("rounds outward and reuses an already-covered viewport", () => {
    const outer = cacheableViewport({ west: -123.2, south: 32.1, east: -117.4, north: 39.1 });
    expect(outer).toEqual({ west: -125, south: 30, east: -115, north: 40 });
    expect(viewportContains(outer, { west: -123, south: 33, east: -118, north: 38 })).toBe(true);
    expect(viewportContains(outer, { west: -123, south: 33, east: -110, north: 38 })).toBe(false);
  });
  it("handles date-line crossings and a full-world envelope", () => {
    const crossing = { west: 170, east: -170, south: -20, north: 20 };
    expect(viewportContains(crossing, { west: 175, east: -175, south: -10, north: 10 })).toBe(true);
    expect(viewportContains(crossing, { west: -175, east: -172, south: -10, north: 10 })).toBe(true);
    expect(viewportContains(crossing, { west: -1, east: 1, south: -10, north: 10 })).toBe(false);
    expect(viewportContains({ west: -180, east: 180, south: -90, north: 90 }, crossing)).toBe(true);
  });
});
