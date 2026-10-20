import { describe, expect, it } from "vitest";
import {
  classifyDeadlineUrgency,
  createAdmissionRound,
  createApplicationDeadline,
  createMissingDeadline,
  isDeadlineExpired,
  markDeadlineAsHistorical,
  partitionDeadlinesByExpiry,
  projectHistoricalDeadline,
  sortPersonalDeadlineItems,
  type PersonalDeadlineItem,
} from "@/domain/information/deadline";

function deadline(overrides: Partial<Parameters<typeof createApplicationDeadline>[0]> = {}) {
  return createApplicationDeadline({
    entityType: "program",
    entityId: "program:cs",
    title: "MS Computer Science Application",
    type: "application",
    academicYear: "2026-27",
    round: { type: "regular_decision", roundNumber: 1, academicYear: "2026-27" },
    timeZone: "America/New_York",
    localDate: "2027-01-15",
    localTime: "23:59",
    sourceUrl: "https://example.edu/cs/deadlines",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("admission rounds", () => {
  it("normalizes the cycle and builds an explicit round label", () => {
    expect(createAdmissionRound({
      type: "early_decision",
      roundNumber: 2,
      academicYear: "2026/27",
    })).toEqual({
      type: "early_decision",
      roundNumber: 2,
      academicYear: "2026-2027",
      label: "Early Decision 2",
      isFinalRound: false,
    });
  });

  it("rejects invalid round numbers and years", () => {
    expect(() => createAdmissionRound({
      type: "rolling",
      roundNumber: 5,
      academicYear: "2026-27",
    })).toThrow("ROUND_NUMBER_INVALID");
    expect(() => createAdmissionRound({
      type: "rolling",
      academicYear: "unknown",
    })).toThrow("ACADEMICYEAR_INVALID");
  });
});

describe("deadline time zones", () => {
  it("converts an exact local datetime with its declared IANA time zone", () => {
    expect(deadline({ timeZone: "America/New_York" }).dueAtUtc)
      .toBe("2027-01-16T04:59:00.000Z");
    expect(deadline({ timeZone: "Asia/Shanghai" }).dueAtUtc)
      .toBe("2027-01-15T15:59:00.000Z");
  });

  it("treats a date-only deadline as the end of that local day", () => {
    const item = deadline({ localTime: undefined });
    expect(item.precision).toBe("date");
    expect(item.localTime).toBeNull();
    expect(item.dueAtUtc).toBe("2027-01-16T04:59:59.999Z");
  });

  it("requires a complete local date and valid explicit time zone", () => {
    expect(() => deadline({ localDate: "Jan 15" })).toThrow("LOCAL_DATE_INVALID");
    expect(() => deadline({ timeZone: " " })).toThrow("TIMEZONE_REQUIRED");
    expect(() => deadline({ timeZone: "New York" })).toThrow("TIME_ZONE_INVALID");
    expect(() => deadline({
      academicYear: "2026-27",
      round: { type: "regular_decision", academicYear: "2025-26" },
    })).toThrow("ROUND_ACADEMIC_YEAR_MISMATCH");
  });
});

describe("urgency and expiry", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");

  it("classifies urgency by remaining time", () => {
    expect(classifyDeadlineUrgency(
      deadline({ localDate: "2026-10-15", localTime: "12:00:01", timeZone: "UTC" }),
      now,
    ).urgency).toBe("critical");
    expect(classifyDeadlineUrgency(
      deadline({ localDate: "2026-10-22", localTime: "12:00", timeZone: "UTC" }),
      now,
    ).urgency).toBe("critical");
    expect(classifyDeadlineUrgency(
      deadline({ localDate: "2026-10-29", localTime: "12:00", timeZone: "UTC" }),
      now,
    ).urgency).toBe("high");
    expect(classifyDeadlineUrgency(
      deadline({ localDate: "2026-11-14", localTime: "12:00", timeZone: "UTC" }),
      now,
    ).urgency).toBe("medium");
    expect(classifyDeadlineUrgency(
      deadline({ localDate: "2026-12-30", timeZone: "UTC" }),
      now,
    ).urgency).toBe("low");
    expect(classifyDeadlineUrgency(
      deadline({ localDate: "2027-01-15", timeZone: "UTC" }),
      now,
    ).urgency).toBe("later");
  });

  it("never rolls an old published deadline into a future cycle", () => {
    const old = deadline({
      academicYear: "2025-26",
      round: { type: "regular_decision", academicYear: "2025-26" },
      localDate: "2025-11-15",
    });
    expect(isDeadlineExpired(old, now)).toBe(true);
    expect(classifyDeadlineUrgency(old, now).urgency).toBe("expired");
  });

  it("partitions and orders upcoming and expired deadlines", () => {
    const first = deadline({ title: "First", localDate: "2026-11-01" });
    const second = deadline({ title: "Second", localDate: "2026-12-01" });
    const older = deadline({ title: "Older", localDate: "2025-01-01" });
    const nearestExpired = deadline({ title: "Nearest expired", localDate: "2026-10-01" });
    const result = partitionDeadlinesByExpiry([second, older, first, nearestExpired], now);
    expect(result.upcoming.map((item) => item.title)).toEqual(["First", "Second"]);
    expect(result.expired.map((item) => item.title)).toEqual(["Nearest expired", "Older"]);
  });
});

describe("historical deadlines", () => {
  it("marks published historical data without changing its date", () => {
    const source = deadline({
      academicYear: "2025-26",
      round: { type: "regular_decision", academicYear: "2025-26" },
      localDate: "2026-01-15",
    });
    const historical = markDeadlineAsHistorical(source, "published for a previous cycle");
    expect(historical.localDate).toBe("2026-01-15");
    expect(historical.historical).toEqual({
      sourceAcademicYear: "2025-2026",
      reason: "published for a previous cycle",
    });
  });

  it("only projects a later cycle when historical provenance is explicit", () => {
    const source = markDeadlineAsHistorical(deadline({
      academicYear: "2025-26",
      round: { type: "regular_decision", academicYear: "2025-26" },
      localDate: "2026-01-15",
    }), "historical source cycle");
    const projected = projectHistoricalDeadline(source, "2026-27");
    expect(projected.localDate).toBe("2027-01-15");
    expect(projected.academicYear).toBe("2026-2027");
    expect(projected.historical).toEqual({
      sourceAcademicYear: "2025-2026",
      projectedAcademicYear: "2026-2027",
      reason: "projected from a historical admission cycle",
    });
    expect(() => projectHistoricalDeadline(
      markDeadlineAsHistorical(deadline({ localDate: "2028-02-29" }), "leap day"),
      "2029-30",
    )).toThrow("HISTORICAL_DATE_NOT_PROJECTABLE");
  });
});

describe("personal deadline checklist", () => {
  const now = new Date("2026-10-15T00:00:00.000Z");

  it("sorts pinned, upcoming, nearest-expired, and missing items separately", () => {
    const late = deadline({ title: "Late future", localDate: "2026-12-01" });
    const soon = deadline({ title: "Soon", localDate: "2026-10-20" });
    const nearestExpired = deadline({ title: "Nearest expired", localDate: "2026-10-10" });
    const olderExpired = deadline({ title: "Older expired", localDate: "2026-01-01" });
    const missing = createMissingDeadline({
      entityType: "scholarship",
      entityId: "scholarship:merit",
      title: "Merit scholarship deadline",
      type: "scholarship",
      academicYear: "2026-27",
      missingReason: "not_published",
    });
    const pinned: PersonalDeadlineItem = {
      state: "scheduled",
      deadline: late,
      addedAt: "2026-10-02T00:00:00.000Z",
      pinned: true,
    };
    const items: PersonalDeadlineItem[] = [
      { state: "scheduled", deadline: late, addedAt: "2026-10-01T00:00:00.000Z", pinned: false },
      { state: "missing", missingDeadline: missing, addedAt: "2026-10-02T00:00:00.000Z", pinned: false },
      { state: "scheduled", deadline: olderExpired, addedAt: "2026-09-01T00:00:00.000Z", pinned: false },
      pinned,
      { state: "scheduled", deadline: nearestExpired, addedAt: "2026-09-02T00:00:00.000Z", pinned: false },
      { state: "scheduled", deadline: soon, addedAt: "2026-09-03T00:00:00.000Z", pinned: false },
    ];
    expect(sortPersonalDeadlineItems(items, now).map((item) => {
      if (item.state === "scheduled") return item.deadline.title;
      return item.missingDeadline.title;
    })).toEqual([
      "Late future",
      "Soon",
      "Late future",
      "Nearest expired",
      "Older expired",
      "Merit scholarship deadline",
    ]);
  });

  it("keeps missing deadlines explicit and does not invent a due time", () => {
    const missing = createMissingDeadline({
      entityType: "university",
      entityId: "university:example",
      title: "Fall application deadline",
      type: "application",
      academicYear: "2026-27",
      missingReason: "not_reported",
      sourceUrl: "https://example.edu",
      retrievedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(missing.missingReason).toBe("not_reported");
    expect("dueAtUtc" in missing).toBe(false);
    expect(() => createMissingDeadline({
      entityType: "university",
      entityId: "university:example",
      title: "Fall application deadline",
      type: "application",
      academicYear: "2026-27",
      missingReason: "not_reported",
      sourceUrl: "https://example.edu",
    })).toThrow("RETRIEVED_AT_REQUIRED_WITH_SOURCE");
  });
});
