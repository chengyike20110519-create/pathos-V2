import { describe, expect, it } from "vitest";
import { clusterRadiusForZoom, groupProjectedSchools } from "@/lib/map-school-groups";

describe("clusterRadiusForZoom", () => {
  it("uses a larger radius at national zoom and a smaller radius close up", () => {
    expect(clusterRadiusForZoom(3)).toBeGreaterThan(clusterRadiusForZoom(10));
    expect(clusterRadiusForZoom(10)).toBe(24);
  });

  it("keeps a stable fallback for invalid zoom values", () => {
    expect(clusterRadiusForZoom(Number.NaN)).toBe(30);
  });
});
import { parseProgramOptions } from "@/schemas/dataset.schema";

describe("selectable school groups", () => {
  it("keeps every school exactly once, including identical coordinates", () => {
    const points = Array.from({ length: 100 }, (_, index) => ({ id: `school-${index}`, x: 10, y: 10 }));
    const groups = groupProjectedSchools(points);
    expect(groups).toHaveLength(1);
    expect(new Set(groups.flatMap((group) => group.members.map((point) => point.id))).size).toBe(100);
  });
  it("keeps the selected school visible instead of hiding it in its group", () => {
    const points = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }, { id: "c", x: 0, y: 0 }];
    const groups = groupProjectedSchools(points, 30, "b");
    expect(groups.find((group) => group.members.some((point) => point.id === "b"))?.members).toHaveLength(1);
    expect(groups.flatMap((group) => group.members)).toHaveLength(3);
  });
  it("does not merge a connected chain into a single sprawling group", () => {
    const groups = groupProjectedSchools([{ id: "a", x: 0, y: 0 }, { id: "b", x: 25, y: 0 }, { id: "c", x: 50, y: 0 }], 30);
    expect(groups.map((group) => group.members.length)).toEqual([2, 1]);
  });
  it("is independent of input order and handles cell boundaries", () => {
    const points = [{ id: "c", x: 40, y: 40 }, { id: "b", x: 30, y: 10 }, { id: "a", x: 29, y: 10 }];
    expect(groupProjectedSchools(points)).toEqual(groupProjectedSchools([...points].reverse()));
    expect(groupProjectedSchools(points).flatMap((group) => group.members.map((point) => point.id)).sort()).toEqual(["a", "b", "c"]);
  });
  it("ignores invalid coordinates and duplicate IDs without fabricating schools", () => {
    expect(groupProjectedSchools([{ id: "a", x: 1, y: 1 }, { id: "a", x: 1, y: 1 }, { id: "bad", x: NaN, y: 1 }]).flatMap((group) => group.members.map((point) => point.id))).toEqual(["a"]);
  });
});

describe("program option contract", () => {
  it("accepts exact-name directory counts", () => {
    expect(parseProgramOptions([{ name: "Symbolic Systems", schoolCount: 1 }])).toEqual([{ name: "Symbolic Systems", schoolCount: 1 }]);
    expect(parseProgramOptions([])).toEqual([]);
  });
  it("rejects misleading or invalid counts", () => {
    for (const raw of [[{ name: "", schoolCount: 1 }], [{ name: "Program", schoolCount: 0 }], [{ name: "Program", schoolCount: 1.5 }], [{ name: "Program", schoolCount: "1" }], null]) expect(() => parseProgramOptions(raw)).toThrow();
  });
});
