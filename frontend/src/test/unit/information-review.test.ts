// Coverage for WP04 -- information review queue and decision audit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type DbResult = { rows: unknown[]; rowCount: number };
const authMock = vi.hoisted(() => ({ requireAdvisor: vi.fn() }));
const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _params: unknown[]): Promise<DbResult> =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  ),
);
function mockQuery(impl: (q: string, p: unknown[]) => Promise<DbResult>): void {
  queryMock.mockImplementation(impl);
}

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
}));
vi.mock("@/lib/admin-auth", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  requireAdvisor: authMock.requireAdvisor,
}));

import {
  factStatusForAction,
  isReviewAction,
  isReviewSeverity,
  isReviewTaskStatus,
  isReviewTaskType,
  REVIEW_ACTIONS,
  REVIEW_SEVERITIES,
  REVIEW_TASK_STATUSES,
  REVIEW_TASK_TYPES,
  reviewTaskStatusForAction,
} from "@/domain/information/review";
import {
  applyReviewAction,
  createReviewTask,
  listReviewTasks,
  ReviewTaskStateError,
} from "@/server/information/review-repository";
import { GET, POST } from "@/app/api/admin/information/review/route";

const NOW = new Date("2026-01-02T03:04:05.000Z");

function taskRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    task_id: "task_1",
    task_fact_id: "fact_1",
    task_type: "new_fact",
    severity: "high",
    status: "pending",
    from_revision_id: null,
    to_revision_id: "revision_2",
    reason: "CDS update",
    assigned_to_user_id: null,
    resolved_at: null,
    task_metadata: { sourceAuthority: "A" },
    task_created_at: NOW,
    task_updated_at: NOW,
    fact_id: "fact_1",
    entity_type: "university",
    entity_id: "mit",
    field_key: "admission_rate",
    academic_year: "2026-2027",
    current_revision: 2,
    source_id: "src_1",
    source_url: "https://example.edu",
    review_status: "pending",
    ...extra,
  };
}

function actionRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...taskRow({ status: "approved", reason: "matches official PDF", review_status: "approved" }),
    audit_id: "audit_1",
    audit_revision_id: "revision_2",
    actor_user_id: "user_1",
    action: "approve",
    task_status_before: "pending",
    task_status_after: "approved",
    fact_status_before: "pending",
    fact_status_after: "approved",
    audit_reason: "matches official PDF",
    audit_metadata: { action: "approve", factStatus: "approved" },
    audit_created_at: NOW,
    ...extra,
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  queryMock.mockReset();
  mockQuery(async () => ({ rows: [], rowCount: 0 }));
  authMock.requireAdvisor.mockReset();
  authMock.requireAdvisor.mockResolvedValue({ user: { id: "user_1" }, role: "advisor" });
});

afterEach(() => {
  queryMock.mockReset();
  authMock.requireAdvisor.mockReset();
});

describe("review taxonomy", () => {
  it("keeps queue and action enums closed", () => {
    for (const value of REVIEW_TASK_TYPES) expect(isReviewTaskType(value)).toBe(true);
    for (const value of REVIEW_TASK_STATUSES) expect(isReviewTaskStatus(value)).toBe(true);
    for (const value of REVIEW_SEVERITIES) expect(isReviewSeverity(value)).toBe(true);
    for (const value of REVIEW_ACTIONS) expect(isReviewAction(value)).toBe(true);

    expect(isReviewTaskType("new")).toBe(false);
    expect(isReviewTaskStatus("deleted")).toBe(false);
    expect(isReviewSeverity("urgent")).toBe(false);
    expect(isReviewAction("publish")).toBe(false);
  });

  it("maps every action to task and fact publication states", () => {
    expect(reviewTaskStatusForAction("approve")).toBe("approved");
    expect(reviewTaskStatusForAction("reject")).toBe("rejected");
    expect(reviewTaskStatusForAction("stale")).toBe("stale");
    expect(reviewTaskStatusForAction("recheck")).toBe("recheck");
    expect(factStatusForAction("approve")).toBe("approved");
    expect(factStatusForAction("reject")).toBe("rejected");
    expect(factStatusForAction("stale")).toBe("stale");
    expect(factStatusForAction("recheck")).toBe("pending");
  });
});

describe("review repository", () => {
  it("creates a task and then reads it with its fact snapshot", async () => {
    mockQuery(async (q, p) => {
      if (q.startsWith("INSERT INTO review_tasks")) {
        expect(p[1]).toBe("fact_1");
        expect(p[2]).toBe("new_fact");
        expect(p[3]).toBe("high");
        expect(p[8]).toBe(JSON.stringify({ sourceAuthority: "A" }));
        return { rows: [{ id: "task_1" }], rowCount: 1 };
      }
      expect(q).toMatch(/JOIN facts f ON f\.id = t\.fact_id/);
      return { rows: [taskRow()], rowCount: 1 };
    });

    const task = await createReviewTask({
      factId: "fact_1",
      taskType: "new_fact",
      severity: "high",
      toRevisionId: "revision_2",
      reason: "CDS update",
      metadata: { sourceAuthority: "A" },
    });
    expect(task.id).toBe("task_1");
    expect(task.fact.entityId).toBe("mit");
    expect(task.fact.currentRevision).toBe(2);
  });

  it("rejects invalid queue drafts before touching the database", async () => {
    await expect(createReviewTask({
      factId: "",
      taskType: "new_fact",
    })).rejects.toThrow(/factId/);

    await expect(createReviewTask({
      factId: "fact_1",
      taskType: "new" as never,
    })).rejects.toThrow(/task type/);

    await expect(createReviewTask({
      factId: "fact_1",
      taskType: "new_fact",
      severity: "urgent" as never,
    })).rejects.toThrow(/severity/);
  });

  it("lists the pending queue by severity with bounded pagination", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/t\.status = \$1/);
      expect(q).toMatch(/WHEN 'critical' THEN 0/);
      expect(p).toEqual(["pending", 25]);
      return { rows: [taskRow(), taskRow({ task_id: "task_2" })], rowCount: 2 };
    });

    const tasks = await listReviewTasks({ limit: 25 });
    expect(tasks).toHaveLength(2);
  });

  it("synchronizes task, current fact, current revision, and audit in one statement", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/UPDATE review_tasks/);
      expect(q).toMatch(/status IN \('pending', 'recheck'\)/);
      expect(q).toMatch(/UPDATE facts f/);
      expect(q).toMatch(/UPDATE fact_revisions r/);
      expect(q).toMatch(/r\.revision_number = uf\.current_revision/);
      expect(q).toMatch(/FOR UPDATE OF t/);
      expect(q).toMatch(/INSERT INTO review_actions/);
      expect(p[0]).toBe("task_1");
      expect(p[1]).toBe("approved");
      expect(p[2]).toBe("approved");
      expect(p[3]).toBe("user_1");
      expect(p[4]).toBe("matches official PDF");
      expect(p[6]).toBe("approve");
      return { rows: [actionRow()], rowCount: 1 };
    });

    const result = await applyReviewAction(
      "task_1",
      "approve",
      "user_1",
      " matches official PDF ",
    );
    expect(result?.task.status).toBe("approved");
    expect(result?.task.fact.reviewStatus).toBe("approved");
    expect(result?.audit.actorUserId).toBe("user_1");
    expect(result?.audit.taskStatusBefore).toBe("pending");
    expect(result?.audit.taskStatusAfter).toBe("approved");
    expect(result?.audit.factStatusBefore).toBe("pending");
    expect(result?.audit.factStatusAfter).toBe("approved");
  });

  it("maps each action to its fact visibility state", async () => {
    const expected = {
      approve: ["approved", "approved"],
      reject: ["rejected", "rejected"],
      stale: ["stale", "stale"],
      recheck: ["recheck", "pending"],
    } as const;

    for (const action of REVIEW_ACTIONS) {
      queryMock.mockReset();
      mockQuery(async (_q, p) => ({
        rows: [actionRow({
          action,
          status: expected[action][0],
          review_status: expected[action][1],
          task_status_after: expected[action][0],
          fact_status_after: expected[action][1],
        })],
        rowCount: 1,
      }));
      const result = await applyReviewAction("task_1", action, "user_1", "operator decision");
      expect(result?.task.status).toBe(expected[action][0]);
      expect(result?.task.fact.reviewStatus).toBe(expected[action][1]);
    }
  });

  it("refuses to review a terminal task and reports its current state", async () => {
    mockQuery(async (q) => {
      if (q.includes("review_actions")) return { rows: [], rowCount: 0 };
      return { rows: [taskRow({ status: "approved", review_status: "approved" })], rowCount: 1 };
    });

    await expect(applyReviewAction("task_1", "reject", "user_1", "duplicate"))
      .rejects.toBeInstanceOf(ReviewTaskStateError);
  });
});

describe("review API route", () => {
  it("requires advisor or owner access", async () => {
    authMock.requireAdvisor.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const response = await GET(new Request("http://localhost/api/admin/information/review"));
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("returns the filtered queue after authorization", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/FROM review_tasks t/);
      expect(p[0]).toBe("recheck");
      return { rows: [taskRow({ status: "recheck" })], rowCount: 1 };
    });
    const response = await GET(
      new Request("http://localhost/api/admin/information/review?status=recheck"),
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.tasks).toHaveLength(1);
  });

  it("uses the repository default page size when limit is omitted", async () => {
    mockQuery(async (_q, params) => {
      expect(params).toEqual(["pending", 50]);
      return { rows: [taskRow(), taskRow({ task_id: "task_2" })], rowCount: 2 };
    });
    const response = await GET(
      new Request("http://localhost/api/admin/information/review"),
    );
    expect(response.status).toBe(200);
    expect((await json(response)).tasks).toHaveLength(2);
  });

  it("validates the POST body before calling the repository", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/information/review", {
        method: "POST",
        body: JSON.stringify({ taskId: "task_1", action: "publish", reason: "ok" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ ok: false, code: "INVALID_ACTION" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("applies an action as the authenticated advisor", async () => {
    mockQuery(async (_q, p) => {
      expect(p[3]).toBe("user_1");
      return { rows: [actionRow()], rowCount: 1 };
    });
    const response = await POST(
      new Request("http://localhost/api/admin/information/review", {
        method: "POST",
        body: JSON.stringify({
          taskId: "task_1",
          action: "approve",
          reason: "matches official PDF",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.audit).toMatchObject({ action: "approve", actorUserId: "user_1" });
  });

  it("returns conflict semantics for a terminal task", async () => {
    mockQuery(async (q) => {
      if (q.includes("review_actions")) return { rows: [], rowCount: 0 };
      return { rows: [taskRow({ status: "approved" })], rowCount: 1 };
    });
    const response = await POST(
      new Request("http://localhost/api/admin/information/review", {
        method: "POST",
        body: JSON.stringify({ taskId: "task_1", action: "reject", reason: "duplicate" }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({
      ok: false,
      code: "INVALID_REVIEW_STATE",
      currentStatus: "approved",
    });
  });
});

describe("review migration contract", () => {
  it("creates an idempotent append-only audit table", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "db/migrations/010-review-actions.sql"),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS review_actions/);
    expect(sql).toMatch(/task_status_before/);
    expect(sql).toMatch(/fact_status_after/);
    expect(sql).toMatch(/INSERT INTO schema_migrations \(version\) VALUES \('010-review-actions'\)/);
  });
});
