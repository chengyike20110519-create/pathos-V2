import { describe, expect, it } from "vitest";
import { canonicalChineseName, UNIVERSITY_NAME_CATALOG_SIZE } from "@/server/university-name-catalog";
import previewUniversities from "../../../data/preview/universities.json";

describe("university Chinese-name catalogue", () => {
  it("covers the full 94-school preview catalogue", () => {
    expect(UNIVERSITY_NAME_CATALOG_SIZE).toBeGreaterThanOrEqual(94);
    for (const school of previewUniversities) {
      const chinese = canonicalChineseName(school.id, school.name, school.nameZh);
      expect(chinese).toMatch(/[^\x00-\x7F]/);
    }
  });

  it.each([
    ["candidate-v2:clemson-university", "Clemson University", "Clemson", "克莱姆森大学"],
    ["candidate-v2:marquette-university", "Marquette University", "Marquette", "马凯特大学"],
    ["candidate-v2:southern-methodist-university", "Southern Methodist University", "SMU", "南卫理公会大学"],
  ])("replaces an English abbreviation with the reviewed Chinese name", (id, english, database, expected) => {
    expect(canonicalChineseName(id, english, database)).toBe(expected);
  });
});
