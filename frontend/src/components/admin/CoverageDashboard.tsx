import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Database,
  Gauge,
  Search,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import PageMotion from "@/components/shared/PageMotion";
import type {
  CoverageCellStatus,
  CoverageReport,
} from "@/domain/information/coverage";

interface CoverageDashboardProps {
  report: CoverageReport | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

const STATUS_META: Record<CoverageCellStatus, { label: string; className: string; mark: string }> = {
  covered: { label: "已覆盖", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", mark: "覆" },
  not_reported: { label: "官方未报告", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300", mark: "报" },
  not_collected: { label: "未采集", className: "bg-cobalt/10 text-cobalt", mark: "采" },
  source_unavailable: { label: "来源不可用", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300", mark: "源" },
};

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function dateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toISOString().slice(0, 16).replace("T", " ");
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}): JSX.Element {
  return (
    <section className="rounded-control border border-border-soft bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{label}</p>
        <span className="grid h-7 w-7 place-items-center rounded-control bg-cobalt/10 text-cobalt" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-[13px] text-text-secondary">{detail}</p>
    </section>
  );
}

export default function CoverageDashboard({
  report,
  errorCode,
  errorMessage,
}: CoverageDashboardProps): JSX.Element {
  return (
    <PageMotion className="min-h-screen bg-surface-base">
      <main id="main-content" className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" data-reveal="true">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
              ADMIN / INFORMATION
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary" data-heading-stagger="true">
              信息平台覆盖率
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] text-text-secondary">
              {report
                ? `基准：approved 当前事实 · ${dateTime(report.generatedAt)}`
                : "覆盖率数据暂不可用"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/api/admin/information/coverage"
              className="inline-flex h-control items-center rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              导出 JSON
            </Link>
            <Link
              href="/api/admin/information/review"
              className="inline-flex h-control items-center rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              审核队列
            </Link>
          </div>
        </header>

        {errorCode ? (
          <section
            className="mt-8 rounded-control border border-border-soft bg-surface-1 p-6"
            role="alert"
            data-reveal="true"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-rose-500/10 text-rose-600 dark:text-rose-300">
                <AlertTriangle size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-text-primary">覆盖率服务不可用</h2>
                <p className="mt-1 text-[13px] text-text-secondary">
                  {errorCode === "DATABASE_NOT_CONFIGURED"
                    ? "DATABASE_URL 未配置，无法计算 approved facts 覆盖率。"
                    : errorMessage || "数据库或信息平台迁移暂不可用。"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-text-secondary">{errorCode}</p>
              </div>
            </div>
          </section>
        ) : null}

        {report ? (
          <>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-reveal="true">
              <StatCard
                icon={<Gauge size={16} />}
                label="优先字段覆盖"
                value={percent(report.totals.coverageRate)}
                detail={`${report.totals.covered} / ${report.totals.cells} 个矩阵格`}
              />
              <StatCard
                icon={<Database size={16} />}
                label="Approved facts"
                value={String(report.freshness.factCount)}
                detail={`来源年龄中位数 ${report.freshness.medianAgeDays ?? "-"} 天`}
              />
              <StatCard
                icon={<CalendarClock size={16} />}
                label="Deadline / Cost"
                value={`${report.totals.deadlineCoveredSchools} / ${report.totals.costCoveredSchools}`}
                detail={`共 ${report.totals.schools} 所学校`}
              />
              <StatCard
                icon={<ClipboardCheck size={16} />}
                label="审核 Backlog"
                value={String(report.reviewBacklog.openTasks)}
                detail={`高优先 ${report.reviewBacklog.critical + report.reviewBacklog.high} · 最老 ${
                  report.reviewBacklog.oldestTaskAgeDays ?? "-"
                } 天`}
              />
            </div>

            <section className="mt-8 rounded-control border border-border-soft bg-surface-1 p-4" data-reveal="true">
              <h2 className="text-base font-semibold text-text-primary">字段矩阵</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-text-secondary">
                      <th className="w-44 border-b border-border-soft pb-2 pr-3 font-semibold">字段</th>
                      <th className="border-b border-border-soft px-3 pb-2 font-semibold">已覆盖</th>
                      <th className="border-b border-border-soft px-3 pb-2 font-semibold">官方未报告</th>
                      <th className="border-b border-border-soft px-3 pb-2 font-semibold">未采集</th>
                      <th className="border-b border-border-soft px-3 pb-2 font-semibold">来源不可用</th>
                      <th className="border-b border-border-soft px-3 pb-2 font-semibold">覆盖率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.fieldSummaries.map((field) => (
                      <tr key={field.fieldKey} className="border-b border-border-soft/60 last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-text-primary">{field.label}</p>
                          <p className="font-mono text-[11px] text-text-secondary">{field.fieldKey}</p>
                        </td>
                        <td className="px-3 py-2.5 text-text-primary">{field.covered}</td>
                        <td className="px-3 py-2.5 text-text-primary">{field.notReported}</td>
                        <td className="px-3 py-2.5 text-text-primary">{field.notCollected}</td>
                        <td className="px-3 py-2.5 text-text-primary">{field.sourceUnavailable}</td>
                        <td className="px-3 py-2.5 font-semibold text-cobalt">{percent(field.coverageRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 rounded-control border border-border-soft bg-surface-1 p-4" data-reveal="true">
              <h2 className="text-base font-semibold text-text-primary">学校矩阵</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-text-secondary">
                      <th className="w-64 border-b border-border-soft pb-2 pr-3 font-semibold">学校</th>
                      {report.priorityFields.map((field) => (
                        <th
                          key={field.fieldKey}
                          className="border-b border-border-soft px-2 pb-2 text-center font-semibold"
                          title={field.fieldKey}
                        >
                          {field.label}
                        </th>
                      ))}
                      <th className="border-b border-border-soft px-3 pb-2 text-center font-semibold">覆盖率</th>
                      <th className="border-b border-border-soft px-3 pb-2 text-center font-semibold">来源年龄</th>
                      <th className="border-b border-border-soft px-3 pb-2 text-center font-semibold">审核</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.schools.map((school) => (
                      <tr key={school.id} className="border-b border-border-soft/60 last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-text-primary">{school.displayName}</p>
                          <p className="font-mono text-[11px] text-text-secondary">{school.id}</p>
                        </td>
                        {school.cells.map((cell) => (
                          <td key={`${school.id}:${cell.fieldKey}`} className="px-2 py-2.5 text-center">
                            <span
                              className={`inline-grid h-6 w-6 place-items-center rounded-control text-[11px] font-semibold ${STATUS_META[cell.status].className}`}
                              title={`${cell.label} · ${STATUS_META[cell.status].label}${cell.ageDays == null ? "" : ` · ${cell.ageDays} 天`}`}
                            >
                              {STATUS_META[cell.status].mark}
                            </span>
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center font-semibold text-cobalt">
                          {percent(school.coverageRate)}
                        </td>
                        <td className="px-3 py-2.5 text-center text-text-primary">
                          {school.sourceAgeDays == null ? "-" : `${school.sourceAgeDays}天`}
                        </td>
                        <td className="px-3 py-2.5 text-center text-text-primary">
                          {school.openReviewTaskCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-3" data-reveal="true">
              <section className="rounded-control border border-border-soft bg-surface-1 p-4">
                <h2 className="text-base font-semibold text-text-primary">补数据任务排序</h2>
                <ol className="mt-4 space-y-3">
                  {report.prioritizedTasks.slice(0, 10).map((task, index) => (
                    <li key={task.schoolId} className="flex items-start gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-control bg-cobalt/10 text-[11px] font-semibold text-cobalt">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-[13px] font-medium text-text-primary">{task.schoolName}</p>
                        <p className="mt-1 text-[12px] text-text-secondary">{task.reasons.join(" · ")}</p>
                      </div>
                      <span className="ml-auto font-mono text-[12px] text-text-secondary">{task.score}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="rounded-control border border-border-soft bg-surface-1 p-4">
                <h2 className="text-base font-semibold text-text-primary">失败来源</h2>
                {report.sourceFailures.length === 0 ? (
                  <p className="mt-4 text-[13px] text-text-secondary">近 30 天无 failed / blocked 记录</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {report.sourceFailures.slice(0, 8).map((failure) => (
                      <li key={failure.sourceId}>
                        <p className="text-[13px] font-medium text-text-primary">{failure.sourceName}</p>
                        <p className="mt-1 text-[12px] text-text-secondary">
                          {failure.failureCount} 次 · 最近 {dateTime(failure.lastFailedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-control border border-border-soft bg-surface-1 p-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                  <Search size={16} aria-hidden="true" />
                  高频无结果
                </h2>
                {report.hotNoResultQueries.length === 0 ? (
                  <p className="mt-4 text-[13px] text-text-secondary">近 30 天未达到 3 次</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {report.hotNoResultQueries.slice(0, 8).map((query) => (
                      <li key={`${query.query}:${query.lastSeenAt}`} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] text-text-primary">{query.query}</span>
                        <span className="shrink-0 font-mono text-[12px] text-text-secondary">
                          {query.requests} 次
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}
      </main>
    </PageMotion>
  );
}
