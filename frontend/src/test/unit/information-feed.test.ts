import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseNotConfiguredError } from "@/server/db";

type DbResult = { rows: unknown[]; rowCount: number };
const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _params: unknown[]): Promise<DbResult> =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  ),
);
function mockQuery(impl: (q: string, p: unknown[]) => Promise<DbResult>): void {
  queryMock.mockImplementation(impl);
}

vi.mock("@/server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db")>();
  return {
    ...actual,
    getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
  };
});

import { GET } from "@/app/api/information/events/route";
import {
  INFORMATION_EVENT_URGENCIES,
  InformationSchemaNotReadyError,
  deriveEventUrgency,
  filterInformationFeedRecords,
  getInformationFeed,
  type InformationFeedRecord,
} from "@/server/information/event-repository";

const NOW = new Date("2026-10-15T12:00:00.000Z");

function eventRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "event_1",
    event_type: "cost",
    title: "学费调整",
    summary: "2026-2027 学年学费上调。",
    what_changed: " tuition from 50000 to 52000 USD",
    why_it_matters: "影响年度预算约 2000 美元。",
    action_steps: ["重新核算预算"],
    entity_type: "university",
    entity_id: "example-university",
    field_key: "cost.tuition",
    previous_value: { amount: 50000, currency: "USD" },
    new_value: { amount: 52000, currency: "USD" },
    audience: ["international"],
    importance: "high",
    action_deadline: new Date("2026-10-20T12:00:00.000Z"),
    published_at: new Date("2026-10-14T08:00:00.000Z"),
    created_at: new Date("2026-10-14T07:00:00.000Z"),
    source_id: "source_1",
    source_name: "Example Official",
    source_url: "https://example.edu/cost",
    source_authority: "A",
    fact_id: "fact_1",
    fact_field_key: "cost.tuition",
    review_status: "approved",
    confidence: "high",
    retrieved_at: new Date("2026-10-13T08:00:00.000Z"),
    university_id: "example-university",
    university_name: "Example University",
    university_name_zh: "示例大学",
    ...extra,
  };
}

function newsRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "news_1",
    university_id: "example-university",
    university_name: "Example University",
    university_name_zh: "示例大学",
    title: "Preview news",
    title_en: "Preview news",
    summary: "Legacy preview item",
    what_changed: "Legacy diff was not modeled",
    why_it_matters: "Needs review",
    action_steps: [],
    event_type: "campus_update",
    audience: ["international"],
    source: "Preview Source",
    url: "https://example.edu/news",
    published_at: new Date("2026-10-10T08:00:00.000Z"),
    action_deadline: null,
    importance: "medium",
    source_status: "source_review_not_completed",
    ...extra,
  };
}

function request(url = "/api/information/events"): Request {
  return new Request(`https://pathos.local${url}`);
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("information event taxonomy", () => {
  it("derives deadline urgency without treating a missing deadline as urgent", () => {
    expect(deriveEventUrgency(null, NOW)).toBe("none");
    expect(deriveEventUrgency("2026-10-15T18:00:00Z", NOW)).toBe("critical");
    expect(deriveEventUrgency("2026-11-01T12:00:00Z", NOW)).toBe("high");
    expect(deriveEventUrgency("2026-10-01T12:00:00Z", NOW)).toBe("expired");
    expect(INFORMATION_EVENT_URGENCIES).toContain("none");
  });

  it("filters by entity, category, and urgency while preserving both record kinds", () => {
    const records = [{
      recordKind: "approved_event",
      entityType: "university",
      entityId: "school",
      eventType: "cost",
      urgency: "critical",
    }, {
      recordKind: "preview_news",
      entityType: "university",
      entityId: "school",
      eventType: "cost",
      urgency: "critical",
    }] as unknown as InformationFeedRecord[];
    expect(filterInformationFeedRecords(records, {
      entityType: "university",
      entityId: "school",
      eventType: "cost",
      urgency: "critical",
    })).toHaveLength(2);
    expect(filterInformationFeedRecords(records, { eventType: "deadline" })).toHaveLength(0);
  });
});

describe("information event repository", () => {
  it("queries only published events backed by current approved facts", async () => {
    mockQuery(async () => ({ rows: [eventRow()], rowCount: 1 }));
    const feed = await getInformationFeed({}, NOW);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("e.is_published = TRUE");
    expect(sql).toContain("f.review_status = 'approved'");
    expect(sql).toContain("f.effective_to IS NULL OR f.effective_to >= NOW()");
    expect(feed.coverage.approvedEvents).toBe(1);
    expect(feed.previewFallback).toBe(false);
    expect(feed.events[0].fact.reviewStatus).toBe("approved");
    expect(feed.events[0].previousValue).toEqual({ amount: 50000, currency: "USD" });
    expect(feed.events[0].newValue).toEqual({ amount: 52000, currency: "USD" });
    expect(feed.events[0].source.name).toBe("Example Official");
  });

  it("passes safe filters into the event query", async () => {
    mockQuery(async () => ({ rows: [], rowCount: 0 }));
    await getInformationFeed({
      entityType: "university",
      entityId: "example-university",
      eventType: "cost",
      urgency: "critical",
    }, NOW);

    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("e.entity_type = $1");
    expect(sql).toContain("e.entity_id = $2");
    expect(sql).toContain("e.event_type = $3");
    expect(params).toEqual(["university", "example-university", "cost"]);
  });

  it("downgrades legacy preview news explicitly when no event has been seeded", async () => {
    mockQuery(async (sql) => ({
      rows: sql.includes("FROM information_events") ? [] : [newsRow()],
      rowCount: sql.includes("FROM information_events") ? 0 : 1,
    }));
    const feed = await getInformationFeed({}, NOW);

    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(feed.previewFallback).toBe(true);
    expect(feed.previewNews).toHaveLength(1);
    expect(feed.previewNews[0].isApproved).toBe(false);
    expect(feed.previewNews[0].sourceStatus).toBe("source_review_not_completed");
    expect(feed.previewNews[0].fieldKey).toBeNull();
    expect(feed.previewNews[0].previousValue).toBeNull();
    expect(feed.previewNews[0].newValue).toBeNull();
  });

  it("does not expose preview news when an approved event exists", async () => {
    mockQuery(async (sql) => ({
      rows: sql.includes("FROM information_events") ? [eventRow()] : [newsRow()],
      rowCount: 1,
    }));
    const feed = await getInformationFeed({}, NOW);
    expect(feed.events).toHaveLength(1);
    expect(feed.previewNews).toHaveLength(0);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("does not downgrade to preview news just because a filtered result is empty", async () => {
    mockQuery(async (sql) => ({
      rows: sql.startsWith("SELECT 1") ? [{ exists: 1 }] : [],
      rowCount: sql.startsWith("SELECT 1") ? 1 : 0,
    }));
    const feed = await getInformationFeed({ eventType: "deadline" }, NOW);
    expect(feed.events).toHaveLength(0);
    expect(feed.previewNews).toHaveLength(0);
    expect(feed.previewFallback).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the information migration has not run", async () => {
    mockQuery(async () => {
      throw Object.assign(new Error('relation "information_events" does not exist'), { code: "42P01" });
    });
    await expect(getInformationFeed()).rejects.toBeInstanceOf(InformationSchemaNotReadyError);
  });
});

describe("information events API", () => {
  it("rejects invalid filters before touching the database", async () => {
    const response = await GET(request("/api/information/events?entityType=workspace"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "UNSUPPORTED_ENTITY_TYPE" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns no-store responses with separated approved and preview records", async () => {
    mockQuery(async (sql) => ({
      rows: sql.includes("FROM information_events") ? [eventRow()] : [newsRow()],
      rowCount: 1,
    }));
    // eventRow uses a fixed 2026-10-20 deadline; use expired here so the
    // contract remains stable when the test suite is run after that date.
    const response = await GET(request("/api/information/events?urgency=expired"));
    const payload = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.events).toHaveLength(1);
    expect(payload.previewNews).toHaveLength(0);
  });

  it("maps database-not-configured and missing information tables to 503", async () => {
    mockQuery(async () => {
      throw new DatabaseNotConfiguredError();
    });
    const configured = await GET(request());
    expect(configured.status).toBe(503);
    expect(await configured.json()).toMatchObject({ code: "DATABASE_NOT_CONFIGURED" });

    mockQuery(async () => {
      throw Object.assign(new Error('relation "information_events" does not exist'), { code: "42P01" });
    });
    const migrationMissing = await GET(request());
    expect(migrationMissing.status).toBe(503);
    expect(await migrationMissing.json()).toMatchObject({ code: "INFORMATION_SCHEMA_NOT_READY" });
  });
});
