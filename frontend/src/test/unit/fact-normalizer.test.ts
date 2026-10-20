import { describe, expect, it } from "vitest";
import {
  inferValueType,
  normalizeAcademicYear,
  normalizeCurrencyUsd,
  normalizeDateToUtc,
  normalizeList,
  normalizePercent,
  normalizeRange,
} from "@/domain/information/normalize";

describe("normalizePercent", () => {
  it("normalizes percent text, ratio form, and numbers", () => {
    expect(normalizePercent("8%").value).toBe(8);
    expect(normalizePercent("0.08").value).toBe(8);
    expect(normalizePercent("8.25").value).toBe(8.25);
    expect(normalizePercent(0.12).value).toBe(12);
  });

  it("rejects malformed and out-of-range values", () => {
    expect(() => normalizePercent(" ")).toThrow("EMPTY_INPUT");
    expect(() => normalizePercent("about 8")).toThrow("INVALID_PERCENT");
    expect(() => normalizePercent("120%")).toThrow("INVALID_PERCENT");
  });
});

describe("normalizeCurrencyUsd", () => {
  it("normalizes currency text and compact suffixes", () => {
    expect(normalizeCurrencyUsd("$58,000").value).toBe(58000);
    expect(normalizeCurrencyUsd("58k").value).toBe(58000);
    expect(normalizeCurrencyUsd("$1.5M").value).toBe(1500000);
    expect(normalizeCurrencyUsd(1200).value).toBe(1200);
  });

  it("rejects negative and malformed currency", () => {
    expect(() => normalizeCurrencyUsd("-$1")).toThrow("INVALID_CURRENCY");
    expect(() => normalizeCurrencyUsd(" tuition ")).toThrow("INVALID_CURRENCY");
  });
});

describe("normalizeAcademicYear", () => {
  it("normalizes academic year variants", () => {
    expect(normalizeAcademicYear("2025-26")).toBe("2025-2026");
    expect(normalizeAcademicYear("2025/2026")).toBe("2025-2026");
    expect(normalizeAcademicYear("2025")).toBe("2025-2026");
    expect(normalizeAcademicYear("Fall 2026")).toBe("2026-2027");
  });

  it("rejects invalid academic years", () => {
    expect(() => normalizeAcademicYear("last year")).toThrow("INVALID_YEAR");
    expect(() => normalizeAcademicYear("2025-2027")).toThrow("INVALID_YEAR");
  });
});

describe("normalizeDateToUtc", () => {
  it("treats date-only values as UTC midnight", () => {
    expect(normalizeDateToUtc("2027-01-01")).toBe("2027-01-01T00:00:00.000Z");
  });

  it("interprets naive timestamps in the declared timezone", () => {
    expect(normalizeDateToUtc("2026-10-15T09:00:00", "America/New_York"))
      .toBe("2026-10-15T13:00:00.000Z");
    expect(normalizeDateToUtc("2026-10-15T09:00:00", "Asia/Shanghai"))
      .toBe("2026-10-15T01:00:00.000Z");
  });

  it("preserves explicit offsets", () => {
    expect(normalizeDateToUtc("2026-10-15T09:00:00+08:00"))
      .toBe("2026-10-15T01:00:00.000Z");
  });

  it("rejects invalid dates", () => {
    expect(() => normalizeDateToUtc("2027-02-30")).toThrow("INVALID_DATE");
    expect(() => normalizeDateToUtc("next Friday")).toThrow("INVALID_DATE");
  });
});

describe("normalizeRange and normalizeList", () => {
  it("supports range text and objects", () => {
    expect(normalizeRange("1500 - 1560").value).toEqual({ min: 1500, max: 1560 });
    expect(normalizeRange({ min: "1,500", max: "1,560" }).value).toEqual({ min: 1500, max: 1560 });
    expect(() => normalizeRange("1560-1500")).toThrow("INVALID_RANGE");
  });

  it("splits Chinese and English list separators", () => {
    expect(normalizeList("BS, MS; PhD、MEng")).toEqual(["BS", "MS", "PhD", "MEng"]);
    expect(() => normalizeList(" , ; ")).toThrow("EMPTY_INPUT");
  });
});

describe("inferValueType", () => {
  it("maps priority fields to value types", () => {
    expect(inferValueType("admission.acceptance_rate")).toBe("percent");
    expect(inferValueType("cost.tuition")).toBe("currency");
    expect(inferValueType("program.fall_deadline")).toBe("date");
    expect(inferValueType("admission.sat_75")).toBe("range");
    expect(inferValueType("program.offered_degrees")).toBe("list");
    expect(inferValueType("profile.city")).toBeNull();
  });
});
