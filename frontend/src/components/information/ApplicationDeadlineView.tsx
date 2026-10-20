import {
  CalendarDays,
  CircleAlert,
  ExternalLink,
  History,
  Inbox,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import type {
  ApplicationDeadline,
  PersonalDeadlineItem,
} from "@/domain/information/deadline";
import type {
  ApplicationDeadlineCalendar,
  ApplicationDeadlineCalendarItem,
  MissingDeadlineCalendarItem,
  PersonalApplicationDeadlineCalendar,
} from "@/server/information/aggregate-deadline";

const URGENCY_META: Record<
  ApplicationDeadlineCalendarItem["urgency"],
  { label: string; className: string }
> = {
  expired: { label: "已过期", className: "border-border-soft bg-surface-2 text-text-secondary" },
  critical: { label: "7 天内", className: "border-danger/30 bg-danger/8 text-danger" },
  high: { label: "14 天内", className: "border-persimmon/30 bg-persimmon/8 text-persimmon" },
  medium: { label: "30 天内", className: "border-cobalt/30 bg-cobalt/8 text-cobalt" },
  low: { label: "90 天内", className: "border-border-soft bg-surface-2 text-text-secondary" },
  later: { label: "90 天以上", className: "border-border-soft bg-surface-2 text-text-secondary" },
};

const MISSING_LABELS: Record<string, string> = {
  not_published: "官方尚未发布",
  not_reported: "来源未报告",
  requires_manual_review: "待人工复核",
  source_unavailable: "来源暂不可用",
  not_applicable: "不适用",
};

function formatSourceDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatDueDate(deadline: ApplicationDeadline): string {
  const date = new Date(deadline.dueAtUtc);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(deadline.localTime == null ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
  }).format(date) + " UTC";
}

function formatDeadline(item: ApplicationDeadlineCalendarItem): string {
  return formatDueDate(item.deadline);
}

function DeadlineCard({ item }: { item: ApplicationDeadlineCalendarItem }) {
  const urgency = URGENCY_META[item.urgency];
  return (
    <article className="rounded-card border border-border-soft bg-surface-1 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {item.deadline.title}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {item.deadline.academicYear}
            {item.deadline.round ? ` · ${item.deadline.round.label}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-control border px-2 py-1 text-[11px] font-semibold ${urgency.className}`}>
          {urgency.label}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">截止时间</dt>
          <dd className="mt-1 font-medium text-text-primary">{formatDeadline(item)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">剩余天数</dt>
          <dd className="mt-1 font-medium text-text-primary">
            {item.urgency === "expired" ? "已过期" : `${item.daysRemaining} 天`}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">事实字段</dt>
          <dd className="mt-1 truncate font-mono text-[11px] text-text-secondary">{item.fieldKey}</dd>
        </div>
      </dl>

      <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-soft pt-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck size={13} aria-hidden="true" />
          approved / {item.confidence}
        </span>
        <span>采集 {formatSourceDate(item.deadline.retrievedAt)}</span>
        {item.deadline.historical ? (
          <span className="inline-flex items-center gap-1 text-persimmon">
            <History size={13} aria-hidden="true" />
            历史周期事实，未推断新日期
          </span>
        ) : null}
        <a
          className="ml-auto inline-flex items-center gap-1 font-medium text-cobalt transition hover:opacity-80"
          href={item.deadline.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          来源
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </footer>
    </article>
  );
}

function MissingCard({ item }: { item: MissingDeadlineCalendarItem }) {
  const missing = item.missingDeadline;
  return (
    <article className="rounded-card border border-dashed border-border-soft bg-surface-1 p-4">
      <p className="text-sm font-semibold text-text-primary">{missing.title}</p>
      <p className="mt-1 text-xs text-text-secondary">
        {missing.academicYear} · {MISSING_LABELS[missing.missingReason] ?? missing.missingReason}
      </p>
      <p className="mt-3 text-[11px] text-text-muted">
        该事实没有可排期时间，不会用历史年份补位。
      </p>
    </article>
  );
}

export function ApplicationDeadlineView({
  calendar,
  error,
}: {
  calendar?: ApplicationDeadlineCalendar | PersonalApplicationDeadlineCalendar;
  error?: string;
}) {
  if (!calendar) {
    return (
      <section
        role="alert"
        className="rounded-card border border-persimmon/30 bg-persimmon/8 p-5"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-persimmon">
          <CircleAlert size={16} aria-hidden="true" />
          申请日历暂不可用
        </p>
        <p className="mt-1.5 text-xs leading-5 text-text-secondary">
          {error ?? "已审核事实层暂不可用。为避免误导，页面不会显示缓存或示例截止日。"}
        </p>
      </section>
    );
  }

  const totalScheduled = calendar.coverage.scheduled;
  const personal = "personalItems" in calendar ? calendar : undefined;
  return (
    <div className="space-y-8">
      <section className="rounded-card border border-border-soft bg-surface-1 p-4">
        <p className="flex items-start gap-2 text-xs leading-5 text-text-secondary">
          <CalendarDays size={15} className="mt-0.5 shrink-0 text-cobalt" aria-hidden="true" />
          {calendar.timezoneNotice} 所有条目均来自当前 approved facts，不使用示例数据或缓存年份。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "可排期", value: totalScheduled },
            { label: "紧急", value: calendar.groups.urgent.length },
            { label: "已过期", value: calendar.groups.expired.length },
            { label: "缺失", value: calendar.coverage.missing },
          ].map((stat) => (
            <div key={stat.label} className="rounded-control bg-surface-2 px-3 py-2">
              <p className="text-[11px] text-text-muted">{stat.label}</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {personal ? (
        <section aria-labelledby="personal-deadlines">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="personal-deadlines"
              className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted"
            >
              我的清单日历
            </h2>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary">
              <ListChecks size={13} aria-hidden="true" />
              {personal.shortlistName}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {personal.personalItems.length === 0 && personal.universitiesWithoutDeadlineFacts.length === 0 ? (
              <p className="rounded-control border border-dashed border-border-soft bg-surface-1 px-4 py-3 text-xs text-text-muted">
                清单为空，添加学校后会自动关联已审核 deadline facts。
              </p>
            ) : null}
            {personal.personalItems.map((item, index) => (
              <div
                key={`${item.state}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border-soft bg-surface-1 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {item.state === "scheduled" ? item.deadline.title : item.missingDeadline.title}
                  </span>
                  <span className="mt-1 block text-xs text-text-secondary">
                    {item.state === "scheduled"
                      ? formatDueDate(item.deadline)
                      : `${MISSING_LABELS[item.missingDeadline.missingReason] ?? item.missingDeadline.missingReason}，无截止时间`}
                  </span>
                </span>
                <span className="rounded-control bg-surface-2 px-2 py-1 text-[11px] font-semibold text-text-secondary">
                  {item.state === "scheduled" ? item.deadline.academicYear : "缺失"}
                </span>
              </div>
            ))}
            {personal.universitiesWithoutDeadlineFacts.map((universityId) => (
              <div
                key={universityId}
                className="rounded-control border border-dashed border-border-soft bg-surface-1 px-4 py-3 text-xs text-text-secondary"
              >
                <span className="font-medium text-text-primary">{universityId}</span>
                <span className="ml-2">暂无已审核 deadline facts，不生成默认日期。</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {calendar.coverage.deadlineFacts === 0 ? (
        <section
          role="status"
          className="rounded-card border border-dashed border-border-soft bg-surface-1 px-6 py-12 text-center"
        >
          <Inbox size={24} className="mx-auto text-text-muted" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-text-primary">暂无已审核申请截止日事实</h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-text-secondary">
            当前 approved facts 中没有 deadline 字段。页面保持空态，不会用往年日期或猜测日期填充。
          </p>
        </section>
      ) : totalScheduled === 0 ? (
        <section
          role="status"
          className="rounded-card border border-dashed border-border-soft bg-surface-1 px-6 py-12 text-center"
        >
          <CalendarDays size={24} className="mx-auto text-text-muted" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-text-primary">暂无可排期的截止时间</h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-text-secondary">
            已有 deadline 事实，但没有可转换成 UTC 时间的有效日期。缺失或待复核项会单独列出。
          </p>
        </section>
      ) : (
        <>
          {[
            { id: "urgent", title: "紧急截止", items: calendar.groups.urgent },
            { id: "upcoming", title: "未来截止", items: calendar.groups.upcoming },
            { id: "expired", title: "已过期 / 历史周期", items: calendar.groups.expired },
          ].map((group) => (
            <section key={group.id} aria-labelledby={`deadline-${group.id}`}>
              <div className="flex items-center justify-between gap-3">
                <h2
                  id={`deadline-${group.id}`}
                  className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted"
                >
                  {group.title}
                </h2>
                <span className="text-xs font-semibold text-text-secondary">{group.items.length}</span>
              </div>
              <p className="sr-only">
                {group.id === "urgent"
                  ? "14 天内的即将到来截止项。"
                  : group.id === "upcoming"
                    ? "14 天以后的即将到来截止项。"
                    : "已经过期或来自历史申请周期的截止项。"}
              </p>
              <div className="mt-3 grid gap-3">
                {group.items.length === 0 ? (
                  <p className="rounded-control border border-dashed border-border-soft bg-surface-1 px-4 py-3 text-xs text-text-muted">
                    本分区暂无条目。
                  </p>
                ) : (
                  group.items.map((item) => <DeadlineCard key={item.factId} item={item} />)
                )}
              </div>
            </section>
          ))}
        </>
      )}

      {calendar.missing.length > 0 ? (
        <section aria-labelledby="deadline-missing">
          <h2
            id="deadline-missing"
            className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted"
          >
            明确缺失
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {calendar.missing.map((item) => <MissingCard key={item.factId} item={item} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
