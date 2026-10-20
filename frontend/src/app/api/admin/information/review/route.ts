// GET  /api/admin/information/review
// POST /api/admin/information/review
//
// Operator-facing review queue. Only organization owners and advisors may
// inspect or change publication state. Every POST is persisted with actor,
// action, reason, timestamps, task transition, and fact transition.

import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { ForbiddenError, requireAdvisor } from "@/lib/admin-auth";
import {
  isReviewAction,
  isReviewTaskStatus,
  isReviewTaskType,
} from "@/domain/information/review";
import {
  applyReviewAction,
  createReviewTask,
  listReviewTasks,
  ReviewTaskStateError,
} from "@/server/information/review-repository";

export const dynamic = "force-dynamic";

interface PostBody {
  taskId?: string;
  action?: string;
  reason?: string;
}

async function authResponse(): Promise<NextResponse | null> {
  try {
    await requireAdvisor();
    return null;
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    throw e;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authResponse();
  if (auth) return auth;

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const typeRaw = url.searchParams.get("taskType");
  const factId = url.searchParams.get("factId") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? NaN);

  const status = statusRaw && isReviewTaskStatus(statusRaw) ? statusRaw : null;
  const taskType = typeRaw && isReviewTaskType(typeRaw) ? typeRaw : null;
  if (statusRaw && !status) {
    return NextResponse.json(
      { ok: false, code: "INVALID_STATUS", message: "unknown review task status" },
      { status: 400 },
    );
  }
  if (typeRaw && !taskType) {
    return NextResponse.json(
      { ok: false, code: "INVALID_TASK_TYPE", message: "unknown review task type" },
      { status: 400 },
    );
  }
  if (factId && factId.length > 64) {
    return NextResponse.json(
      { ok: false, code: "INVALID_FACT_ID", message: "factId must be at most 64 characters" },
      { status: 400 },
    );
  }
  if (url.searchParams.has("limit") && (!Number.isFinite(limitRaw) || limitRaw < 1)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_LIMIT", message: "limit must be a positive number" },
      { status: 400 },
    );
  }

  try {
    const tasks = await listReviewTasks({
      status: status ?? undefined,
      taskType: taskType ?? undefined,
      factId: factId || undefined,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });
    return NextResponse.json({ ok: true, tasks });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    console.error("[admin/information/review] list failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let authUser: { user: { id: string } } | null = null;
  try {
    authUser = await requireAdvisor();
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    throw e;
  }

  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
  }

  const taskId = (body.taskId ?? "").trim();
  const action = body.action;
  const reason = (body.reason ?? "").trim();
  if (!taskId || taskId.length > 64) {
    return NextResponse.json(
      { ok: false, code: "INVALID_TASK_ID", message: "taskId is required" },
      { status: 400 },
    );
  }
  if (!isReviewAction(action)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_ACTION", message: "action must be approve, reject, stale, or recheck" },
      { status: 400 },
    );
  }
  if (!reason || reason.length > 2000) {
    return NextResponse.json(
      { ok: false, code: "INVALID_REASON", message: "reason is required and must be at most 2000 characters" },
      { status: 400 },
    );
  }

  try {
    const result = await applyReviewAction(taskId, action, authUser.user.id, reason);
    if (!result) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ReviewTaskStateError) {
      return NextResponse.json(
        {
          ok: false,
          code: e.code,
          message: e.message,
          currentStatus: e.currentStatus,
        },
        { status: e.status },
      );
    }
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    console.error("[admin/information/review] action failed:", e);
    return NextResponse.json(
      { ok: false, code: "DB_UNREACHABLE", message: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
