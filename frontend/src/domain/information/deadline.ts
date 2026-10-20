import { normalizeAcademicYear } from "@/domain/information/normalize";

export const DEADLINE_TYPES = [
  "application",
  "scholarship",
  "document",
  "test_score",
  "deposit",
  "orientation",
  "other",
] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const ADMISSION_ROUND_TYPES = [
  "early_decision",
  "early_action",
  "priority",
  "regular_decision",
  "rolling",
  "transfer",
] as const;
export type AdmissionRoundType = (typeof ADMISSION_ROUND_TYPES)[number];

export const DEADLINE_MISSING_REASONS = [
  "not_published",
  "not_reported",
  "requires_manual_review",
  "source_unavailable",
  "not_applicable",
] as const;
export type DeadlineMissingReason = (typeof DEADLINE_MISSING_REASONS)[number];

export type DeadlineUrgency =
  | "expired"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "later";

export interface AdmissionRound {
  type: AdmissionRoundType;
  roundNumber: number;
  academicYear: string;
  label: string;
  isFinalRound: boolean;
}

export interface AdmissionRoundInput {
  type: AdmissionRoundType;
  roundNumber?: number;
  academicYear: string;
  label?: string;
  isFinalRound?: boolean;
}

export interface DeadlineHistoricalAnnotation {
  sourceAcademicYear: string;
  projectedAcademicYear?: string;
  reason: string;
}

export interface ApplicationDeadline {
  entityType: "university" | "program" | "scholarship";
  entityId: string;
  title: string;
  type: DeadlineType;
  academicYear: string;
  round: AdmissionRound | null;
  timeZone: string;
  localDate: string;
  localTime: string | null;
  precision: "date" | "datetime";
  dueAtUtc: string;
  sourceUrl: string;
  retrievedAt: string;
  historical: DeadlineHistoricalAnnotation | null;
}

export interface ApplicationDeadlineInput {
  entityType: ApplicationDeadline["entityType"];
  entityId: string;
  title: string;
  type: DeadlineType;
  academicYear: string;
  round?: AdmissionRoundInput | null;
  timeZone: string;
  localDate: string;
  localTime?: string;
  sourceUrl: string;
  retrievedAt: string;
}

export interface MissingDeadline {
  entityType: ApplicationDeadline["entityType"];
  entityId: string;
  title: string;
  type: DeadlineType;
  academicYear: string;
  round: AdmissionRound | null;
  missingReason: DeadlineMissingReason;
  sourceUrl: string | null;
  retrievedAt: string | null;
}

export interface MissingDeadlineInput {
  entityType: ApplicationDeadline["entityType"];
  entityId: string;
  title: string;
  type: DeadlineType;
  academicYear: string;
  round?: AdmissionRoundInput | null;
  missingReason: DeadlineMissingReason;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
}

export type PersonalDeadlineItem =
  | {
      state: "scheduled";
      deadline: ApplicationDeadline;
      addedAt: string;
      pinned: boolean;
    }
  | {
      state: "missing";
      missingDeadline: MissingDeadline;
      addedAt: string;
      pinned: boolean;
    };

export interface DeadlineUrgencyResult {
  urgency: DeadlineUrgency;
  millisecondsRemaining: number;
  daysRemaining: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isDeadlineType(value: unknown): value is DeadlineType {
  return includes(DEADLINE_TYPES, value);
}

export function isAdmissionRoundType(value: unknown): value is AdmissionRoundType {
  return includes(ADMISSION_ROUND_TYPES, value);
}

export function isDeadlineMissingReason(value: unknown): value is DeadlineMissingReason {
  return includes(DEADLINE_MISSING_REASONS, value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field.toUpperCase()}_REQUIRED`);
  }
  return value.trim();
}

function requiredHttpUrl(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^https?:\/\//.test(text)) throw new Error(`${field.toUpperCase()}_INVALID`);
  return text;
}

function academicYearOrThrow(value: string, field = "academicYear"): string {
  try {
    return normalizeAcademicYear(value);
  } catch {
    throw new Error(`${field.toUpperCase()}_INVALID`);
  }
}

function academicYearStart(year: string): number {
  return Number(year.slice(0, 4));
}

function deadlineTypeOrThrow(value: unknown): DeadlineType {
  if (!isDeadlineType(value)) throw new Error("TYPE_INVALID");
  return value;
}

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
  } catch {
    throw new Error("TIME_ZONE_INVALID");
  }
}

function timeZoneOffsetMinutes(timeZone: string, wallTime: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(wallTime);
  const zone = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = zone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function parseLocalParts(localDate: string, localTime: string | null): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
} {
  const dateMatch = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) throw new Error("LOCAL_DATE_INVALID");

  let hour = 23;
  let minute = 59;
  let second = 59;
  let millisecond = 999;
  if (localTime != null) {
    const timeMatch = localTime.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (!timeMatch) throw new Error("LOCAL_TIME_INVALID");
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    second = Number(timeMatch[3] ?? "0");
    millisecond = Number(timeMatch[4]?.padEnd(3, "0") ?? "0");
  }

  return {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour,
    minute,
    second,
    millisecond,
  };
}

function localPartsToUtc(
  parts: ReturnType<typeof parseLocalParts>,
  timeZone: string,
): Date {
  const wallTime = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );
  const valid = wallTime.getUTCFullYear() === parts.year &&
    wallTime.getUTCMonth() === parts.month - 1 &&
    wallTime.getUTCDate() === parts.day &&
    wallTime.getUTCHours() === parts.hour &&
    wallTime.getUTCMinutes() === parts.minute;
  if (!valid || Number.isNaN(wallTime.getTime())) throw new Error("LOCAL_DATE_INVALID");

  const offset = timeZoneOffsetMinutes(timeZone, wallTime);
  return new Date(wallTime.getTime() - offset * 60_000);
}

function defaultRoundLabel(type: AdmissionRoundType, roundNumber: number): string {
  const names: Record<AdmissionRoundType, string> = {
    early_decision: "Early Decision",
    early_action: "Early Action",
    priority: "Priority",
    regular_decision: "Regular Decision",
    rolling: "Rolling",
    transfer: "Transfer",
  };
  if (type === "rolling") return "Rolling Admission";
  return `${names[type]} ${roundNumber}`;
}

export function createAdmissionRound(input: AdmissionRoundInput): AdmissionRound {
  if (!isAdmissionRoundType(input.type)) throw new Error("ROUND_TYPE_INVALID");
  const roundNumber = input.roundNumber ?? 1;
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 4) {
    throw new Error("ROUND_NUMBER_INVALID");
  }
  const academicYear = academicYearOrThrow(input.academicYear);
  return {
    type: input.type,
    roundNumber,
    academicYear,
    label: input.label?.trim() || defaultRoundLabel(input.type, roundNumber),
    isFinalRound: input.isFinalRound ?? false,
  };
}

export function createApplicationDeadline(input: ApplicationDeadlineInput): ApplicationDeadline {
  const timeZone = requiredText(input.timeZone, "timeZone");
  assertValidTimeZone(timeZone);
  const localDate = requiredText(input.localDate, "localDate");
  const localTime = input.localTime == null ? null : requiredText(input.localTime, "localTime");
  const parts = parseLocalParts(localDate, localTime);
  const dueAt = localPartsToUtc(parts, timeZone);
  const academicYear = academicYearOrThrow(input.academicYear);
  const round = input.round == null ? null : createAdmissionRound(input.round);
  if (round != null && round.academicYear !== academicYear) {
    throw new Error("ROUND_ACADEMIC_YEAR_MISMATCH");
  }

  return {
    entityType: input.entityType,
    entityId: requiredText(input.entityId, "entityId"),
    title: requiredText(input.title, "title"),
    type: deadlineTypeOrThrow(input.type),
    academicYear,
    round,
    timeZone,
    localDate,
    localTime,
    precision: localTime == null ? "date" : "datetime",
    dueAtUtc: dueAt.toISOString(),
    sourceUrl: requiredHttpUrl(input.sourceUrl, "sourceUrl"),
    retrievedAt: requiredText(input.retrievedAt, "retrievedAt"),
    historical: null,
  };
}

export function markDeadlineAsHistorical(
  deadline: ApplicationDeadline,
  reason: string,
): ApplicationDeadline {
  const trimmedReason = requiredText(reason, "historicalReason");
  return {
    ...deadline,
    historical: {
      sourceAcademicYear: deadline.academicYear,
      reason: trimmedReason,
    },
  };
}

export function projectHistoricalDeadline(
  deadline: ApplicationDeadline,
  targetAcademicYear: string,
  reason = "projected from a historical admission cycle",
): ApplicationDeadline {
  const projectedYear = academicYearOrThrow(targetAcademicYear, "projectedAcademicYear");
  if (deadline.historical == null) {
    throw new Error("HISTORICAL_ANNOTATION_REQUIRED");
  }

  const sourceStart = academicYearStart(deadline.historical.sourceAcademicYear);
  const targetStart = academicYearStart(projectedYear);
  const yearDelta = targetStart - sourceStart;
  if (yearDelta <= 0) throw new Error("PROJECTION_TARGET_MUST_BE_LATER");

  const sourceDate = new Date(`${deadline.localDate}T00:00:00Z`);
  const projectedDate = new Date(
    Date.UTC(
      sourceDate.getUTCFullYear() + yearDelta,
      sourceDate.getUTCMonth(),
      sourceDate.getUTCDate(),
    ),
  );
  if (
    projectedDate.getUTCMonth() !== sourceDate.getUTCMonth() ||
    projectedDate.getUTCDate() !== sourceDate.getUTCDate()
  ) {
    throw new Error("HISTORICAL_DATE_NOT_PROJECTABLE");
  }

  const projected = createApplicationDeadline({
    entityType: deadline.entityType,
    entityId: deadline.entityId,
    title: deadline.title,
    type: deadline.type,
    academicYear: projectedYear,
    round: deadline.round == null
      ? null
      : {
          type: deadline.round.type,
          roundNumber: deadline.round.roundNumber,
          academicYear: projectedYear,
          label: deadline.round.label,
          isFinalRound: deadline.round.isFinalRound,
        },
    timeZone: deadline.timeZone,
    localDate: projectedDate.toISOString().slice(0, 10),
    localTime: deadline.localTime ?? undefined,
    sourceUrl: deadline.sourceUrl,
    retrievedAt: deadline.retrievedAt,
  });

  return {
    ...projected,
    historical: {
      sourceAcademicYear: deadline.historical.sourceAcademicYear,
      projectedAcademicYear: projectedYear,
      reason: requiredText(reason, "historicalReason"),
    },
  };
}

export function createMissingDeadline(input: MissingDeadlineInput): MissingDeadline {
  if (!isDeadlineMissingReason(input.missingReason)) {
    throw new Error("MISSING_REASON_INVALID");
  }
  if (input.sourceUrl != null && input.retrievedAt == null) {
    throw new Error("RETRIEVED_AT_REQUIRED_WITH_SOURCE");
  }
  return {
    entityType: input.entityType,
    entityId: requiredText(input.entityId, "entityId"),
    title: requiredText(input.title, "title"),
    type: deadlineTypeOrThrow(input.type),
    academicYear: academicYearOrThrow(input.academicYear),
    round: input.round == null ? null : createAdmissionRound(input.round),
    missingReason: input.missingReason,
    sourceUrl: input.sourceUrl == null ? null : requiredHttpUrl(input.sourceUrl, "sourceUrl"),
    retrievedAt: input.retrievedAt == null ? null : requiredText(input.retrievedAt, "retrievedAt"),
  };
}

export function deadlineTime(deadline: ApplicationDeadline): number {
  const time = new Date(deadline.dueAtUtc).getTime();
  if (Number.isNaN(time)) throw new Error("DUE_AT_INVALID");
  return time;
}

export function isDeadlineExpired(
  deadline: ApplicationDeadline,
  now: Date = new Date(),
): boolean {
  return deadlineTime(deadline) <= now.getTime();
}

export function classifyDeadlineUrgency(
  deadline: ApplicationDeadline,
  now: Date = new Date(),
): DeadlineUrgencyResult {
  const millisecondsRemaining = deadlineTime(deadline) - now.getTime();
  const daysRemaining = Math.ceil(millisecondsRemaining / DAY_MS);
  if (millisecondsRemaining <= 0) {
    return { urgency: "expired", millisecondsRemaining, daysRemaining };
  }
  const urgency: DeadlineUrgency = millisecondsRemaining <= 7 * DAY_MS
    ? "critical"
    : millisecondsRemaining <= 14 * DAY_MS
      ? "high"
      : millisecondsRemaining <= 30 * DAY_MS
        ? "medium"
        : millisecondsRemaining <= 90 * DAY_MS
          ? "low"
          : "later";
  return { urgency, millisecondsRemaining, daysRemaining };
}

export function partitionDeadlinesByExpiry(
  deadlines: readonly ApplicationDeadline[],
  now: Date = new Date(),
): { upcoming: ApplicationDeadline[]; expired: ApplicationDeadline[] } {
  const upcoming: ApplicationDeadline[] = [];
  const expired: ApplicationDeadline[] = [];
  for (const deadline of deadlines) {
    if (isDeadlineExpired(deadline, now)) expired.push(deadline);
    else upcoming.push(deadline);
  }
  upcoming.sort((left, right) => deadlineTime(left) - deadlineTime(right));
  expired.sort((left, right) => deadlineTime(right) - deadlineTime(left));
  return { upcoming, expired };
}

export function sortPersonalDeadlineItems(
  items: readonly PersonalDeadlineItem[],
  now: Date = new Date(),
): PersonalDeadlineItem[] {
  const pinned: PersonalDeadlineItem[] = [];
  const upcoming: PersonalDeadlineItem[] = [];
  const expired: PersonalDeadlineItem[] = [];
  const missing: PersonalDeadlineItem[] = [];

  for (const item of items) {
    if (item.pinned) {
      pinned.push(item);
    } else if (item.state === "missing") {
      missing.push(item);
    } else if (isDeadlineExpired(item.deadline, now)) {
      expired.push(item);
    } else {
      upcoming.push(item);
    }
  }

  const byAddedAt = (left: PersonalDeadlineItem, right: PersonalDeadlineItem) =>
    left.addedAt.localeCompare(right.addedAt);
  const byDeadline = (left: PersonalDeadlineItem, right: PersonalDeadlineItem) => {
    if (left.state !== "scheduled" || right.state !== "scheduled") return 0;
    return deadlineTime(left.deadline) - deadlineTime(right.deadline);
  };
  pinned.sort(byAddedAt);
  upcoming.sort(byDeadline);
  expired.sort((left, right) => -byDeadline(left, right));
  missing.sort(byAddedAt);
  return [...pinned, ...upcoming, ...expired, ...missing];
}
