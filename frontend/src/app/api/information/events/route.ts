import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "@/server/db";
import { FACT_ENTITY_TYPES, type FactEntityType } from "@/domain/information/fact";
import {
  INFORMATION_EVENT_TYPES,
  INFORMATION_EVENT_URGENCIES,
  InformationSchemaNotReadyError,
  getInformationFeed,
  type InformationEventUrgency,
  type InformationFeedEventType,
} from "@/server/information/event-repository";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const PREVIEW_EVENT_TYPES = [
  "application_change",
  "campus_update",
  "other",
] as const;

function failure(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code, message }, { status, headers: NO_STORE });
}

function parseInteger(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const params = new URL(req.url).searchParams;
  const entityTypeRaw = params.get("entityType");
  const entityId = (params.get("entityId") ?? "").trim();
  const eventTypeRaw = params.get("eventType");
  const urgencyRaw = params.get("urgency");
  const limit = parseInteger(params.get("limit"));

  if (entityTypeRaw != null && !FACT_ENTITY_TYPES.includes(entityTypeRaw as FactEntityType)) {
    return failure("UNSUPPORTED_ENTITY_TYPE", "不支持的事件对象类型。", 400);
  }
  if (entityId.length > 160) {
    return failure("INVALID_ENTITY_ID", "entityId 长度不能超过 160。", 400);
  }
  if (
    eventTypeRaw != null &&
    !INFORMATION_EVENT_TYPES.includes(eventTypeRaw as never) &&
    !PREVIEW_EVENT_TYPES.includes(eventTypeRaw as never)
  ) {
    return failure("UNSUPPORTED_EVENT_TYPE", "不支持的事件类别。", 400);
  }
  if (urgencyRaw != null && !INFORMATION_EVENT_URGENCIES.includes(urgencyRaw as InformationEventUrgency)) {
    return failure("UNSUPPORTED_URGENCY", "不支持的紧急度。", 400);
  }
  if (limit != null && (limit < 1 || limit > 200)) {
    return failure("INVALID_LIMIT", "limit 必须在 1 到 200 之间。", 400);
  }

  try {
    const feed = await getInformationFeed({
      entityType: entityTypeRaw == null ? undefined : entityTypeRaw as FactEntityType,
      entityId: entityId || undefined,
      eventType: eventTypeRaw == null ? undefined : eventTypeRaw as InformationFeedEventType,
      urgency: urgencyRaw == null ? undefined : urgencyRaw as InformationEventUrgency,
      limit: limit ?? undefined,
    });
    return NextResponse.json(
      {
        ok: true,
        events: feed.events,
        previewNews: feed.previewNews,
        previewFallback: feed.previewFallback,
        coverage: feed.coverage,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError || e instanceof InformationSchemaNotReadyError) {
      return failure(e.code, e.message, e.status);
    }
    console.error("[information/events] query failed:", e);
    return failure(
      "INFORMATION_EVENTS_UNAVAILABLE",
      "机会动态事实层暂不可用。",
      503,
    );
  }
}
