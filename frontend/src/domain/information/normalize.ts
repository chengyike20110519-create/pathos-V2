import type { FactValueType } from "@/domain/information/fact";

export interface NormalizeResult<T> {
  value: T;
  original: unknown;
  normalizedFrom: string;
}

export type NormalizeError =
  | "EMPTY_INPUT"
  | "INVALID_PERCENT"
  | "INVALID_CURRENCY"
  | "INVALID_YEAR"
  | "INVALID_DATE"
  | "INVALID_RANGE";

function originalText(value: string | number): string {
  return String(value).trim();
}

export function normalizePercent(
  input: string | number,
): NormalizeResult<number> {
  const original = originalText(input);
  if (!original) throw new Error("EMPTY_INPUT");
  let numeric: number;
  if (typeof input === "number") {
    numeric = input;
  } else {
    const withoutSymbol = original.replace(/%/g, "").replace(/,/g, "").trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(withoutSymbol)) {
      throw new Error("INVALID_PERCENT");
    }
    numeric = Number(withoutSymbol);
    // A raw decimal below 1 is the common ratio form (0.08 = 8%). A value
    // written with a % sign is already percent and is never re-scaled.
    if (!original.includes("%") && Math.abs(numeric) < 1 && numeric !== 0) {
      numeric *= 100;
    }
  }
  if (Math.abs(numeric) < 1 && numeric !== 0) numeric *= 100;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error("INVALID_PERCENT");
  }
  return {
    value: Number(numeric.toFixed(6)),
    original: input,
    normalizedFrom: typeof input === "number" ? "number" : original.includes("%") ? "percent_text" : "ratio_or_number",
  };
}

export function normalizeCurrencyUsd(
  input: string | number,
): NormalizeResult<number> {
  const original = originalText(input);
  if (!original) throw new Error("EMPTY_INPUT");
  let text = original.replace(/[$,\s]/g, "").replace(/USD/i, "");
  let multiplier = 1;
  const suffix = text.slice(-1).toLowerCase();
  if (suffix === "k") {
    multiplier = 1_000;
    text = text.slice(0, -1);
  } else if (suffix === "m") {
    multiplier = 1_000_000;
    text = text.slice(0, -1);
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error("INVALID_CURRENCY");
  const value = Number(text) * multiplier;
  if (!Number.isFinite(value) || value < 0) throw new Error("INVALID_CURRENCY");
  return {
    value: Math.round(value),
    original: input,
    normalizedFrom: suffix === "k" || suffix === "m" ? "suffixed_currency" : "currency_text",
  };
}

export function normalizeAcademicYear(input: string): string {
  const original = input.trim().toUpperCase();
  const compact = original.replace(/\s+/g, "");
  const match = compact.match(/^(?:FY)?(\d{4})(?:[-/])(\d{2}|\d{4})?$/);
  if (match) {
    const start = Number(match[1]);
    let end: number;
    if (!match[2]) {
      end = start + 1;
    } else if (match[2].length === 2) {
      end = Number(String(start).slice(0, 2) + match[2]);
    } else {
      end = Number(match[2]);
    }
    if (end === start + 1) return `${start}-${end}`;
  }
  if (/^\d{4}$/.test(compact)) return `${compact}-${Number(compact) + 1}`;
  if (/^(?:FALL|AUTUMN)(\d{4})$/.test(compact)) {
    const start = compact.match(/^(?:FALL|AUTUMN)(\d{4})$/)![1];
    return `${start}-${Number(start) + 1}`;
  }
  throw new Error("INVALID_YEAR");
}

function parseDateParts(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  hasTime: boolean;
  explicitUtc: boolean;
} {
  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
      hour: 0,
      minute: 0,
      second: 0,
      hasTime: false,
      explicitUtc: false,
    };
  }
  const dateTime = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!dateTime) throw new Error("INVALID_DATE");
  return {
    year: Number(dateTime[1]),
    month: Number(dateTime[2]),
    day: Number(dateTime[3]),
    hour: Number(dateTime[4]),
    minute: Number(dateTime[5]),
    second: Number(dateTime[6] ?? "0"),
    hasTime: true,
    explicitUtc: /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed),
  };
}

export function normalizeDateToUtc(
  input: string | Date,
  fallbackTimeZone = "UTC",
): string {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error("INVALID_DATE");
    return input.toISOString();
  }
  const parts = parseDateParts(input);
  const explicitOffset = input.trim().match(/([+-]\d{2}):?(\d{2})$/);
  if (explicitOffset) {
    const sign = explicitOffset[1].startsWith("-") ? -1 : 1;
    // The first capture group retains its sign; only the minute component
    // needs the sign applied separately.
    const offsetMinutes = Number(explicitOffset[1]) * 60 + sign * Number(explicitOffset[2]);
    const wallTime = utcDateOrThrow(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const utc = wallTime.getTime() - offsetMinutes * 60_000;
    return new Date(utc).toISOString();
  }
  if (parts.explicitUtc || !parts.hasTime) {
    return utcDateOrThrow(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ).toISOString();
  }
  // Naive timestamps are interpreted in the declared source timezone. This
  // prevents a midnight deadline in Beijing or New York becoming 08:00 UTC.
  const withZone = utcDateOrThrow(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const timeZoneOffsetMinutes = timeZoneOffset(fallbackTimeZone, withZone);
  return new Date(withZone.getTime() - timeZoneOffsetMinutes * 60_000).toISOString();
}

function timeZoneOffset(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const zone = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = zone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function utcDateOrThrow(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error("INVALID_DATE");
  }
  return date;
}

export function normalizeRange(
  input: string | { min: number | string; max: number | string },
): NormalizeResult<{ min: number; max: number }> {
  let min: number;
  let max: number;
  let original: string;
  if (typeof input === "string") {
    original = input.trim();
    const match = original.match(/^(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)$/i);
    if (!match) throw new Error("INVALID_RANGE");
    min = Number(match[1]);
    max = Number(match[2]);
  } else {
    min = typeof input.min === "string" ? Number(input.min.replace(/[,]/g, "")) : input.min;
    max = typeof input.max === "string" ? Number(input.max.replace(/[,]/g, "")) : input.max;
    original = `${input.min}-${input.max}`;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new Error("INVALID_RANGE");
  }
  return { value: { min, max }, original: input, normalizedFrom: typeof input === "string" ? "range_text" : "range_object" };
}

export function normalizeList(input: string | string[]): string[] {
  const values = Array.isArray(input)
    ? input
    : input.split(/[,;、]/);
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) throw new Error("EMPTY_INPUT");
  return normalized;
}

export function inferValueType(fieldKey: string): FactValueType | null {
  if (fieldKey.endsWith("acceptance_rate") || fieldKey.endsWith("_rate")) return "percent";
  if (fieldKey.startsWith("cost.") || fieldKey.endsWith("_pay")) return "currency";
  if (fieldKey.endsWith("_deadline") || fieldKey.endsWith("_date")) return "date";
  if (fieldKey.startsWith("admission.sat_") || fieldKey.startsWith("admission.act_")) return "range";
  if (fieldKey.endsWith("_available") || fieldKey.endsWith("_policy") || fieldKey.startsWith("program.gre_")) return "boolean";
  if (fieldKey.endsWith("_degrees") || fieldKey.endsWith("_programs")) return "list";
  return null;
}
