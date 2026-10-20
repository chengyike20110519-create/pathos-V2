import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseNotConfiguredError } from "@/server/db";
import type { Fact, FactEntityType, FactValueType } from "@/domain/information/fact";

const listApprovedFactsMock = vi.hoisted(() => vi.fn());
const shortlistMock = vi.hoisted(() => ({
  getShortlist: vi.fn(),
  listShortlistItems: vi.fn(),
}));
const sessionMock = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/server/information/fact-repository", () => ({
  listApprovedFacts: listApprovedFactsMock,
}));
vi.mock("@/lib/shortlists", () => shortlistMock);
vi.mock("@/lib/session", () => ({ getCurrentUser: sessionMock.getCurrentUser }));

import { GET } from "@/app/api/information/deadlines/route";
import {
  aggregateApplicationDeadlines,
  aggregateShortlistDeadlines,
  createApplicationDeadlineCalendar,
  isDeadlineFactField,
} from "@/server/information/aggregate-deadline";

function fact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: "fact_1",
    factKey: "fact-key-1",
    entityType: "university",
    entityId: "example-university",
    fieldKey: "deadline.regular_decision",
    valueType: "date",
    valueNumber: null,
    valueText: "2026-11-01",
    valueBoolean: null,
    valueRange: null,
    valueList: null,
    unit: null,
    currency: null,
    academicYear: "2026-2027",
    effectiveFrom: null,
    effectiveTo: null,
    applicantScope: "all",
    sourceId: "source_1",
    sourceDocumentId: null,
    sourceUrl: "https://example.edu/admissions",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    reviewedAt: "2026-10-02T00:00:00.000Z",
    reviewStatus: "approved",
    confidence: "high",
    nullReason: null,
    notes: null,
    currentRevision: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    ...overrides,
  };
}

function request(url = "/api/information/deadlines"): Request {
  return new Request(`https://pathos.local${url}`);
}

beforeEach(() => {
  listApprovedFactsMock.mockReset();
  listApprovedFactsMock.mockResolvedValue([]);
  shortlistMock.getShortlist.mockReset();
  shortlistMock.listShortlistItems.mockReset();
  sessionMock.getCurrentUser.mockReset();
});

describe("deadline fact selection", () => {
  it("accepts the established deadline field names and rejects other date fields", () => {
    expect(isDeadlineFactField("deadline.regular_decision")).toBe(true);
    expect(isDeadlineFactField("program.application_deadline")).toBe(true);
    expect(isDeadlineFactField("program.spring_deadline")).toBe(true);
    expect(isDeadlineFactField("profile.founded_date")).toBe(false);
    expect(isDeadlineFactField("cost.tuition")).toBe(false);
  });
});

describe("application deadline aggregation", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");

  it("returns an explicit empty state when there are no deadline facts", () => {
    const calendar = createApplicationDeadlineCalendar([fact({ fieldKey: "profile.city" })], now);
    expect(calendar.coverage).toEqual({
      deadlineFacts: 0,
      scheduled: 0,
      missing: 0,
      invalid: 0,
    });
    expect(calendar.groups).toEqual({ urgent: [], upcoming: [], expired: [] });
  });

  it("normalizes explicit source offsets to UTC instead of inventing an IANA zone", () => {
    const calendar = createApplicationDeadlineCalendar([
      fact({ valueText: "2026-11-01T23:59:59-05:00" }),
    ], now);
    const item = calendar.groups.upcoming[0];
    expect(item.deadline.timeZone).toBe("UTC");
    expect(item.deadline.dueAtUtc).toBe("2026-11-02T04:59:59.000Z");
    expect(item.timezoneBasis).toBe("utc");
    expect(item.deadline.round?.label).toBe("Regular Decision 1");
  });

  it("treats date-only facts as UTC end-of-day and explains the basis", () => {
    const calendar = createApplicationDeadlineCalendar([
      fact({ valueText: "2026-11-01" }),
    ], now);
    expect(calendar.groups.upcoming[0].deadline.dueAtUtc).toBe("2026-11-01T23:59:59.999Z");
    expect(calendar.timezoneNotice).toContain("UTC");
  });

  it("splits urgent, upcoming, and expired groups without hiding malformed facts", () => {
    const calendar = createApplicationDeadlineCalendar([
      fact({ id: "urgent", valueText: "2026-10-20T12:00:00Z" }),
      fact({ id: "later", valueText: "2026-12-20T12:00:00Z" }),
      fact({ id: "expired", valueText: "2026-10-01T12:00:00Z" }),
      fact({ id: "invalid", valueType: "text" as FactValueType, valueText: "Contact office" }),
    ], now);
    expect(calendar.groups.urgent.map((item) => item.factId)).toEqual(["urgent"]);
    expect(calendar.groups.upcoming.map((item) => item.factId)).toEqual(["later"]);
    expect(calendar.groups.expired.map((item) => item.factId)).toEqual(["expired"]);
    expect(calendar.coverage.invalid).toBe(1);
  });

  it("marks an earlier academic cycle as historical and never projects it forward", () => {
    const calendar = createApplicationDeadlineCalendar([
      fact({
        academicYear: "2024-2025",
        valueText: "2025-01-15",
      }),
    ], now);
    const item = calendar.groups.expired[0];
    expect(item.deadline.localDate).toBe("2025-01-15");
    expect(item.deadline.academicYear).toBe("2024-2025");
    expect(item.deadline.historical?.sourceAcademicYear).toBe("2024-2025");
    expect(item.deadline.historical?.projectedAcademicYear).toBeUndefined();
  });

  it("keeps null deadline facts explicitly missing rather than assigning a fake time", () => {
    const calendar = createApplicationDeadlineCalendar([
      fact({
        valueType: "date",
        valueText: null,
        valueNumber: null,
        valueBoolean: null,
        nullReason: "source_review_not_completed",
      }),
    ], now);
    expect(calendar.coverage).toMatchObject({ scheduled: 0, missing: 1 });
    expect(calendar.missing[0].missingDeadline.missingReason).toBe("requires_manual_review");
    expect("dueAtUtc" in calendar.missing[0].missingDeadline).toBe(false);
  });

  it("queries only approved facts for calendar-capable entity types", async () => {
    await aggregateApplicationDeadlines({
      entityId: "example-university",
      academicYear: "2026-27",
    });
    expect(listApprovedFactsMock).toHaveBeenCalledTimes(3);
    expect(listApprovedFactsMock).toHaveBeenCalledWith({
      entityType: "university",
      entityId: "example-university",
      academicYear: "2026-2027",
    });
    expect(listApprovedFactsMock).toHaveBeenCalledWith({
      entityType: "program",
      entityId: "example-university",
      academicYear: "2026-2027",
    });
    expect(listApprovedFactsMock).toHaveBeenCalledWith({
      entityType: "scholarship",
      entityId: "example-university",
      academicYear: "2026-2027",
    });
  });

  it("builds an owner-scoped personal shortlist calendar and keeps missing schools explicit", async () => {
    shortlistMock.getShortlist.mockResolvedValue({
      id: "shortlist_1",
      ownerUserId: "user_1",
      name: "My list",
      season: null,
      notes: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    shortlistMock.listShortlistItems.mockResolvedValue([
      {
        id: "item_1",
        shortlistId: "shortlist_1",
        universityId: "example-university",
        bucket: "reach",
        notes: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        universityName: "Example University",
        universityChineseName: null,
      },
      {
        id: "item_2",
        shortlistId: "shortlist_1",
        universityId: "uncovered-university",
        bucket: "match",
        notes: null,
        createdAt: "2026-09-03T00:00:00.000Z",
        universityName: "Uncovered University",
        universityChineseName: null,
      },
    ]);
    listApprovedFactsMock.mockImplementation(async (query: { entityId?: string }) =>
      query.entityId === "example-university" ? [fact()] : [],
    );

    const result = await aggregateShortlistDeadlines({
      shortlistId: "shortlist_1",
      userId: "user_1",
    });
    expect(result?.shortlistName).toBe("My list");
    expect(result?.personalItems).toHaveLength(1);
    expect(result?.personalItems[0]).toMatchObject({ state: "scheduled", pinned: false });
    expect(result?.universitiesWithoutDeadlineFacts).toEqual(["uncovered-university"]);
  });

  it("does not expose another owner's shortlist", async () => {
    shortlistMock.getShortlist.mockResolvedValue({
      id: "shortlist_1",
      ownerUserId: "user_2",
      name: "Other user list",
    });
    await expect(aggregateShortlistDeadlines({
      shortlistId: "shortlist_1",
      userId: "user_1",
    })).resolves.toBeNull();
    expect(shortlistMock.listShortlistItems).not.toHaveBeenCalled();
  });
});

describe("deadlines API", () => {
  it("returns no-store and normalized calendar data", async () => {
    listApprovedFactsMock.mockImplementation(async (query: { entityType: FactEntityType }) =>
      query.entityType === "university" ? [fact()] : [],
    );
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.ok).toBe(true);
    expect(body.timezoneBasis).toBe("utc");
    expect(body.coverage.scheduled).toBe(1);
  });

  it("validates filters before touching the database", async () => {
    const response = await GET(request("?entityType=major"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listApprovedFactsMock).not.toHaveBeenCalled();

    const conflicting = await GET(request("?shortlistId=shortlist_1&entityId=example"));
    expect(conflicting.status).toBe(400);
    expect(await conflicting.json()).toMatchObject({ code: "SHORTLIST_FILTER_CONFLICT" });
  });

  it("fails closed with 503 when the approved fact database is unavailable", async () => {
    listApprovedFactsMock.mockRejectedValue(new DatabaseNotConfiguredError());
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.code).toBe("DATABASE_NOT_CONFIGURED");
  });

  it("fails closed when the information migration has not run", async () => {
    listApprovedFactsMock.mockRejectedValue(
      new Error('relation "facts" does not exist'),
    );
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.code).toBe("INFORMATION_SCHEMA_NOT_READY");
  });

  it("requires login for a personal shortlist calendar", async () => {
    sessionMock.getCurrentUser.mockResolvedValue(null);
    const response = await GET(request("?shortlistId=shortlist_1"));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.code).toBe("UNAUTHENTICATED");
  });
});
