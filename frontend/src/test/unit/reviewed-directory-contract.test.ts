import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStage5Detail, normalizeStage5Detail, parseStage5SourceIndex } from "@/schemas/stage5-preview.schema";
import { parseUniversityDetail } from "@/schemas/dataset.schema";

const root = path.resolve("data/preview");
const json = async (name: string) => JSON.parse(await readFile(path.join(root, name), "utf8"));

describe("reviewed undergraduate directories reach the school card", () => {
  it("accepts every current school and resolves its program source IDs", async () => {
    const universities = await json("universities.json") as Array<{ id: string }>;
    const index = parseStage5SourceIndex(await json("source-index.json"));
    const ids = new Set(index.sources.map((source) => source.sourceId));
    for (const { id } of universities) {
      const raw = await json(`university-details/${id.replace(/^candidate-v2:/, "candidate-v2/")}.json`);
      const parsed = parseStage5Detail(raw);
      const card = parseUniversityDetail(normalizeStage5Detail(parsed, index));
      expect(card.previewMetadata?.allMajors?.length, id).toBe(raw.allMajors.length);
      expect(card.previewMetadata?.allMajorsStatus?.status, id).toBe(raw.allMajorsStatus.status);
      for (const major of raw.allMajors) {
        for (const sourceId of major.sourceIds ?? []) expect(ids.has(sourceId), `${id}: ${sourceId}`).toBe(true);
      }
    }
  });

  it("preserves Stanford Mathematics and Symbolic Systems degree evidence through both parsers", async () => {
    const raw = parseStage5Detail(await json("university-details/candidate-v2/stanford-university.json"));
    const card = parseUniversityDetail(normalizeStage5Detail(raw, parseStage5SourceIndex(await json("source-index.json"))));
    for (const [name, code] of [["Mathematics", "MATH-BS"], ["Symbolic Systems", "SYMBO-BS"]]) {
      expect(card.previewMetadata?.allMajors?.find((major) => major.name === name)).toMatchObject({
        degreePaths: ["BS"], officialProgramCodes: [code], officialUrl: `https://bulletin.stanford.edu/programs/${code}`,
      });
    }
    expect(card.previewMetadata?.allMajors?.find((m) => m.name === "Computer Science")?.degreePaths).toEqual(["BS"]);
  });

  it("retains co-major classification without treating it as a degree", async () => {
    const raw = await json("university-details/candidate-v2/tufts-university.json");
    const major = raw.allMajors.find((m: { name: string }) => m.name === "Environmental Studies");
    expect(major.programType).toBe("co_or_second_major");
    expect(major.degreePaths ?? []).not.toContain("Undergraduate Second Major");
  });

  it("rejects an invented directory status and still rejects unreviewed field status", async () => {
    const raw = await json("university-details/candidate-v2/stanford-university.json");
    expect(() => parseStage5Detail({ ...raw, allMajorsStatus: { ...raw.allMajorsStatus, status: "made_up" } })).toThrow(/unknown status/);
    expect(() => parseStage5Detail({ ...raw, history: { ...raw.history, status: "verified_official_catalog" } })).toThrow(/unknown status/);
  });
});
