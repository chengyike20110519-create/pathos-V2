"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  CircleAlert,
  ExternalLink,
  History,
  Inbox,
  Search,
  ShieldCheck,
} from "lucide-react";
import type {
  InformationEvent,
  InformationFeed,
  InformationFeedRecord,
  InformationEventUrgency,
} from "@/server/information/event-repository";

const STORAGE_KEY = "pathos_followed_universities";

const CATEGORY_LABELS: Record<string, string> = {
  admission_policy: "录取政策",
  deadline: "截止日期",
  cost: "成本",
  new_program: "新项目",
  program_discontinued: "项目停招",
  scholarship: "奖学金",
  ranking: "排名",
  requirement: "申请要求",
  official_announcement: "官方公告",
  application_change: "申请变化",
  campus_update: "学校动态",
  other: "其他",
};

const ENTITY_LABELS: Record<string, string> = {
  university: "学校",
  program: "项目",
  major: "专业",
  location: "地区",
  scholarship: "奖学金",
  opportunity: "机会",
};

const URGENCY_LABELS: Record<InformationEventUrgency, string> = {
  expired: "已过期",
  critical: "7 天内",
  high: "30 天内",
  medium: "90 天内",
  low: "90 天以上",
  none: "无截止日",
};

const URGENCY_CLASS: Record<InformationEventUrgency, string> = {
  expired: "border-border-soft bg-surface-2 text-text-secondary",
  critical: "border-danger/30 bg-danger/8 text-danger",
  high: "border-persimmon/30 bg-persimmon/8 text-persimmon",
  medium: "border-cobalt/30 bg-cobalt/8 text-cobalt",
  low: "border-border-soft bg-surface-2 text-text-secondary",
  none: "border-border-soft bg-surface-2 text-text-muted",
};

function formatDate(value: string | null): string {
  if (value == null) return "未提供";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待核验";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " UTC";
}

function formatValue(value: unknown): string {
  if (value == null) return "未记录";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "值不可解析";
  }
}

function displayName(record: InformationFeedRecord): string {
  return record.universityNameZh ||
    record.universityName ||
    record.entityName ||
    record.entityId ||
    "未关联对象";
}

function followId(record: InformationFeedRecord): string | null {
  return record.universityId ?? (record.entityType === "university" ? record.entityId : null);
}

function SourceFooter({ record }: { record: InformationFeedRecord }) {
  return (
    <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-soft pt-3 text-[11px] text-text-muted">
      <span className="inline-flex items-center gap-1">
        {record.recordKind === "approved_event" ? (
          <>
            <ShieldCheck size={13} aria-hidden="true" />
            approved / {record.fact.confidence}
          </>
        ) : (
          <>
            <History size={13} aria-hidden="true" />
            Preview / 未审核
          </>
        )}
      </span>
      <span>发布 {formatDate(record.publishedAt)}</span>
      {record.recordKind === "approved_event" ? (
        <span>采集 {formatDate(record.fact.retrievedAt)}</span>
      ) : null}
      {record.source.url ? (
        <a
          className="ml-auto inline-flex items-center gap-1 font-medium text-cobalt transition hover:opacity-80"
          href={record.source.url}
          target="_blank"
          rel="noreferrer"
        >
          {record.source.name}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : (
        <span className="ml-auto">{record.source.name}</span>
      )}
    </footer>
  );
}

function EventCard({ event }: { event: InformationEvent }) {
  return (
    <article className="rounded-card border border-border-soft bg-surface-1 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cobalt">
            {CATEGORY_LABELS[event.eventType] ?? event.eventType}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-text-primary">{event.title}</h3>
          <p className="mt-1 text-xs text-text-secondary">{displayName(event)}</p>
        </div>
        <span className={`shrink-0 rounded-control border px-2 py-1 text-[11px] font-semibold ${URGENCY_CLASS[event.urgency]}`}>
          {URGENCY_LABELS[event.urgency]}
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-text-secondary">{event.summary}</p>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-control bg-surface-2 p-3">
          <dt className="text-text-muted">旧值</dt>
          <dd className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-text-primary">
            {formatValue(event.previousValue)}
          </dd>
        </div>
        <div className="rounded-control bg-surface-2 p-3">
          <dt className="text-text-muted">新值</dt>
          <dd className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-text-primary">
            {formatValue(event.newValue)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-text-muted">为什么重要</p>
          <p className="mt-1 leading-5 text-text-primary">{event.whyItMatters}</p>
        </div>
        <div>
          <p className="text-text-muted">行动截止</p>
          <p className="mt-1 leading-5 text-text-primary">{formatDate(event.actionDeadline)}</p>
        </div>
      </div>

      {event.actionSteps.length > 0 ? (
        <ol className="mt-3 space-y-1.5 text-xs text-text-secondary">
          {event.actionSteps.map((step, index) => (
            <li key={`${event.id}-step-${index}`} className="flex gap-2">
              <span className="font-semibold text-cobalt">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <SourceFooter record={event} />
    </article>
  );
}

function PreviewCard({ record }: { record: Extract<InformationFeedRecord, { recordKind: "preview_news" }> }) {
  return (
    <article className="rounded-card border border-dashed border-persimmon/40 bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-persimmon">
            Preview 兼容记录 / 未进入事实审核
          </p>
          <h3 className="mt-1 text-sm font-semibold text-text-primary">{record.title}</h3>
          <p className="mt-1 text-xs text-text-secondary">{displayName(record)}</p>
        </div>
        <span className={`shrink-0 rounded-control border px-2 py-1 text-[11px] font-semibold ${URGENCY_CLASS[record.urgency]}`}>
          {URGENCY_LABELS[record.urgency]}
        </span>
      </div>

      {record.summary ? (
        <p className="mt-3 text-xs leading-5 text-text-secondary">{record.summary}</p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-text-secondary">
        {record.whyItMatters ?? "该记录尚未整理成已审核的 why it matters。"}
      </p>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-text-muted">变化值</p>
          <p className="mt-1 text-text-primary">未进入 facts，不能给出 old / new value。</p>
        </div>
        <div>
          <p className="text-text-muted">行动截止</p>
          <p className="mt-1 text-text-primary">{formatDate(record.actionDeadline)}</p>
        </div>
      </div>
      <SourceFooter record={record} />
    </article>
  );
}

export function InformationFeedView({
  feed,
  error,
}: {
  feed?: InformationFeed;
  error?: string;
}) {
  const [entityType, setEntityType] = React.useState("");
  const [schoolId, setSchoolId] = React.useState("");
  const [eventType, setEventType] = React.useState("");
  const [urgency, setUrgency] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [followingOnly, setFollowingOnly] = React.useState(false);
  const [following, setFollowing] = React.useState<string[]>([]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setFollowing(
        Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
          ? parsed as string[]
          : [],
      );
    } catch {
      setFollowing([]);
    }
  }, []);

  if (!feed) {
    return (
      <section role="alert" className="rounded-card border border-persimmon/30 bg-persimmon/8 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-persimmon">
          <CircleAlert size={16} aria-hidden="true" />
          机会动态暂不可用
        </p>
        <p className="mt-1.5 text-xs leading-5 text-text-secondary">
          {error ?? "已审核事件层暂不可用。为避免误导，页面不会显示缓存或示例动态。"}
        </p>
      </section>
    );
  }

  const records: InformationFeedRecord[] = [...feed.events, ...feed.previewNews];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = records.filter((record) => {
    if (entityType && record.entityType !== entityType) return false;
    if (schoolId && followId(record) !== schoolId) return false;
    if (eventType && record.eventType !== eventType) return false;
    if (urgency && record.urgency !== urgency) return false;
    if (followingOnly) {
      const id = followId(record);
      if (id == null || !following.includes(id)) return false;
    }
    if (!normalizedQuery) return true;
    return [
      record.title,
      record.recordKind === "preview_news" ? record.titleEn : null,
      record.summary,
      record.recordKind === "approved_event" ? record.whatChanged : null,
      record.recordKind === "approved_event" ? record.whyItMatters : null,
      displayName(record),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const filteredEvents = filtered.filter((record): record is InformationEvent =>
    record.recordKind === "approved_event",
  );
  const filteredPreview = filtered.filter((record): record is Extract<InformationFeedRecord, { recordKind: "preview_news" }> =>
    record.recordKind === "preview_news",
  );
  const schools = Array.from(
    new Map(
      records
        .map((record) => ({ id: followId(record), name: displayName(record) }))
        .filter((item): item is { id: string; name: string } => item.id != null)
        .map((item) => [item.id, item]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  const categories = Array.from(new Set(records.map((record) => record.eventType)));
  const hasFilters = Boolean(entityType || schoolId || eventType || urgency || query || followingOnly);

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-border-soft bg-surface-1 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <Bell size={14} className="text-cobalt" aria-hidden="true" />
            已审核事件 {feed.coverage.approvedEvents}
          </p>
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <History size={14} className="text-persimmon" aria-hidden="true" />
            Preview 记录 {feed.coverage.previewNews}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4 lg:grid-cols-5">
          <label className="block text-xs text-text-secondary">
            <span className="mb-1.5 block">对象类型</span>
            <select
              className="h-control w-full rounded-control border border-border-soft bg-surface-2 px-3 text-xs text-text-primary ring-focus-ring"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
              <option value="">全部</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-text-secondary">
            <span className="mb-1.5 block">学校</span>
            <select
              className="h-control w-full rounded-control border border-border-soft bg-surface-2 px-3 text-xs text-text-primary ring-focus-ring"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
            >
              <option value="">全部</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-text-secondary">
            <span className="mb-1.5 block">类别</span>
            <select
              className="h-control w-full rounded-control border border-border-soft bg-surface-2 px-3 text-xs text-text-primary ring-focus-ring"
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
            >
              <option value="">全部</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-text-secondary">
            <span className="mb-1.5 block">紧急度</span>
            <select
              className="h-control w-full rounded-control border border-border-soft bg-surface-2 px-3 text-xs text-text-primary ring-focus-ring"
              value={urgency}
              onChange={(event) => setUrgency(event.target.value)}
            >
              <option value="">全部</option>
              {INFORMATION_URGENCY_OPTIONS.map((value) => (
                <option key={value} value={value}>{URGENCY_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-text-secondary md:col-span-2 lg:col-span-1">
            <span className="mb-1.5 block">搜索</span>
            <span className="relative block">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                className="h-control w-full rounded-control border border-border-soft bg-surface-2 pl-8 pr-3 text-xs text-text-primary ring-focus-ring"
                placeholder="标题、学校、影响"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-soft text-cobalt ring-focus-ring"
              checked={followingOnly}
              onChange={(event) => setFollowingOnly(event.target.checked)}
            />
            只看关注学校
          </label>
          {hasFilters ? (
            <button
              type="button"
              className="h-control rounded-control border border-border-soft bg-surface-2 px-3 text-xs font-medium text-text-secondary transition hover:opacity-80"
              onClick={() => {
                setEntityType("");
                setSchoolId("");
                setEventType("");
                setUrgency("");
                setQuery("");
                setFollowingOnly(false);
              }}
            >
              清除筛选
            </button>
          ) : null}
        </div>
      </section>

      {feed.previewFallback && feed.previewNews.length > 0 ? (
        <section className="rounded-card border border-dashed border-persimmon/40 bg-persimmon/8 p-4">
          <p className="text-xs font-semibold text-persimmon">Preview 动态未审核</p>
          <p className="mt-1.5 text-xs leading-5 text-text-secondary">
            information_events 尚无已发布事件。以下来自旧 news_articles 兼容读模型，只作迁移前参考，不标 approved，也不提供 old / new value。
          </p>
        </section>
      ) : null}

      <section aria-labelledby="approved-information-events" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2
            id="approved-information-events"
            className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted"
          >
            已审核事件
          </h2>
          <span className="rounded-control bg-surface-2 px-2 py-1 text-[11px] font-semibold text-text-secondary">
            {filteredEvents.length}
          </span>
        </div>
        {filteredEvents.map((event) => <EventCard key={event.id} event={event} />)}
      </section>

      {filteredPreview.length > 0 ? (
        <section aria-labelledby="preview-information-events" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2
              id="preview-information-events"
              className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted"
            >
              Preview 兼容动态
            </h2>
            <span className="rounded-control bg-surface-2 px-2 py-1 text-[11px] font-semibold text-text-secondary">
              {filteredPreview.length}
            </span>
          </div>
          {filteredPreview.map((record) => <PreviewCard key={record.id} record={record} />)}
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <section className="rounded-card border border-dashed border-border-soft bg-surface-1 px-4 py-8 text-center" role="status">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-text-muted">
            <Inbox size={18} aria-hidden="true" />
          </span>
          <h2 className="mt-3 text-sm font-semibold text-text-primary">
            {hasFilters ? "没有符合条件的动态" : "暂无已发布事件"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-xl text-xs leading-5 text-text-secondary">
            {hasFilters
              ? "请放宽对象、类别、紧急度或关注学校条件。"
              : "目前监控范围内没有完成审核并发布的变化；未核验来源不会伪装成事件。"}
          </p>
          <Link
            className="mt-4 inline-flex h-control items-center gap-1.5 rounded-control bg-cobalt px-3 text-xs font-semibold text-white transition hover:opacity-90"
            href="/guides"
          >
            浏览大学指南
            <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}

const INFORMATION_URGENCY_OPTIONS: InformationEventUrgency[] = [
  "expired",
  "critical",
  "high",
  "medium",
  "low",
  "none",
];
