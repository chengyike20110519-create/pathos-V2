import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPUS_EDITION_SIZE, campusEditionDay, getCampusEdition, stepCampusRail } from "@/lib/campus-discovery-edition";

describe("campus discovery editions and motion", () => {
  it("changes the shared edition at Shanghai midnight, not device midnight", () => {
    const before = getCampusEdition(Date.parse("2026-10-21T15:59:59Z"));
    const after = getCampusEdition(Date.parse("2026-10-21T16:00:00Z"));
    expect(before.seed).toBe("campus-2026-10-21");
    expect(after.seed).toBe("campus-2026-10-22");
    expect(before.nextAt).toBe(Date.parse("2026-10-21T16:00:00Z"));
    expect(after.nextAt - before.nextAt).toBe(86_400_000);
  });

  it("keeps one edition stable throughout its day", () => {
    expect(getCampusEdition(Date.parse("2026-10-20T16:00:00Z")).seed).toBe(getCampusEdition(Date.parse("2026-10-21T15:59:59Z")).seed);
    expect(CAMPUS_EDITION_SIZE).toBe(6);
  });

  it.each(["first-look", "campus-2026-02-30", "campus-2026-13-01", "campus-not-a-date"])("does not interpret an invalid or legacy seed as an edition: %s", (seed) => {
    expect(campusEditionDay(seed)).toBeNull();
  });

  it("moves at a gentle frame-rate-independent speed and reverses at both edges", () => {
    expect(stepCampusRail(0, 1, 1000, 100)).toEqual({ position: 28, direction: 1 });
    expect(stepCampusRail(99, 1, 1000, 100)).toEqual({ position: 100, direction: -1 });
    expect(stepCampusRail(1, -1, 1000, 100)).toEqual({ position: 0, direction: 1 });
    expect(stepCampusRail(20, 1, 1000, 0)).toEqual({ position: 0, direction: 1 });
    let position = 0;
    for (let frame = 0; frame < 60; frame += 1) position = stepCampusRail(position, 1, 1000 / 60, 1000).position;
    expect(position).toBeCloseTo(28);
  });

  it("does not append more schools or announce every automatic scroll to screen readers", () => {
    const view = readFileSync("src/components/discover/CampusDiscovery.tsx", "utf8");
    expect(view).toContain("limit: CAMPUS_EDITION_SIZE");
    expect(view).not.toContain("loadMore");
    expect(view).not.toContain("aria-live");
    expect(view).toContain("cancelAnimationFrame(frame)");
    expect(view).toContain('document.hidden');
    expect(view).toContain("!interacting && inView && tabVisible");
  });
});
