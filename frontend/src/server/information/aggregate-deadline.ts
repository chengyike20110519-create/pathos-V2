import {
  classifyDeadlineUrgency,
  createApplicationDeadline,
  createMissingDeadline,
  markDeadlineAsHistorical,
  deadlineTime,
  sortPersonalDeadlineItems,
  type AdmissionRoundInput,
  type ApplicationDeadline,
  type ApplicationDeadlineInput,
  type DeadlineMissingReason,
  type DeadlineType,
  type DeadlineUrgency,
  type MissingDeadline,
  type PersonalDeadlineItem,
} from "@/domain/information/deadline";
import {
  normalizeAcademicYear,
  normalizeDateToUtc,
} from "@/domain/information/normalize";
import type { Fact, FactEntityType } from "@/domain/information/fact";
import { listApprovedFacts } from "@/server/information/fact-repository";
import {
  getShortlist,
  listShortlistItems,
  type ShortlistItemWithUniversity,
} from "@/lib/shortlists";

export type CalendarEntityType = Extract<FactEntityType, "university" | "program" | "scholarship">;

const CALENDAR_ENTITY_TYPES: readonly CalendarEntityType[] = [
  "university",
  "program",
  "scholarship",
];

// The current facts contract stores a date in value_text. It can carry an
// absolute UTC/offset timestamp, but it cannot carry the source IANA zone.
// WP10 therefore normalizes every accepted fact to UTC and exposes that basis;
// it never guesses a campus timezone.
export const DEADLINE_TIME_ZONE_BASIS = "utc" as const;
export const DEADLINE_TIME_ZONE_NOTICE =
  "当前事实层未携带来源 IANA 时区；已审核日期统一按 UTC 换算，日期型事实按 UTC 当日 23:59:59 解释。";

export interface ApplicationDeadlineCalendarItem {
  deadline: ApplicationDeadline;
  urgency: DeadlineUrgency;
  daysRemaining: number;
  timezoneBasis: typeof DEADLINE_TIME_ZONE_BASIS;
  factId: string;
  fieldKey: string;
  confidence: Fact["confidence"];
}

export interface MissingDeadlineCalendarItem {
  missingDeadline: MissingDeadline;
  factId: string;
  fieldKey: string;
  confidence: Fact["confidence"];
}

export interface ApplicationDeadlineCalendar {
  generatedAt: string;
  academicYear: string | null;
  timezoneBasis: typeof DEADLINE_TIME_ZONE_BASIS;
  timezoneNotice: string;
  groups: {
    urgent: ApplicationDeadlineCalendarItem[];
    upcoming: ApplicationDeadlineCalendarItem[];
    expired: ApplicationDeadlineCalendarItem[];
  };
  missing: MissingDeadlineCalendarItem[];
  coverage: {
    deadlineFacts: number;
    scheduled: number;
    missing: number;
    invalid: number;
  };
}

export interface PersonalApplicationDeadlineCalendar extends ApplicationDeadlineCalendar {
  shortlistId: string;
  shortlistName: string;
  personalItems: PersonalDeadlineItem[];
  universitiesWithoutDeadlineFacts: string[];
}

export interface AggregateApplicationDeadlinesQuery {
  entityType?: CalendarEntityType;
  entityId?: string;
  academicYear?: string;
}

const DEADLINE_FIELD_PATTERN =
  /(?:^|\.)deadline(?:\.|$)|(?:^|\.)(?:application|fall|spring|scholarship|document|test_score|deposit|orientation)_deadline$/i;

const FIELD_LABELS: Record<string, string> = {
  application_deadline: "申请截止",
  fall_deadline: "秋季入学截止",
  spring_deadline: "春季入学截止",
  scholarship_deadline: "奖学金截止",
  document_deadline: "材料截止",
  test_score_deadline: "考试成绩截止",
  deposit_deadline: "押金截止",
  orientation_deadline: "Orientation 截止",
};

const MISSING_REASON_MAP: Record<NonNullable<Fact["nullReason"]>, DeadlineMissingReason> = {
  not_reported: "not_reported",
  not_applicable: "not_applicable",
  source_blocked: "source_unavailable",
  source_unavailable: "source_unavailable",
  source_review_not_completed: "requires_manual_review",
  requires_manual_review: "requires_manual_review",
};

export function isDeadlineFactField(fieldKey: string): boolean {
  return DEADLINE_FIELD_PATTERN.test(fieldKey.trim());
}

function calendarEntityType(value: FactEntityType): CalendarEntityType | null {
  return CALENDAR_ENTITY_TYPES.includes(value as CalendarEntityType)
    ? (value as CalendarEntityType)
    : null;
}

function deadlineTypeFor(fieldKey: string): DeadlineType {
  const normalized = fieldKey.toLowerCase();
  if (normalized.includes("scholarship")) return "scholarship";
  if (normalized.includes("document")) return "document";
  if (normalized.includes("test_score")) return "test_score";
  if (normalized.includes("deposit")) return "deposit";
  if (normalized.includes("orientation")) return "orientation";
  return "application";
}

function roundFor(fieldKey: string, academicYear: string): AdmissionRoundInput | null {
  const normalized = fieldKey.toLowerCase();
  const type = normalized.includes("early_decision")
    ? "early_decision"
    : normalized.includes("early_action")
      ? "early_action"
      : normalized.includes("priority")
        ? "priority"
        : normalized.includes("rolling")
          ? "rolling"
          : normalized.includes("transfer")
            ? "transfer"
            : normalized.includes("regular")
              ? "regular_decision"
              : null;
  if (type == null) return null;
  const numberMatch = normalized.match(/(?:^|[._])([1-4])(?:[._]|$)/);
  return {
    type,
    roundNumber: numberMatch ? Number(numberMatch[1]) : 1,
    academicYear,
  };
}

function labelFor(fieldKey: string): string {
  const normalized = fieldKey.trim().toLowerCase();
  const direct = FIELD_LABELS[normalized] ?? FIELD_LABELS[normalized.split(".").pop() ?? ""];
  if (direct) return direct;
  const tail = normalized.split(".").pop() ?? normalized;
  const readable = tail.replace(/_/g, " ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function dateInputFromFact(fact: Fact): {
  localDate: string;
  localTime?: string;
} {
  const raw = fact.valueText?.trim();
  if (!raw) throw new Error("DEADLINE_VALUE_REQUIRED");
  const absolute = normalizeDateToUtc(raw, "UTC");
  const date = new Date(absolute);
  if (Number.isNaN(date.getTime())) throw new Error("DEADLINE_DATE_INVALID");

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // A date-only fact has no source time. Keep the day and apply the stated
    // UTC end-of-day convention rather than inventing a campus-local midnight.
    const endOfDay = new Date(date.getTime() + 86_399_999);
    return { localDate: endOfDay.toISOString().slice(0, 10) };
  }

  const localTime = `${date.toISOString().slice(11, 19)}`;
  return {
    localDate: date.toISOString().slice(0, 10),
    localTime,
  };
}

function currentAcademicCycleStart(now: Date): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function factTimestamp(value: Fact["retrievedAt"]): string {
  return value instanceof Date ? value.toISOString() : value;
}

function academicCycleStart(academicYear: string): number {
  return Number(normalizeAcademicYear(academicYear).slice(0, 4));
}

function toCalendarItem(
  fact: Fact,
  entityType: CalendarEntityType,
  now: Date,
): ApplicationDeadlineCalendarItem {
  const academicYear = normalizeAcademicYear(fact.academicYear ?? "");
  const input = dateInputFromFact(fact);
  const base = createApplicationDeadline({
    entityType,
    entityId: fact.entityId,
    title: `${fact.entityId} · ${labelFor(fact.fieldKey)}`,
    type: deadlineTypeFor(fact.fieldKey),
    academicYear,
    round: roundFor(fact.fieldKey, academicYear),
    timeZone: "UTC",
    localDate: input.localDate,
    localTime: input.localTime,
    sourceUrl: fact.sourceUrl,
    retrievedAt: factTimestamp(fact.retrievedAt),
  });
  const deadline =
    academicCycleStart(academicYear) < currentAcademicCycleStart(now)
      ? markDeadlineAsHistorical(
          base,
          "approved source belongs to an earlier academic cycle; no projection applied",
        )
      : base;
  const urgency = classifyDeadlineUrgency(deadline, now);
  return {
    deadline,
    urgency: urgency.urgency,
    daysRemaining: urgency.daysRemaining,
    timezoneBasis: DEADLINE_TIME_ZONE_BASIS,
    factId: fact.id,
    fieldKey: fact.fieldKey,
    confidence: fact.confidence,
  };
}

function toMissingItem(
  fact: Fact,
  entityType: CalendarEntityType,
): MissingDeadlineCalendarItem {
  if (fact.nullReason == null) throw new Error("MISSING_REASON_REQUIRED");
  const missingReason = MISSING_REASON_MAP[fact.nullReason];
  const missingDeadline = createMissingDeadline({
    entityType,
    entityId: fact.entityId,
    title: `${fact.entityId} · ${labelFor(fact.fieldKey)}`,
    type: deadlineTypeFor(fact.fieldKey),
    academicYear: normalizeAcademicYear(fact.academicYear ?? ""),
    round: null,
    missingReason,
    sourceUrl: fact.sourceUrl,
    retrievedAt: factTimestamp(fact.retrievedAt),
  });
  return {
    missingDeadline,
    factId: fact.id,
    fieldKey: fact.fieldKey,
    confidence: fact.confidence,
  };
}

export function createApplicationDeadlineCalendar(
  facts: readonly Fact[],
  now: Date = new Date(),
  academicYear: string | null = null,
): ApplicationDeadlineCalendar {
  const scheduled: ApplicationDeadlineCalendarItem[] = [];
  const missing: MissingDeadlineCalendarItem[] = [];
  let invalid = 0;
  let deadlineFacts = 0;

  for (const fact of facts) {
    if (!isDeadlineFactField(fact.fieldKey)) continue;
    deadlineFacts += 1;
    const entityType = calendarEntityType(fact.entityType);
    if (entityType == null || !fact.academicYear) {
      invalid += 1;
      continue;
    }

    try {
      if (fact.nullReason != null) {
        missing.push(toMissingItem(fact, entityType));
      } else if (fact.valueType === "date") {
        scheduled.push(toCalendarItem(fact, entityType, now));
      } else {
        invalid += 1;
      }
    } catch {
      // A malformed date must never be published as a calendar time. It stays
      // measurable in coverage and is queued for correction by WP04 review.
      invalid += 1;
    }
  }

  const ordered = scheduled
    .slice()
    .sort((left, right) => deadlineTime(left.deadline) - deadlineTime(right.deadline));
  const expired = ordered.filter((item) => item.urgency === "expired").reverse();
  const allUpcoming = ordered.filter((item) => item.urgency !== "expired");

  return {
    generatedAt: now.toISOString(),
    academicYear: academicYear == null ? null : normalizeAcademicYear(academicYear),
    timezoneBasis: DEADLINE_TIME_ZONE_BASIS,
    timezoneNotice: DEADLINE_TIME_ZONE_NOTICE,
    groups: {
      urgent: allUpcoming.filter((item) => item.urgency === "critical" || item.urgency === "high"),
      upcoming: allUpcoming.filter((item) => item.urgency !== "critical" && item.urgency !== "high"),
      expired,
    },
    missing,
    coverage: {
      deadlineFacts,
      scheduled: scheduled.length,
      missing: missing.length,
      invalid,
    },
  };
}

export async function aggregateApplicationDeadlines(
  query: AggregateApplicationDeadlinesQuery = {},
): Promise<ApplicationDeadlineCalendar> {
  const trimmedEntityId = query.entityId?.trim();
  const academicYear = query.academicYear?.trim()
    ? normalizeAcademicYear(query.academicYear)
    : undefined;
  const entityTypes = query.entityType ? [query.entityType] : CALENDAR_ENTITY_TYPES;
  const factGroups = await Promise.all(
    entityTypes.map((entityType) =>
      listApprovedFacts({
        entityType,
        entityId: trimmedEntityId || undefined,
        academicYear,
      }),
    ),
  );
  return createApplicationDeadlineCalendar(
    factGroups.flat(),
    new Date(),
    academicYear ?? null,
  );
}

export async function aggregateShortlistDeadlines(args: {
  shortlistId: string;
  userId: string;
  academicYear?: string;
}): Promise<PersonalApplicationDeadlineCalendar | null> {
  const shortlist = await getShortlist(args.shortlistId);
  if (shortlist == null || shortlist.ownerUserId !== args.userId) return null;

  const shortlistItems = await listShortlistItems(args.shortlistId);
  const academicYear = args.academicYear?.trim()
    ? normalizeAcademicYear(args.academicYear)
    : undefined;
  const factGroups = await Promise.all(
    shortlistItems.map((item) =>
      listApprovedFacts({
        entityType: "university",
        entityId: item.universityId,
        academicYear,
      }),
    ),
  );
  const facts = factGroups.flat();
  const calendar = createApplicationDeadlineCalendar(facts, new Date(), academicYear ?? null);
  const addedAtByEntity = new Map(
    shortlistItems.map((item) => [item.universityId, item.createdAt]),
  );
  const personalItems: PersonalDeadlineItem[] = [
    ...calendar.groups.urgent,
    ...calendar.groups.upcoming,
    ...calendar.groups.expired,
  ].map((item) => ({
    state: "scheduled" as const,
    deadline: item.deadline,
    addedAt: addedAtByEntity.get(item.deadline.entityId) ?? item.deadline.retrievedAt,
    pinned: false,
  }));

  for (const item of calendar.missing) {
    personalItems.push({
      state: "missing",
      missingDeadline: item.missingDeadline,
      addedAt: addedAtByEntity.get(item.missingDeadline.entityId) ?? item.missingDeadline.retrievedAt ?? "",
      pinned: false,
    });
  }

  const factEntityIds = new Set(
    facts.filter((fact) => isDeadlineFactField(fact.fieldKey)).map((fact) => fact.entityId),
  );
  return {
    ...calendar,
    shortlistId: shortlist.id,
    shortlistName: shortlist.name,
    personalItems: sortPersonalDeadlineItems(personalItems),
    universitiesWithoutDeadlineFacts: uniqueUniversities(shortlistItems)
      .filter((universityId) => !factEntityIds.has(universityId)),
  };
}

function uniqueUniversities(items: readonly ShortlistItemWithUniversity[]): string[] {
  return [...new Set(items.map((item) => item.universityId))];
}
