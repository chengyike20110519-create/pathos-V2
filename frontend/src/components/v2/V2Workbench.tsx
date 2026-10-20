"use client";

// V2Workbench — the single dispatcher behind every /s/* and /f/* route.
//
// Design constraints (from the v2 docs + the user's repeated direction):
//   1. This is additive. It never touches the launched PathOS surfaces
//      (map, /university/[id], calculator, assessment, portfolio). It only
//      reuses their design tokens and data hooks.
//   2. Missing-first. Every value rendered here comes from the live data
//      source. Where the source has no field, we render V2Missing("暂无")
//      or an explicit empty state — never a fabricated number, school, or
//      placeholder row.
//   3. Each mode is its own component so hooks are called unconditionally
//      (a single component switching on `mode` would break the rules of
//      hooks past the first early return).

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import PageMotion from "@/components/shared/PageMotion";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Calculator,
  CalendarClock,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  LineChart,
  ListChecks,
  RefreshCw,
  Radar,
  Scale,
  Search,
  ShieldAlert,
  TrendingUp,
  Wallet,
  Briefcase,
} from "lucide-react";

import type {
  CollegeGuide,
  NewsArticle,
  ResourceState,
  UniversitySummary,
} from "@/domain/dataset";
import type { WorkbenchFactCoverage } from "@/server/information/report-integration";
import type { GuidePreview } from "@/lib/guide-preview";
import { useDataSource } from "@/services/data-source-provider";
import {
  useCollegeGuide,
  useNews,
  useUniversityDetail,
  useUniversitySummaries,
} from "@/hooks/use-data-source";
import {
  DataEmptyState,
  DataLoadingState,
  PreviewErrorState,
} from "@/components/shared/data-states";
import {
  V2FeatureCard,
  V2Missing,
  V2PageHeader,
  V2Panel,
  V2Provenance,
  V2SourceCard,
  V2TrendChart,
} from "@/components/v2/V2Primitives";
import {
  GPA_ALGORITHMS,
  calculateGPA,
  type GPAAlgorithm,
  type GPACourse,
} from "@/lib/gpa";
import { calculatePayback } from "@/lib/roi";
import type { TimeSeriesMetric } from "@/types/timeseries";

type Family = "s" | "f";

const PAGE = "mx-auto w-full max-w-page px-4 pb-16 pt-8";

// ── Pure helpers ─────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip the `candidate-v2:`-style namespace from a bundle id. */
function idTail(id: string): string {
  const parts = id.split(":");
  return parts[parts.length - 1] ?? id;
}

function schoolSlug(school: UniversitySummary): string {
  return slugify(school.name) || slugify(idTail(school.id)) || school.id;
}

function schoolHref(school: UniversitySummary, family: Family): string {
  return family === "f"
    ? `/f/school/${schoolSlug(school)}`
    : `/s/${schoolSlug(school)}`;
}

function programSlug(name: string): string {
  return slugify(name);
}

function majorHref(name: string, family: Family): string {
  const base = family === "f" ? "/f/major" : "/s/major";
  return `${base}/${programSlug(name)}`;
}

/** Resolve a route param to a school, tolerating both id shapes and name slugs. */
function matchSchool(
  schools: UniversitySummary[],
  raw: string,
): UniversitySummary | null {
  const target = raw.trim().toLowerCase();
  if (!target) return null;

  const byId = schools.find((s) => s.id.toLowerCase() === target);
  if (byId) return byId;

  const byIdTail = schools.find((s) => idTail(s.id).toLowerCase() === target);
  if (byIdTail) return byIdTail;

  const byName = schools.find((s) => slugify(s.name) === target);
  if (byName) return byName;

  const byChinese = schools.find(
    (s) =>
      s.nameZh === raw ||
      s.chineseName === raw ||
      slugify(s.nameZh) === target ||
      slugify(s.chineseName) === target,
  );
  if (byChinese) return byChinese;

  const candidateSlugs = schools
    .map((s) => ({ school: s, slug: slugify(s.name) }))
    .filter((entry) => entry.slug.length >= 4);

  const loose = candidateSlugs.find(
    (entry) => entry.slug.includes(target) || target.includes(entry.slug),
  );
  return loose ? loose.school : null;
}

function previewOf(
  school: UniversitySummary | null | undefined,
): GuidePreview | null {
  if (!school) return null;
  const preview = school.guidePreview;
  return preview && preview.hasData ? preview : null;
}

function rankOf(school: UniversitySummary): number {
  const rank = school.rankingSummary?.nationalRank;
  return typeof rank === "number" && Number.isFinite(rank)
    ? rank
    : Number.MAX_SAFE_INTEGER;
}

function fmtInt(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value.toLocaleString("en-US");
}

function fmtPercent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}%`;
}

function cleanText(text: string | undefined, maxLength = 160): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength)}…`
    : cleaned;
}

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

interface ProgramGroup {
  name: string;
  slug: string;
  schools: UniversitySummary[];
}

function groupPrograms(schools: UniversitySummary[]): ProgramGroup[] {
  const map = new Map<string, ProgramGroup>();
  for (const school of schools) {
    for (const raw of school.topPrograms ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const slug = programSlug(name);
      if (!slug) continue;
      const group = map.get(slug) ?? { name, slug, schools: [] };
      group.schools.push(school);
      map.set(slug, group);
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      b.schools.length - a.schools.length || a.name.localeCompare(b.name, "en"),
  );
}

/**
 * Stable list extraction. Deriving `state.status === "ready" ? state.data : []`
 * inline makes the array a new reference on every render, which churns any
 * `useMemo` downstream of it. Memoising on the state object fixes that.
 */
function useReadyList<T>(state: ResourceState<T[]>): T[] {
  return useMemo(() => (state.status === "ready" ? state.data : []), [state]);
}

// ── Small presentational pieces ──────────────────────────────────────

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  // Only integers can be counted up; anything else (strings, elements,
  // "暂无") renders verbatim so we never animate a fabricated number.
  const counter =
    typeof value === "number" && Number.isInteger(value) && value >= 0
      ? String(value)
      : undefined;
  return (
    <div
      className="page-motion-card rounded-card border border-border-soft bg-surface-1 px-3.5 py-3 shadow-sm"
      data-reveal="true"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className="mt-1 text-xl font-semibold text-text-primary"
        data-counter={counter}
      >
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-control border border-border-soft bg-surface-muted/30 px-3 py-2.5">
      <p className="text-[10px] font-medium tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function DefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border-soft/60 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-36 shrink-0 text-[11px] text-text-muted">{label}</span>
      <span className="text-xs leading-5 text-text-secondary">{children}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-section text-text-primary">{children}</h2>;
}

function MissingValue() {
  return <V2Missing />;
}

function Loading({ message }: { message: string }) {
  return (
    <div className="py-10">
      <DataLoadingState message={message} />
    </div>
  );
}

function Failure({ code, onRetry }: { code?: string; onRetry?: () => void }) {
  return (
    <div className="py-10">
      <PreviewErrorState code={code} onRetry={onRetry} />
    </div>
  );
}

function SchoolChips({
  schools,
  family,
  limit = 4,
}: {
  schools: UniversitySummary[];
  family: Family;
  limit?: number;
}) {
  if (schools.length === 0) return <MissingValue />;
  const shown = [...schools]
    .sort((a, b) => rankOf(a) - rankOf(b))
    .slice(0, limit);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((school) => (
        <Link
          key={school.id}
          href={schoolHref(school, family)}
          className="inline-flex items-center gap-1 rounded-full border border-border-soft px-2 py-0.5 text-[10px] text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          {school.nameZh}
        </Link>
      ))}
      {schools.length > limit ? (
        <span className="px-1 text-[10px] text-text-muted">
          +{schools.length - limit}
        </span>
      ) : null}
    </div>
  );
}

// ── Home ─────────────────────────────────────────────────────────────

interface FeatureLink {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
}

const STUDENT_LINKS: FeatureLink[] = [
  {
    href: "/s/majors",
    title: "专业聚合",
    description: "按专业横向查看已收录院校，定位强项分布。",
    icon: <Compass size={19} />,
  },
  {
    href: "/compare",
    title: "学校对比",
    description: "并排比较排名、学费、录取率与标化中位线。",
    icon: <Scale size={19} />,
  },
  {
    href: "/s/timeseries",
    title: "录取率与成本时序",
    description: "查看某所学校已核验的逐年变化。",
    icon: <LineChart size={19} />,
  },
  {
    href: "/s/radar",
    title: "招生政策雷达",
    description: "新专业、申请变更与签证政策动态。",
    icon: <Radar size={19} />,
  },
  {
    href: "/s/cases",
    title: "录取案例库",
    description: "真实背景与录取结果对照。",
    icon: <BookOpen size={19} />,
  },
  {
    href: "/s/calculator/gpa",
    title: "GPA 换算",
    description: "标准 / 改进 / 北大三套 4.0 算法对照。",
    icon: <GraduationCap size={19} />,
  },
  {
    href: "/s/calculator/roi",
    title: "ROI 回本测算",
    description: "按起薪与增长率估算学费回收周期。",
    icon: <Wallet size={19} />,
  },
];

const FAMILY_LINKS: FeatureLink[] = [
  {
    href: "/f/policy",
    title: "政策与招生动态",
    description: "新专业、申请变更与签证政策，附来源与时间。",
    icon: <Radar size={19} />,
  },
  {
    href: "/f/calculator/roi",
    title: "ROI 回本测算",
    description: "按起薪与增长率估算学费回收周期。",
    icon: <Wallet size={19} />,
  },
];

function SchoolIndex({
  schools,
  family,
}: {
  schools: UniversitySummary[];
  family: Family;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? schools.filter((school) =>
          [
            school.name,
            school.nameZh,
            school.chineseName,
            school.city,
            school.state,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q)),
        )
      : schools;
    return [...base].sort((a, b) => rankOf(a) - rankOf(b)).slice(0, 24);
  }, [schools, query]);

  return (
    <V2Panel className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionTitle>学校索引</SectionTitle>
          <p className="mt-1 text-xs text-text-muted">
            共 {schools.length} 所已收录院校，按全美排名排序。
          </p>
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">搜索学校</span>
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索学校 / 城市 / 州"
            className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 pl-8 pr-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-cobalt/50"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4">
          <DataEmptyState
            title="没有匹配的学校"
            description="换个关键词，或清空搜索查看全部院校。"
          />
        </div>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((school) => (
            <li key={school.id}>
              <div className="group flex flex-col gap-1 rounded-control border border-border-soft px-3 py-2 transition focus-within:border-cobalt/40 hover:border-cobalt/40 hover:bg-surface-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-text-primary">
                      {school.nameZh}
                    </span>
                    <span className="block truncate text-[10px] text-text-muted">
                      {school.name} · {school.city}, {school.state}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-text-muted group-hover:text-cobalt">
                    {school.rankingSummary?.rankingLabel ?? <V2Missing />}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px]">
                  <Link
                    href={`/university/${school.id}`}
                    className="text-cobalt hover:underline"
                  >
                    查看完整档案 →
                  </Link>
                  <Link
                    href={schoolHref(school, family)}
                    className="text-text-muted hover:text-cobalt hover:underline"
                  >
                    专业数据
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </V2Panel>
  );
}

// ── Student cockpit primitives ───────────────────────────────────────

type WorkbenchResource<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "unauthenticated" }
  | { kind: "unavailable"; message: string };

function useWorkbenchResource<T>(
  url: string,
  reloadToken: number,
): WorkbenchResource<T> {
  const [state, setState] = useState<WorkbenchResource<T>>({
    kind: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; message?: string }
          | null;
        if (response.status === 401) {
          setState({ kind: "unauthenticated" });
          return;
        }
        if (!response.ok || body?.ok !== true) {
          setState({
            kind: "unavailable",
            message: "数据服务暂不可用，已停止展示未核验内容。",
          });
          return;
        }
        setState({ kind: "ready", data: body as T });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({
          kind: "unavailable",
          message: "数据源暂不可用，已停止展示未核验内容。",
        });
      });

    return () => controller.abort();
  }, [url, reloadToken]);

  return state;
}

function formatWorkbenchDate(value: string | null | undefined): string {
  if (!value) return "日期待核验";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日期待核验";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function CockpitPanel({
  icon,
  title,
  badge,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <V2Panel className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-cobalt/10 text-cobalt">
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {title}
            </h3>
            {badge ? <div className="mt-1">{badge}</div> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </V2Panel>
  );
}

function CockpitNotice({
  tone,
  title,
  description,
  action,
}: {
  tone: "neutral" | "warning" | "unavailable";
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const toneClass =
    tone === "unavailable"
      ? "border-persimmon/30 bg-persimmon/8 text-persimmon"
      : tone === "warning"
        ? "border-cobalt/30 bg-cobalt/8 text-cobalt"
        : "border-border-soft bg-surface-muted/50 text-text-secondary";

  return (
    <div
      role={tone === "unavailable" ? "alert" : "status"}
      className={`rounded-control border px-3 py-2.5 ${toneClass}`}
    >
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-text-secondary">
        {description}
      </p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

function CockpitRetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
    >
      <RefreshCw size={12} aria-hidden="true" />
      重试
    </button>
  );
}

interface WorkbenchDeadlineCalendar {
  groups: {
    urgent: Array<{
      deadline: { title: string; dueAtUtc: string; sourceUrl: string };
      urgency: string;
      daysRemaining: number;
    }>;
    upcoming: Array<{
      deadline: { title: string; dueAtUtc: string; sourceUrl: string };
      urgency: string;
      daysRemaining: number;
    }>;
  };
  coverage: { deadlineFacts: number; scheduled: number; missing: number };
}

function DeadlineRemindersCard() {
  const [reloadToken, setReloadToken] = useState(0);
  const state = useWorkbenchResource<WorkbenchDeadlineCalendar>(
    "/api/information/deadlines",
    reloadToken,
  );
  const items =
    state.kind === "ready"
      ? [...state.data.groups.urgent, ...state.data.groups.upcoming].slice(0, 4)
      : [];

  return (
    <CockpitPanel
      icon={<CalendarClock size={16} aria-hidden="true" />}
      title="申请截止提醒"
      badge={
        state.kind === "ready" ? (
          <span className="text-[11px] text-text-muted">
            {state.data.groups.urgent.length} 项紧急 ·{" "}
            {state.data.coverage.scheduled} 项可排期
          </span>
        ) : null
      }
      action={
        <Link
          href="/deadlines"
          className="inline-flex min-h-[44px] items-center rounded-control border border-border-soft px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          日历
        </Link>
      }
    >
      {state.kind === "loading" ? (
        <CockpitNotice
          tone="neutral"
          title="正在读取已审核截止日"
          description="只读取当前有效 facts，不使用往年日期补位。"
        />
      ) : state.kind === "unavailable" ? (
        <CockpitNotice
          tone="unavailable"
          title="申请截止日暂不可用"
          description={state.message}
          action={<CockpitRetryButton onClick={() => setReloadToken(v => v + 1)} />}
        />
      ) : state.kind === "ready" && items.length === 0 ? (
        <CockpitNotice
          tone="neutral"
          title="暂无可排期截止日"
          description={`已审核 deadline facts ${state.data.coverage.deadlineFacts} 条；缺失 ${state.data.coverage.missing} 条会保持显式空态。`}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const urgent = item.daysRemaining <= 7;
            const soon = item.daysRemaining <= 14;
            return (
              <li
                key={`${item.deadline.title}-${item.deadline.dueAtUtc}`}
                className="rounded-control border border-border-soft px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                    {item.deadline.title}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      urgent
                        ? "bg-danger/10 text-danger"
                        : soon
                          ? "bg-persimmon/10 text-persimmon"
                          : "bg-cobalt/10 text-cobalt"
                    }`}
                  >
                    {item.daysRemaining} 天
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-text-muted">
                  <span>{formatWorkbenchDate(item.deadline.dueAtUtc)} UTC</span>
                  <a
                    href={item.deadline.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 hover:text-cobalt"
                  >
                    来源
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CockpitPanel>
  );
}

interface WorkbenchShortlist {
  id: string;
  name: string;
  season: string | null;
  updatedAt: string;
}

function ShortlistsCard() {
  const [reloadToken, setReloadToken] = useState(0);
  const state = useWorkbenchResource<{ shortlists: WorkbenchShortlist[] }>(
    "/api/shortlists",
    reloadToken,
  );
  const lists = state.kind === "ready" ? state.data.shortlists : [];

  return (
    <CockpitPanel
      icon={<ListChecks size={16} aria-hidden="true" />}
      title="选校清单"
      badge={
        state.kind === "ready" ? (
          <span className="text-[11px] text-text-muted">
            {lists.length} 份清单
          </span>
        ) : null
      }
      action={
        <Link
          href="/workbench/shortlists"
          className="inline-flex min-h-[44px] items-center rounded-control border border-border-soft px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          管理
        </Link>
      }
    >
      {state.kind === "loading" ? (
        <CockpitNotice
          tone="neutral"
          title="正在读取选校清单"
          description="清单按当前登录用户归属读取。"
        />
      ) : state.kind === "unauthenticated" ? (
        <CockpitNotice
          tone="neutral"
          title="登录后同步清单"
          description="未登录时不展示任何默认或示例选校组合。"
        />
      ) : state.kind === "unavailable" ? (
        <CockpitNotice
          tone="unavailable"
          title="选校清单暂不可用"
          description={state.message}
          action={<CockpitRetryButton onClick={() => setReloadToken(v => v + 1)} />}
        />
      ) : lists.length === 0 ? (
        <CockpitNotice
          tone="neutral"
          title="暂无选校清单"
          description="创建清单后再关联冲刺、匹配、保底学校。"
        />
      ) : (
        <ul className="space-y-2">
          {lists.slice(0, 3).map((list) => (
            <li key={list.id}>
              <Link
                href={`/workbench/shortlists/${list.id}`}
                className="block rounded-control border border-border-soft px-3 py-2 transition hover:border-cobalt/40 hover:bg-surface-muted/40"
              >
                <p className="truncate text-xs font-medium text-text-primary">
                  {list.name}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  {list.season ?? "申请季未填写"} · 更新{" "}
                  {formatWorkbenchDate(list.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CockpitPanel>
  );
}

interface WorkbenchEventRecord {
  recordKind?: string;
  title: string;
  summary: string | null;
  publishedAt: string;
  universityNameZh: string | null;
  entityName: string | null;
  source: { name: string; url: string };
}

function RecentEventsCard() {
  const [reloadToken, setReloadToken] = useState(0);
  const state = useWorkbenchResource<{
    events: WorkbenchEventRecord[];
    previewNews: WorkbenchEventRecord[];
    previewFallback: boolean;
  }>("/api/information/events?limit=5", reloadToken);
  const records =
    state.kind === "ready"
      ? state.data.events.length > 0
        ? state.data.events
        : state.data.previewNews
      : [];
  const isPreview =
    state.kind === "ready" &&
    state.data.events.length === 0 &&
    state.data.previewNews.length > 0;

  return (
    <CockpitPanel
      icon={<Radar size={16} aria-hidden="true" />}
      title="最近事件"
      badge={
        state.kind === "ready" ? (
          <span className="text-[11px] text-text-muted">
            {isPreview ? "Preview 动态" : "Approved 事件"}
          </span>
        ) : null
      }
      action={
        <Link
          href="/opportunities"
          className="inline-flex min-h-[44px] items-center rounded-control border border-border-soft px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          全部
        </Link>
      }
    >
      {state.kind === "loading" ? (
        <CockpitNotice
          tone="neutral"
          title="正在读取事件流"
          description="事件会保留 approved / Preview 状态标识。"
        />
      ) : state.kind === "unavailable" ? (
        <CockpitNotice
          tone="unavailable"
          title="事件流暂不可用"
          description={state.message}
          action={<CockpitRetryButton onClick={() => setReloadToken(v => v + 1)} />}
        />
      ) : records.length === 0 ? (
        <CockpitNotice
          tone="neutral"
          title="暂无事件"
          description="当前事实层没有可展示的已审核事件。"
        />
      ) : (
        <ul className="space-y-2">
          {records.slice(0, 3).map((record) => (
            <li
              key={`${record.title}-${record.publishedAt}`}
              className="rounded-control border border-border-soft px-3 py-2"
            >
              <p className="truncate text-xs font-medium text-text-primary">
                {record.title}
              </p>
              <p className="mt-1 truncate text-[11px] text-text-muted">
                {record.universityNameZh ?? record.entityName ?? record.source.name}{" "}
                · {formatWorkbenchDate(record.publishedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </CockpitPanel>
  );
}

function ReportsCard() {
  return (
    <CockpitPanel
      icon={<FileText size={16} aria-hidden="true" />}
      title="报告"
      badge={<span className="text-[11px] text-text-muted">生成入口</span>}
      action={
        <Link
          href="/assessment"
          className="inline-flex min-h-[44px] items-center rounded-control border border-border-soft px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          评估
        </Link>
      }
    >
      <CockpitNotice
        tone="neutral"
        title="从真实输入生成报告"
        description="先完成学校评估或清单分析，再使用生成的分享链接查看报告。当前没有可查询的报告索引，因此不显示模拟历史记录。"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/assessment"
          className="inline-flex min-h-[44px] items-center rounded-control bg-cobalt/10 px-3 text-[11px] font-semibold text-cobalt transition hover:bg-cobalt/15"
        >
          AI 学校评估
        </Link>
        <Link
          href="/portfolio"
          className="inline-flex min-h-[44px] items-center rounded-control border border-border-soft px-3 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          清单分析
        </Link>
      </div>
    </CockpitPanel>
  );
}

// AdvisorLeadsCard — Phase 1.8 advisor-only entry into /admin/leads.
//
// Behavior:
//   - On mount, fetch GET /api/admin/leads/stats.
//   - 200 -> render a single workbench card linking to /admin/leads,
//     showing total lead count and the "new" (uncontacted) bucket.
//   - 401/403 (or any non-OK) -> render nothing. The /s/home page is
//     shared with students, so non-advisors must not see the link.
//   - DB not configured (503) -> also render nothing; the rest of the
//     page already handles missing-first surfaces.
//   - Skips fetch entirely on the server (no SSR fetch call needed).
//
// Why a dedicated component: HomeMode is already hot with data hooks
// (useUniversitySummaries, useNews, useMemo chains). Putting the CRM
// probe in a sibling component keeps HomeMode's hook count stable and
// satisfies the rules-of-hooks constraint this file calls out above.
function AdvisorLeadsCard() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; total: number; newCount: number }
    | { kind: "hidden" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetch("/api/admin/leads/stats", { signal: ac.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          // 401 (not signed in) / 403 (not advisor) / 503 (db off) —
          // in every case the right thing is to render nothing.
          if (!cancelled) setState({ kind: "hidden" });
          return;
        }
        const body = (await res.json()) as {
          ok?: boolean;
          total?: number;
          byStatus?: Record<string, number>;
        };
        if (cancelled) return;
        if (!body || body.ok !== true) {
          setState({ kind: "hidden" });
          return;
        }
        const newCount = body.byStatus?.new ?? 0;
        setState({ kind: "ready", total: body.total ?? 0, newCount });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "hidden" });
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (state.kind !== "ready") return null;

  return (
    <Link
      href="/admin/leads"
      className="group flex items-center justify-between gap-4 rounded-control border border-border-soft bg-surface-1 px-4 py-3 transition hover:border-cobalt/40 hover:bg-surface-muted"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-cobalt/10 text-cobalt">
          <Briefcase size={16} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">
            销售线索 CRM
          </p>
          <p className="mt-0.5 text-[12px] text-text-muted">
            管理订阅意向、跟进状态与转化记录。仅顾问/管理员可见。
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
            线索总数
          </p>
          <p className="text-lg font-semibold tabular-nums text-text-primary">
            {state.total}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
            待跟进
          </p>
          <p className="text-lg font-semibold tabular-nums text-cobalt">
            {state.newCount}
          </p>
        </div>
        <ArrowUpRight
          size={16}
          aria-hidden="true"
          className="text-text-muted transition group-hover:text-cobalt"
        />
      </div>
    </Link>
  );
}

function InformationCoverageCard({
  coverage,
}: {
  coverage?: WorkbenchFactCoverage;
}) {
  if (!coverage) return null;

  return (
    <CockpitPanel
      icon={<ShieldAlert size={16} aria-hidden="true" />}
      title="已审核事实覆盖"
      badge={
        coverage.status === "ready" ? (
          <span className="text-[11px] text-text-muted">
            {coverage.universities} 所学校 · {coverage.approvedFacts} 条事实
          </span>
        ) : null
      }
      action={
        <Link
          href="/costs"
          className="inline-flex min-h-[44px] items-center rounded-control border border-border-soft px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          成本
        </Link>
      }
    >
      {coverage.status === "unavailable" ? (
        <CockpitNotice
          tone="unavailable"
          title="已审核事实层暂不可用"
          description="当前不展示推测覆盖率，也不用预览数据补位。"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-control bg-surface-2/60 px-3 py-2">
              <p className="text-[10px] text-text-muted">截止日事实</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                {coverage.deadlineFacts}
              </p>
            </div>
            <div className="rounded-control bg-surface-2/60 px-3 py-2">
              <p className="text-[10px] text-text-muted">成本事实</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                {coverage.costFacts}
              </p>
            </div>
            <div className="rounded-control bg-surface-2/60 px-3 py-2">
              <p className="text-[10px] text-text-muted">显式缺失</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-persimmon">
                {coverage.missingFacts}
              </p>
            </div>
            <div className="rounded-control bg-surface-2/60 px-3 py-2">
              <p className="text-[10px] text-text-muted">最近变更</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                {coverage.recentChanges.length}
              </p>
            </div>
          </div>
          {coverage.recentChanges.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {coverage.recentChanges.slice(0, 2).map((change) => (
                <li
                  key={change.factId}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 truncate font-medium text-text-secondary">
                    {change.fieldKey}
                  </span>
                  <span className="shrink-0 text-text-muted">
                    {formatWorkbenchDate(change.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </CockpitPanel>
  );
}

function HomeMode({
  family,
  informationCoverage,
}: {
  family: Family;
  informationCoverage?: WorkbenchFactCoverage;
}) {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);
  const news = useNews(source);

  const schools = useReadyList(summaries.state);
  const articles = useReadyList(news.state);
  const programs = useMemo(() => groupPrograms(schools), [schools]);
  const guideCovered = useMemo(
    () => schools.filter((school) => previewOf(school) !== null).length,
    [schools],
  );

  const cards = family === "f" ? FAMILY_LINKS : STUDENT_LINKS;

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow={family === "f" ? "家庭决策工作台" : "学生数据工作台"}
        title={family === "f" ? "家庭端决策模块" : "学生工作台"}
        description={
          family === "f"
            ? "在现有 PathOS 之上新增的决策模块：政策动态、学校档案与 ROI 测算。所有数字来自已核验数据源，缺失即标注。"
            : "按截止风险、数据质量、清单、事件和报告组织今天要做的事。所有数字只来自已核验数据源，缺失即标注。"
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/workbench/shortlists"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-control bg-cobalt/10 px-3 text-xs font-semibold text-cobalt transition hover:bg-cobalt/15"
            >
              管理选校清单
            </Link>
            <Link
              href="/map"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-control border border-border-soft px-3 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              留学地图
              <ArrowUpRight size={13} />
            </Link>
          </div>
        }
      />

      {family === "s" ? (
        <section
          aria-label="学生工作台优先事项"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <div className="md:col-span-2 xl:col-span-1">
            <DeadlineRemindersCard />
          </div>
          <InformationCoverageCard coverage={informationCoverage} />
          <ShortlistsCard />
          <RecentEventsCard />
          <ReportsCard />
        </section>
      ) : null}

      {summaries.state.status === "loading" ? (
        <V2Panel className={family === "s" ? "mt-6" : ""}>
          <p className="text-xs font-medium text-text-secondary">
            正在读取院校索引…
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            优先事项面板不受院校索引影响，会分别显示自己的数据状态。
          </p>
        </V2Panel>
      ) : summaries.state.status === "error" ? (
        <Failure
          code={summaries.state.code}
          onRetry={() => summaries.reload()}
        />
      ) : schools.length === 0 ? (
        <DataEmptyState
          title="院校数据补充中"
          description="当前数据源没有返回任何院校记录。"
        />
      ) : (
        <>
          <div
            className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${
              family === "s" ? "mt-6" : ""
            }`}
          >
            <StatTile label="已收录院校" value={schools.length} />
            <StatTile label="覆盖专业" value={programs.length} />
            <StatTile label="指南已匹配" value={guideCovered} />
            <StatTile
              label="政策与资讯"
              value={
                news.state.status === "ready" ? articles.length : <V2Missing />
              }
            />
          </div>

          <h2 className="sr-only">决策工具</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <V2FeatureCard
                key={card.href}
                href={card.href}
                title={card.title}
                description={card.description}
                icon={card.icon}
              />
            ))}
          </div>

          {family === "f" && programs.length > 0 ? (
            <V2Panel className="mt-6">
              <SectionTitle>专业入口</SectionTitle>
              <p className="mt-1 text-xs text-text-muted">
                按已收录专业标签进入专业详情页，查看开设院校与真实录取数据。
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {programs.slice(0, 24).map((group) => (
                  <Link
                    key={group.slug}
                    href={majorHref(group.name, family)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-soft px-2.5 py-1 text-[11px] text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                  >
                    {group.name}
                    <span className="text-text-muted">
                      {group.schools.length}
                    </span>
                  </Link>
                ))}
              </div>
            </V2Panel>
          ) : null}

          <div className="mt-3">
            <AdvisorLeadsCard />
          </div>

          <SchoolIndex schools={schools} family={family} />
        </>
      )}
    </main>
  );
}

// ── Majors ───────────────────────────────────────────────────────────

function MajorsMode({ family }: { family: Family }) {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);
  const [query, setQuery] = useState("");

  const schools = useReadyList(summaries.state);
  const groups = useMemo(() => groupPrograms(schools), [schools]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="专业聚合"
        title="按专业查看院校分布"
        description="专业标签来自已收录院校的专业数据。每个专业下的院校数量与排名均为真实统计。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />

      {summaries.state.status === "loading" ? (
        <Loading message="正在读取专业数据…" />
      ) : summaries.state.status === "error" ? (
        <Failure
          code={summaries.state.code}
          onRetry={() => summaries.reload()}
        />
      ) : groups.length === 0 ? (
        <DataEmptyState
          title="专业数据补充中"
          description="当前数据源尚未提供院校专业标签。"
        />
      ) : (
        <>
          <label className="relative block max-w-md">
            <span className="sr-only">搜索专业</span>
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索专业名称"
              className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 pl-8 pr-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-cobalt/50"
            />
          </label>

          <p className="mt-4 text-xs text-text-muted">
            共 {groups.length} 个专业标签，当前显示 {filtered.length} 个。
          </p>

          {filtered.length === 0 ? (
            <div className="mt-4">
              <DataEmptyState
                title="没有匹配的专业"
                description="换个关键词再试。"
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((group) => (
                <V2Panel
                  key={group.slug}
                  className="flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold text-text-primary">
                        {group.name}
                      </h2>
                      <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                        {group.schools.length} 所
                      </span>
                    </div>
                    <div className="mt-3">
                      <SchoolChips schools={group.schools} family={family} />
                    </div>
                  </div>
                  <Link
                    href={majorHref(group.name, family)}
                    className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-cobalt"
                  >
                    查看开设院校
                    <ArrowUpRight size={12} />
                  </Link>
                </V2Panel>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function MajorDetailMode({ id, family }: { id: string; family: Family }) {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);

  const schools = useReadyList(summaries.state);
  const groups = useMemo(() => groupPrograms(schools), [schools]);
  const target = useMemo(() => {
    const wanted = slugify(id);
    if (!wanted) return null;
    return (
      groups.find((group) => group.slug === wanted) ??
      groups.find(
        (group) => group.name.toLowerCase() === id.trim().toLowerCase(),
      ) ??
      null
    );
  }, [groups, id]);

  const ranked = useMemo(
    () =>
      target ? [...target.schools].sort((a, b) => rankOf(a) - rankOf(b)) : [],
    [target],
  );

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="专业详情"
        title={target ? target.name : "专业详情"}
        description={
          target
            ? `${ranked.length} 所已收录院校在专业标签中包含「${target.name}」。下面的排名与费用均为这些院校的真实数据。`
            : "未在当前数据集中找到该专业标签。"
        }
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/majors"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回专业列表
          </Link>
        }
      />

      {summaries.state.status === "loading" ? (
        <Loading message="正在读取专业数据…" />
      ) : summaries.state.status === "error" ? (
        <Failure
          code={summaries.state.code}
          onRetry={() => summaries.reload()}
        />
      ) : !target || ranked.length === 0 ? (
        <DataEmptyState
          title="未找到该专业"
          description={
            <>
              标识 <span className="font-mono">{id}</span>{" "}
              当前不在专业标签集中。
            </>
          }
          action={
            <Link
              href={family === "f" ? "/f/home" : "/s/majors"}
              className="rounded-control border border-border-soft bg-surface-1 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              返回专业列表
            </Link>
          }
        />
      ) : (
        <>
          {/* Mobile: stacked cards so 390px viewports do not horizontally scroll.
              Desktop (>=md): the original wide table is shown. */}
          <div
            className="space-y-3 md:hidden"
            aria-label="院校列表（移动视图）"
          >
            {ranked.map((school) => {
              const preview = previewOf(school);
              return (
                <Link
                  key={school.id}
                  href={schoolHref(school, family)}
                  className="block rounded-card border border-border-soft bg-surface-1 p-3 transition hover:border-cobalt/40"
                >
                  <div className="font-medium text-text-primary">
                    {school.nameZh}
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-muted">
                    {school.city}, {school.state}
                  </div>
                  <ul
                    className="mt-2 space-y-1 text-[11px] text-text-secondary"
                    role="list"
                  >
                    <li className="flex items-baseline justify-between gap-3">
                      <span className="text-text-muted">全美排名</span>
                      <span className="font-medium text-text-primary">
                        {school.rankingSummary?.nationalRank ??
                          school.rankingSummary?.rankingLabel ?? (
                            <MissingValue />
                          )}
                      </span>
                    </li>
                    <li className="flex items-baseline justify-between gap-3">
                      <span className="text-text-muted">录取率</span>
                      <span className="font-medium text-text-primary">
                        {fmtPercent(preview?.acceptanceRatePercent) ? (
                          <span
                            data-counter={String(
                              preview?.acceptanceRatePercent ?? "",
                            )}
                          >
                            {fmtPercent(preview?.acceptanceRatePercent)}
                          </span>
                        ) : (
                          <MissingValue />
                        )}
                      </span>
                    </li>
                    <li className="flex items-baseline justify-between gap-3">
                      <span className="text-text-muted">学费参考</span>
                      <span className="font-medium text-text-primary">
                        {school.costSummary?.displayLabel ??
                          preview?.tuition?.total ?? <MissingValue />}
                      </span>
                    </li>
                    <li className="flex items-baseline justify-between gap-3">
                      <span className="text-text-muted">SAT 中位</span>
                      <span className="font-medium text-text-primary">
                        {preview?.midRangeScores?.satEbrw ?? <MissingValue />}
                      </span>
                    </li>
                  </ul>
                </Link>
              );
            })}
          </div>
          <div className="hidden overflow-hidden rounded-card border border-border-soft bg-surface-1 shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-surface-muted/50 text-[10px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">院校</th>
                    <th className="px-3 py-2 font-medium">全美排名</th>
                    <th className="px-3 py-2 font-medium">录取率</th>
                    <th className="px-3 py-2 font-medium">学费参考</th>
                    <th className="px-3 py-2 font-medium">SAT 中位线</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((school) => {
                    const preview = previewOf(school);
                    return (
                      <tr
                        key={school.id}
                        className="border-t border-border-soft/60"
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={schoolHref(school, family)}
                            className="font-medium text-text-primary hover:text-cobalt"
                          >
                            {school.nameZh}
                          </Link>
                          <span className="mt-0.5 block text-[10px] text-text-muted">
                            {school.city}, {school.state}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {school.rankingSummary?.nationalRank ??
                            school.rankingSummary?.rankingLabel ?? (
                              <MissingValue />
                            )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {fmtPercent(preview?.acceptanceRatePercent) ? (
                            <span
                              data-counter={String(
                                preview?.acceptanceRatePercent ?? "",
                              )}
                            >
                              {fmtPercent(preview?.acceptanceRatePercent)}
                            </span>
                          ) : (
                            <MissingValue />
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {school.costSummary?.displayLabel ??
                            preview?.tuition?.total ?? <MissingValue />}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {preview?.midRangeScores?.satEbrw ?? <MissingValue />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

// ── Compare ──────────────────────────────────────────────────────────

interface CompareRow {
  label: string;
  render: (school: UniversitySummary) => ReactNode;
}

const COMPARE_ROWS: CompareRow[] = [
  {
    label: "全美综合排名",
    render: (s) =>
      s.rankingSummary?.nationalRank ??
      s.rankingSummary?.rankingLabel ?? <MissingValue />,
  },
  {
    label: "US News 综合",
    render: (s) => previewOf(s)?.usNewsRanks?.overall || <MissingValue />,
  },
  {
    label: "本科录取率",
    render: (s) =>
      fmtPercent(previewOf(s)?.acceptanceRatePercent) ?? <MissingValue />,
  },
  {
    label: "SAT 阅读 EBRW",
    render: (s) => previewOf(s)?.midRangeScores?.satEbrw || <MissingValue />,
  },
  {
    label: "SAT 数学",
    render: (s) => previewOf(s)?.midRangeScores?.satMath || <MissingValue />,
  },
  {
    label: "ACT",
    render: (s) => previewOf(s)?.midRangeScores?.act || <MissingValue />,
  },
  {
    label: "高中 GPA 中位",
    render: (s) => previewOf(s)?.midRangeScores?.gpa || <MissingValue />,
  },
  {
    label: "学费合计",
    render: (s) =>
      previewOf(s)?.tuition?.total ||
      s.costSummary?.displayLabel || <MissingValue />,
  },
  {
    label: "学杂费",
    render: (s) => previewOf(s)?.tuition?.tuition || <MissingValue />,
  },
  {
    label: "食宿",
    render: (s) => previewOf(s)?.tuition?.housing || <MissingValue />,
  },
  {
    label: "师生比",
    render: (s) =>
      previewOf(s)?.studentFacultyRatio ??
      (typeof s.studentFacultyRatio === "number"
        ? String(s.studentFacultyRatio)
        : null) ?? <MissingValue />,
  },
  {
    label: "本科生人数",
    render: (s) =>
      fmtInt(previewOf(s)?.undergraduateStudents) ??
      fmtInt(s.enrollmentSummary?.undergraduate) ?? <MissingValue />,
  },
  {
    label: "4 年毕业率",
    render: (s) => previewOf(s)?.graduationRate4Yr || <MissingValue />,
  },
  {
    label: "新生保留率",
    render: (s) => previewOf(s)?.freshmanRetentionRate || <MissingValue />,
  },
  {
    label: "学制",
    render: (s) => previewOf(s)?.academicSystem || <MissingValue />,
  },
];

function CompareMode({ family }: { family: Family }) {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pick, setPick] = useState("");

  const schools = useReadyList(summaries.state);
  const sorted = useMemo(
    () => [...schools].sort((a, b) => rankOf(a) - rankOf(b)),
    [schools],
  );
  const chosen = useMemo(
    () =>
      selectedIds
        .map((id) => schools.find((school) => school.id === id))
        .filter((school): school is UniversitySummary => Boolean(school)),
    [selectedIds, schools],
  );

  const available = sorted.filter((school) => !selectedIds.includes(school.id));

  function addSchool() {
    if (!pick) return;
    setSelectedIds((prev) =>
      prev.includes(pick) || prev.length >= 4 ? prev : [...prev, pick],
    );
    setPick("");
  }

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="学校对比"
        title="并排比较真实录取与费用数据"
        description="最多同时对比 4 所院校。所有单元格直接读取数据源；来源未提供的字段标注为「暂无」，不做估算。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />

      {summaries.state.status === "loading" ? (
        <Loading message="正在读取院校数据…" />
      ) : summaries.state.status === "error" ? (
        <Failure
          code={summaries.state.code}
          onRetry={() => summaries.reload()}
        />
      ) : sorted.length === 0 ? (
        <DataEmptyState
          title="院校数据补充中"
          description="当前数据源没有返回院校记录。"
        />
      ) : (
        <>
          <V2Panel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="mb-1 block text-[11px] text-text-muted">
                  选择院校
                </span>
                <select
                  value={pick}
                  onChange={(event) => setPick(event.target.value)}
                  className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2.5 text-xs text-text-primary outline-none focus:border-cobalt/50"
                >
                  <option value="">请选择…</option>
                  {available.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.nameZh} · {school.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addSchool}
                disabled={!pick || chosen.length >= 4}
                className="h-control rounded-control bg-cobalt px-4 text-xs font-medium text-white transition hover:bg-cobalt/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                加入对比
              </button>
              {chosen.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="h-control rounded-control border border-border-soft px-3 text-xs text-text-secondary transition hover:border-danger/40 hover:text-danger"
                >
                  清空
                </button>
              ) : null}
            </div>
            {chosen.length >= 4 ? (
              <p className="mt-2 text-[11px] text-persimmon">
                最多同时对比 4 所院校。
              </p>
            ) : null}
          </V2Panel>

          {chosen.length === 0 ? (
            <div className="mt-6">
              <DataEmptyState
                title="还没有选择院校"
                description="从上方下拉框选择院校加入对比，最多 4 所。"
              />
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-card border border-border-soft bg-surface-1 shadow-sm">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-surface-muted/50">
                  <tr>
                    <th className="w-40 px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                      指标
                    </th>
                    {chosen.map((school) => (
                      <th key={school.id} className="px-3 py-2.5 align-top">
                        <div className="flex items-start justify-between gap-2">
                          <span>
                            <Link
                              href={schoolHref(school, family)}
                              className="block text-xs font-semibold text-text-primary hover:text-cobalt"
                            >
                              {school.nameZh}
                            </Link>
                            <span className="mt-0.5 block text-[10px] font-normal text-text-muted">
                              {school.name}
                            </span>
                          </span>
                          <button
                            type="button"
                            aria-label={`移除 ${school.nameZh}`}
                            onClick={() =>
                              setSelectedIds((prev) =>
                                prev.filter((id) => id !== school.id),
                              )
                            }
                            className="shrink-0 rounded px-1 text-[11px] text-text-muted transition hover:text-danger"
                          >
                            ×
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr
                      key={row.label}
                      className="border-t border-border-soft/60"
                    >
                      <th className="px-3 py-2 text-left text-[11px] font-normal text-text-muted">
                        {row.label}
                      </th>
                      {chosen.map((school) => (
                        <td
                          key={school.id}
                          className="px-3 py-2 text-text-secondary"
                        >
                          {row.render(school)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-border-soft/60">
                    <th className="px-3 py-2 text-left text-[11px] font-normal text-text-muted">
                      数据来源
                    </th>
                    {chosen.map((school) => (
                      <td key={school.id} className="px-3 py-2">
                        <V2Provenance
                          source={
                            previewOf(school)
                              ? "IECG 院校指南"
                              : "PathOS 预览数据"
                          }
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ── Time series ──────────────────────────────────────────────────────

const METRIC_LABELS: Array<{ key: TimeSeriesMetric; label: string }> = [
  { key: "acceptanceRate", label: "录取率" },
  { key: "sat", label: "SAT" },
  { key: "gpa", label: "GPA" },
  { key: "tuitionUSD", label: "总成本" },
];

function TimeSeriesMode({ family }: { family: Family }) {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);
  const [schoolId, setSchoolId] = useState("");
  const [metric, setMetric] = useState<TimeSeriesMetric>("acceptanceRate");

  const schools = useReadyList(summaries.state);
  const sorted = useMemo(
    () => [...schools].sort((a, b) => rankOf(a) - rankOf(b)),
    [schools],
  );
  // Pre-select the top-ranked school so the chart renders something on
  // first paint instead of staring at an empty placeholder. The user can
  // still override the selection; we just give them a starting view.
  useEffect(() => {
    if (!schoolId && sorted.length > 0) setSchoolId(sorted[0].id);
  }, [schoolId, sorted]);
  const detail = useUniversityDetail(source, schoolId || null);
  const school = sorted.find((item) => item.id === schoolId) ?? null;

  const series =
    detail.state.status === "ready"
      ? (detail.state.data?.timeSeries ?? [])
      : [];
  const preview = previewOf(school);

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="录取率与成本时序"
        title="查看已核验的逐年变化"
        description="选择一所院校查看其公开的时序数据。数据源未发布序列时，这里会明确标注，而不是补一条趋势线。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />

      {summaries.state.status === "loading" ? (
        <Loading message="正在读取院校数据…" />
      ) : summaries.state.status === "error" ? (
        <Failure
          code={summaries.state.code}
          onRetry={() => summaries.reload()}
        />
      ) : sorted.length === 0 ? (
        <DataEmptyState
          title="院校数据补充中"
          description="当前数据源没有返回院校记录。"
        />
      ) : (
        <>
          <V2Panel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="mb-1 block text-[11px] text-text-muted">
                  院校
                </span>
                <select
                  value={schoolId}
                  onChange={(event) => setSchoolId(event.target.value)}
                  className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2.5 text-xs text-text-primary outline-none focus:border-cobalt/50"
                >
                  <option value="">请选择院校…</option>
                  {sorted.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameZh} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-1.5">
                {METRIC_LABELS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMetric(item.key)}
                    className={`h-control rounded-control border px-3 text-xs transition ${
                      metric === item.key
                        ? "border-cobalt/50 bg-cobalt/10 text-cobalt"
                        : "border-border-soft text-text-secondary hover:border-cobalt/30"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </V2Panel>

          {!schoolId ? (
            <div className="mt-6">
              <DataEmptyState
                title="正在拉取默认院校"
                description="选择后即可查看该校已核验的时序数据。"
              />
            </div>
          ) : detail.state.status === "loading" ? (
            <div className="mt-6">
              <Loading message="正在读取该校时序数据…" />
            </div>
          ) : detail.state.status === "error" ? (
            <div className="mt-6">
              <Failure
                code={detail.state.code}
                onRetry={() => detail.reload()}
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr,1fr]">
              <V2Panel>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <SectionTitle>{school?.nameZh ?? "院校"} · 时序</SectionTitle>
                  <Link
                    href={school ? `/university/${school.id}` : "/map"}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-cobalt"
                  >
                    完整档案
                    <ArrowUpRight size={12} />
                  </Link>
                </div>
                <V2TrendChart
                  data={series}
                  metric={metric}
                  height={230}
                  events={[]}
                />
              </V2Panel>

              <div className="space-y-4">
                <V2Panel>
                  <SectionTitle>该校当前快照</SectionTitle>
                  <div className="mt-3 space-y-0.5">
                    <DefRow label="本科录取率">
                      {fmtPercent(preview?.acceptanceRatePercent) ? (
                        <span
                          data-counter={String(
                            preview?.acceptanceRatePercent ?? "",
                          )}
                        >
                          {fmtPercent(preview?.acceptanceRatePercent)}
                        </span>
                      ) : (
                        <MissingValue />
                      )}
                    </DefRow>
                    <DefRow label="SAT 阅读 EBRW">
                      {preview?.midRangeScores?.satEbrw ? (
                        <span
                          data-counter={String(preview.midRangeScores.satEbrw)}
                        >
                          {preview.midRangeScores.satEbrw}
                        </span>
                      ) : (
                        <MissingValue />
                      )}
                    </DefRow>
                    <DefRow label="SAT 数学">
                      {preview?.midRangeScores?.satMath ? (
                        <span
                          data-counter={String(preview.midRangeScores.satMath)}
                        >
                          {preview.midRangeScores.satMath}
                        </span>
                      ) : (
                        <MissingValue />
                      )}
                    </DefRow>
                    <DefRow label="ACT">
                      {preview?.midRangeScores?.act ? (
                        <span data-counter={String(preview.midRangeScores.act)}>
                          {preview.midRangeScores.act}
                        </span>
                      ) : (
                        <MissingValue />
                      )}
                    </DefRow>
                    <DefRow label="高中 GPA 中位">
                      {preview?.midRangeScores?.gpa ? (
                        <span data-counter={String(preview.midRangeScores.gpa)}>
                          {preview.midRangeScores.gpa}
                        </span>
                      ) : (
                        <MissingValue />
                      )}
                    </DefRow>
                    <DefRow label="学费合计">
                      {preview?.tuition?.total || <MissingValue />}
                    </DefRow>
                  </div>
                </V2Panel>

                <V2SourceCard
                  title="时序数据出处"
                  source={
                    detail.state.status === "ready" && detail.state.data
                      ? "PathOS 院校数据源"
                      : "来源待挂接"
                  }
                  detail="时序序列由院校数据源直接提供。若该校尚未发布序列，图表会保持空态，不使用估算值填补。"
                  href={preview?.officialWebsite}
                />
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ── News radar / policy ──────────────────────────────────────────────

const NEWS_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "all", label: "全部" },
  { key: "admissions", label: "招生" },
  { key: "policy", label: "政策" },
  { key: "visa", label: "签证" },
  { key: "ranking", label: "排名" },
  { key: "career", label: "就业" },
  { key: "life", label: "生活" },
];

function NewsCard({ article }: { article: NewsArticle }) {
  const summary = cleanText(article.summary);
  const date = formatDate(article.publishedAt);
  return (
    <V2Panel className="flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-text-secondary">
            {NEWS_CATEGORIES.find((item) => item.key === article.category)
              ?.label ?? article.category}
          </span>
          <span>{article.source}</span>
          {date ? <span>{date}</span> : null}
        </div>
        <h2 className="mt-2 text-sm font-semibold leading-5 text-text-primary">
          {article.title}
        </h2>
        {summary ? (
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            {summary}
          </p>
        ) : (
          <p className="mt-2 text-xs text-text-muted">
            <V2Missing text="暂无摘要" />
          </p>
        )}
        {article.whatChanged ? (
          <div className="mt-3 rounded-control border border-border-soft bg-surface-muted/30 p-2.5">
            <p className="text-[10px] font-medium text-text-muted">变化</p>
            <p className="mt-0.5 text-[11px] leading-5 text-text-secondary">
              {article.whatChanged}
            </p>
            {article.whyItMatters ? (
              <>
                <p className="mt-2 text-[10px] font-medium text-text-muted">
                  影响
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-text-secondary">
                  {article.whyItMatters}
                </p>
              </>
            ) : null}
            {article.actionSteps && article.actionSteps.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {article.actionSteps.map((step) => (
                  <li
                    key={step}
                    className="flex items-start gap-1.5 text-[11px] leading-5 text-text-secondary"
                  >
                    <ListChecks
                      size={12}
                      className="mt-0.5 shrink-0 text-jade"
                    />
                    {step}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {article.url ? (
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-cobalt"
        >
          查看原文
          <ExternalLink size={12} />
        </a>
      ) : null}
    </V2Panel>
  );
}

function NewProgramsRollup() {
  const source = useDataSource();
  const news = useNews(source);
  const articles = useReadyList(news.state);
  const top = useMemo(
    () =>
      [...articles]
        .sort((a, b) =>
          a.publishedAt < b.publishedAt
            ? 1
            : a.publishedAt > b.publishedAt
              ? -1
              : 0,
        )
        .slice(0, 6),
    [articles],
  );
  if (news.state.status !== "ready") return null;
  if (top.length === 0) return null;
  return (
    <V2Panel data-reveal="true">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
            COVERAGE / PATHOS
          </p>
          <h3 className="mt-1 text-lg font-semibold text-text-primary">
            最近资讯动态
          </h3>
        </div>
        <p className="text-xs text-text-secondary">
          按发布时间倒序排序，选取最近 <span data-counter="6">6</span> 条入口
        </p>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {top.map((article) => (
          <li
            key={article.id}
            className="flex items-start justify-between gap-3 rounded-control border border-border-soft bg-surface-1 px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium leading-5 text-text-primary">
                {article.title}
              </p>
              <p className="mt-1 text-[10px] text-text-muted">
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 font-medium text-text-secondary">
                  {article.category}
                </span>
                <span className="ml-1.5">{article.source}</span>
                <span className="ml-1.5">
                  {article.publishedAt?.substring(0, 10)}
                </span>
              </p>
            </div>
            <Link
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cobalt/10 text-cobalt transition hover:bg-cobalt/20"
              aria-label={"查看原文"}
            >
              <ArrowUpRight size={11} />
            </Link>
          </li>
        ))}
      </ul>
    </V2Panel>
  );
}

function NewsMode({
  variant,
  family,
}: {
  variant: "radar" | "policy" | "newPrograms";
  family: Family;
}) {
  const source = useDataSource();
  const news = useNews(source);
  const [category, setCategory] = useState<string>("all");

  const articles = useReadyList(news.state);
  const filtered = useMemo(
    () =>
      category === "all"
        ? articles
        : articles.filter((item) => item.category === category),
    [articles, category],
  );

  const isPolicy = variant === "policy";

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow={isPolicy ? "政策与招生动态" : "新专业 / 项目雷达"}
        title={isPolicy ? "政策、签证与申请变更" : "监测新增专业与项目变化"}
        description={
          isPolicy
            ? "全部条目直接来自数据源的资讯流，保留原始来源与发布时间。PathOS 不生成或改写政策结论。"
            : "已收录院校的项目覆盖与近期资讯汇聚在同一视图。点击跳转到院校档案查看明细项目。"
        }
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />

      {news.state.status === "loading" ? (
        <Loading message="正在读取资讯…" />
      ) : news.state.status === "error" ? (
        <Failure code={news.state.code} onRetry={() => news.reload()} />
      ) : articles.length === 0 ? (
        <DataEmptyState
          title="资讯数据补充中"
          description="当前数据源没有返回资讯条目。"
        />
      ) : (
        <>
          {!isPolicy && <NewProgramsRollup />}
          <div className="flex flex-wrap gap-1.5">
            {NEWS_CATEGORIES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setCategory(item.key)}
                className={`h-control rounded-control border px-3 text-xs transition ${
                  category === item.key
                    ? "border-cobalt/50 bg-cobalt/10 text-cobalt"
                    : "border-border-soft text-text-secondary hover:border-cobalt/30"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-text-muted">
            共{" "}
            <span
              data-counter={String(articles.length)}
              data-counter-format="locale"
            >
              {articles.length}
            </span>{" "}
            条，当前显示{" "}
            <span
              data-counter={String(filtered.length)}
              data-counter-format="locale"
            >
              {filtered.length}
            </span>{" "}
            条。
          </p>

          {filtered.length === 0 ? (
            <div className="mt-4">
              <DataEmptyState
                title="该分类暂无条目"
                description="切换到其他分类查看。"
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((article) => (
                <NewsCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ── Cases ────────────────────────────────────────────────────────────

const CASE_FIELD_SPEC: Array<[string, string]> = [
  ["fromSchool", "本科院校"],
  ["toSchool", "录取院校"],
  ["major", "申请专业"],
  ["gpa", "本科 GPA"],
  ["sat", "SAT"],
  ["toefl", "TOEFL"],
  ["essayExcerpt", "文书节选"],
  ["admissionYear", "录取年份"],
  ["source", "来源"],
  ["asOf", "数据时间"],
  ["verifiedBy", "核验人"],
];

function CasesMode({ family }: { family: Family }) {
  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="录取案例库"
        title="真实背景与录取结果对照"
        description="案例库需要申请者授权的真实录取记录，当前数据源尚未提供该接口。这里不展示任何示例或占位数据。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />

      <DataEmptyState
        title="案例数据接口尚未接入"
        description={
          <>
            案例库目前没有可读取的数据源。接口上线后，每条记录都会附带来源、时间与核验人；
            未核验的记录不会展示。
          </>
        }
      />

      <V2Panel className="mt-6">
        <SectionTitle>字段说明</SectionTitle>
        <p className="mt-1 text-xs text-text-muted">
          每条案例记录将包含以下字段。缺字段以「暂无」展示，不使用推测值。
        </p>
        <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
          {CASE_FIELD_SPEC.map(([field, label]) => (
            <DefRow key={field} label={label}>
              <span className="font-mono text-[11px] text-text-muted">
                {field}
              </span>
            </DefRow>
          ))}
        </div>
      </V2Panel>

      <V2Panel className="mt-6">
        <div className="flex items-start gap-2">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-persimmon" />
          <div>
            <SectionTitle>为什么这里是空的</SectionTitle>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              PathOS
              的展示原则是：宁可标注缺失，也不填充演示数据。案例库涉及真实申请者背景，
              必须在获得授权并完成来源核验后才会出现在这里。
            </p>
          </div>
        </div>
      </V2Panel>
    </main>
  );
}

function CaseDetailMode({ id, family }: { id: string; family: Family }) {
  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="案例详情"
        title="案例数据接口尚未接入"
        description="该案例编号当前没有可读取的数据源。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/cases"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回案例列表
          </Link>
        }
      />
      <DataEmptyState
        title="未找到该案例"
        description={
          <>
            编号 <span className="font-mono">{id}</span> 当前不在数据集中。
          </>
        }
      />
    </main>
  );
}

// ── School workbench ─────────────────────────────────────────────────

function SchoolMode({ slug, family }: { slug: string; family: Family }) {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);

  const schools = useReadyList(summaries.state);
  const school = useMemo(() => matchSchool(schools, slug), [schools, slug]);
  const detail = useUniversityDetail(source, school?.id ?? null);
  const guide = useCollegeGuide(source, school?.id ?? null);

  const preview = previewOf(school);
  const guideRecord: CollegeGuide | null =
    guide.state.status === "ready" ? guide.state.data : null;
  const timeSeries =
    detail.state.status === "ready"
      ? (detail.state.data?.timeSeries ?? [])
      : [];

  const sources =
    detail.state.status === "ready" ? (detail.state.data?.sources ?? []) : [];

  // `coveragePercent: 0` in the preview source means "review not completed"
  // (it is paired with the `source_review_not_completed` warning), not "0%
  // reliable". Surface it as unverified rather than printing a misleading zero.
  const coverage = school?.qualitySummary?.coveragePercent;
  const reviewPending =
    school?.qualitySummary?.warningCodes?.includes(
      "source_review_not_completed",
    ) ?? false;
  const verifiedConfidence =
    typeof coverage === "number" && coverage > 0 && !reviewPending
      ? coverage
      : undefined;

  return (
    <main className={PAGE}>
      {summaries.state.status === "loading" ? (
        <Loading message="正在读取院校数据…" />
      ) : summaries.state.status === "error" ? (
        <Failure
          code={summaries.state.code}
          onRetry={() => summaries.reload()}
        />
      ) : !school ? (
        <DataEmptyState
          title="未找到该学校"
          description={
            <>
              标识 <span className="font-mono">{slug}</span> 当前不在数据集中。
            </>
          }
          action={
            <Link
              href={family === "f" ? "/f/home" : "/s/home"}
              className="rounded-control border border-border-soft bg-surface-1 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              返回工作台
            </Link>
          }
        />
      ) : (
        <>
          <header className="border-b border-border-soft pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-label font-semibold uppercase tracking-[0.14em] text-cobalt">
                  学校档案
                </p>
                <h1
                  className="mt-1 text-page text-text-primary"
                  data-heading-stagger="true"
                >
                  {school.nameZh}
                </h1>
                <p className="mt-0.5 text-sm text-text-secondary" lang="en">
                  {school.name}
                </p>
                <p className="mt-1.5 text-xs text-text-muted">
                  {school.city}, {school.state} · {school.country}
                  {school.rankingSummary?.rankingLabel ? (
                    <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                      {school.rankingSummary.rankingLabel}
                    </span>
                  ) : null}
                </p>
                <div className="mt-3">
                  <V2Provenance
                    source={
                      guideRecord
                        ? `IECG 快照 ${guideRecord.sourceSnapshotYear} · ${guideRecord.sourceFile}`
                        : "PathOS 预览数据"
                    }
                    confidence={verifiedConfidence}
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={`/university/${school.id}`}
                  className="inline-flex items-center gap-1.5 rounded-control bg-cobalt px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cobalt/90"
                >
                  <GraduationCap size={13} />
                  学校完整档案
                </Link>
                <Link
                  href={`/s/timeseries`}
                  className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                >
                  <LineChart size={13} />
                  时序数据
                </Link>
                <Link
                  href={`/s/compare`}
                  className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                >
                  <Scale size={13} />
                  加入对比
                </Link>
              </div>
            </div>
          </header>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric
              label="本科录取率"
              value={
                fmtPercent(preview?.acceptanceRatePercent) ? (
                  <span
                    data-counter={String(preview?.acceptanceRatePercent ?? "")}
                  >
                    {fmtPercent(preview?.acceptanceRatePercent)}
                  </span>
                ) : (
                  <MissingValue />
                )
              }
            />
            <Metric
              label="SAT 阅读 EBRW"
              value={
                preview?.midRangeScores?.satEbrw ? (
                  <span data-counter={String(preview.midRangeScores.satEbrw)}>
                    {preview.midRangeScores.satEbrw}
                  </span>
                ) : (
                  <MissingValue />
                )
              }
            />
            <Metric
              label="SAT 数学"
              value={
                preview?.midRangeScores?.satMath ? (
                  <span data-counter={String(preview.midRangeScores.satMath)}>
                    {preview.midRangeScores.satMath}
                  </span>
                ) : (
                  <MissingValue />
                )
              }
            />
            <Metric
              label="ACT"
              value={
                preview?.midRangeScores?.act ? (
                  <span data-counter={String(preview.midRangeScores.act)}>
                    {preview.midRangeScores.act}
                  </span>
                ) : (
                  <MissingValue />
                )
              }
            />
            <Metric
              label="高中 GPA 中位"
              value={
                preview?.midRangeScores?.gpa ? (
                  <span data-counter={String(preview.midRangeScores.gpa)}>
                    {preview.midRangeScores.gpa}
                  </span>
                ) : (
                  <MissingValue />
                )
              }
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
            <div className="space-y-6">
              <V2Panel>
                <SectionTitle>费用与规模</SectionTitle>
                <div className="mt-3 space-y-0.5">
                  <DefRow label="学费合计">
                    {preview?.tuition?.total ||
                      school.costSummary?.displayLabel || <MissingValue />}
                  </DefRow>
                  <DefRow label="学杂费">
                    {preview?.tuition?.tuition || <MissingValue />}
                  </DefRow>
                  <DefRow label="食宿">
                    {preview?.tuition?.housing || <MissingValue />}
                  </DefRow>
                  <DefRow label="本科生人数">
                    {fmtInt(preview?.undergraduateStudents) ??
                      fmtInt(school.enrollmentSummary?.undergraduate) ?? (
                        <MissingValue />
                      )}
                  </DefRow>
                  <DefRow label="研究生人数">
                    {fmtInt(preview?.graduateStudents) ?? <MissingValue />}
                  </DefRow>
                  <DefRow label="师生比">
                    {preview?.studentFacultyRatio ??
                      (typeof school.studentFacultyRatio === "number"
                        ? String(school.studentFacultyRatio)
                        : null) ?? <MissingValue />}
                  </DefRow>
                  <DefRow label="4 年毕业率">
                    {preview?.graduationRate4Yr || <MissingValue />}
                  </DefRow>
                  <DefRow label="6 年毕业率">
                    {preview?.graduationRate6Yr || <MissingValue />}
                  </DefRow>
                  <DefRow label="新生保留率">
                    {preview?.freshmanRetentionRate || <MissingValue />}
                  </DefRow>
                  <DefRow label="班级规模">
                    {preview?.classSize ? (
                      `少于20人 ${preview.classSize.under20} · 少于50人 ${preview.classSize.under50} · 多于50人 ${preview.classSize.over50}`
                    ) : (
                      <MissingValue />
                    )}
                  </DefRow>
                </div>
              </V2Panel>

              <V2Panel>
                <SectionTitle>招生要求</SectionTitle>
                <div className="mt-3 space-y-0.5">
                  <DefRow label="标化政策">
                    {preview?.testPolicy || <MissingValue />}
                  </DefRow>
                  <DefRow label="申请截止日">
                    {preview?.applicationDeadlines || <MissingValue />}
                  </DefRow>
                  <DefRow label="基本要求">
                    {preview?.applicationRequirements || <MissingValue />}
                  </DefRow>
                  <DefRow label="录取考量">
                    {preview?.selectionFactors || <MissingValue />}
                  </DefRow>
                </div>
              </V2Panel>

              <V2Panel>
                <SectionTitle>专业标签</SectionTitle>
                <p className="mt-1 text-xs text-text-muted">
                  来自已收录院校的专业数据，点击进入专业详情。
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(school.topPrograms ?? []).length === 0 ? (
                    <MissingValue />
                  ) : (
                    (school.topPrograms ?? []).map((program) => (
                      <Link
                        key={program}
                        href={majorHref(program, family)}
                        className="inline-flex items-center gap-1 rounded-full border border-border-soft px-2.5 py-1 text-[11px] text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                      >
                        {program}
                      </Link>
                    ))
                  )}
                </div>
                {preview?.strongPrograms ? (
                  <p className="mt-3 text-xs leading-5 text-text-secondary">
                    <span className="text-text-muted">优势专业：</span>
                    {preview.strongPrograms}
                  </p>
                ) : null}
              </V2Panel>

              <V2Panel>
                <div className="flex items-center justify-between gap-2">
                  <SectionTitle>录取率与成本时序</SectionTitle>
                  <LineChart size={15} className="text-cobalt" />
                </div>
                <div className="mt-3">
                  <V2TrendChart
                    data={timeSeries}
                    metric="acceptanceRate"
                    height={200}
                  />
                </div>
              </V2Panel>
            </div>

            <div className="space-y-6">
              <V2Panel>
                <SectionTitle>排名</SectionTitle>
                <div className="mt-3 space-y-0.5">
                  <DefRow label="US News 综合">
                    {preview?.usNewsRanks?.overall || <MissingValue />}
                  </DefRow>
                  <DefRow label="计算机">
                    {preview?.usNewsRanks?.cs || <MissingValue />}
                  </DefRow>
                  <DefRow label="工程">
                    {preview?.usNewsRanks?.engineering || <MissingValue />}
                  </DefRow>
                  <DefRow label="最佳教学">
                    {preview?.usNewsRanks?.bestTeaching || <MissingValue />}
                  </DefRow>
                  <DefRow label="最具价值">
                    {preview?.usNewsRanks?.bestValue || <MissingValue />}
                  </DefRow>
                  <DefRow label="最具创新">
                    {preview?.usNewsRanks?.mostInnovative || <MissingValue />}
                  </DefRow>
                </div>
              </V2Panel>

              <V2Panel>
                <SectionTitle>学术特色</SectionTitle>
                <div className="mt-3 space-y-0.5">
                  <DefRow label="建校时间">
                    {preview?.founded || <MissingValue />}
                  </DefRow>
                  <DefRow label="学校性质">
                    {preview?.schoolType || <MissingValue />}
                  </DefRow>
                  <DefRow label="学制">
                    {preview?.academicSystem || <MissingValue />}
                  </DefRow>
                  <DefRow label="校园规模">
                    {preview?.campusSize || <MissingValue />}
                  </DefRow>
                  <DefRow label="气候">
                    {preview?.climate || <MissingValue />}
                  </DefRow>
                  <DefRow label="课程体系">
                    {preview?.curriculumSummary || <MissingValue />}
                  </DefRow>
                  <DefRow label="学术氛围">
                    {preview?.academicCulture || <MissingValue />}
                  </DefRow>
                  <DefRow label="学生反馈">
                    {preview?.studentFeedbackSnippet || <MissingValue />}
                  </DefRow>
                </div>
              </V2Panel>

              {guideRecord && guideRecord.sections.length > 0 ? (
                <V2Panel>
                  <SectionTitle>院校指南目录</SectionTitle>
                  <ul className="mt-3 space-y-1.5">
                    {guideRecord.sections.slice(0, 12).map((section) => (
                      <li key={section.id}>
                        <Link
                          href={`/s/topic/${schoolSlug(school)}/${slugify(section.title)}`}
                          className="flex items-center justify-between gap-2 rounded-control px-2 py-1.5 text-xs text-text-secondary transition hover:bg-surface-muted/40 hover:text-cobalt"
                        >
                          <span className="truncate">{section.title}</span>
                          <ArrowUpRight size={12} className="shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </V2Panel>
              ) : null}

              <V2SourceCard
                title="数据出处"
                source={
                  guideRecord
                    ? `IECG · ${guideRecord.sourceFile}`
                    : "PathOS 预览数据"
                }
                detail={
                  guideRecord
                    ? `院校指南快照年份 ${guideRecord.sourceSnapshotYear}。字段缺失时以「暂无」展示，不做估算。`
                    : "该校尚未匹配到 IECG 院校指南，仅展示预览数据集字段。"
                }
                href={preview?.officialWebsite ?? guideRecord?.sourceUrl}
              />

              {sources.length > 0 ? (
                <V2Panel>
                  <SectionTitle>原始来源</SectionTitle>
                  <ul className="mt-3 space-y-1.5">
                    {sources.slice(0, 8).map((src) => (
                      <li key={src.url}>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-[11px] text-cobalt"
                        >
                          <ExternalLink size={11} className="shrink-0" />
                          <span className="truncate">{src.url}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </V2Panel>
              ) : null}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

// ── Topic (school × guide section) ───────────────────────────────────

function TopicMode({ slug }: { slug: string }) {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);
  const [schoolPart, articlePart] = slug.split("/");
  const requestedArticle = (articlePart ?? "").trim();

  const schools = useReadyList(summaries.state);
  const school = useMemo(
    () => matchSchool(schools, schoolPart ?? ""),
    [schools, schoolPart],
  );
  const guide = useCollegeGuide(source, school?.id ?? null);
  const guideRecord = guide.state.status === "ready" ? guide.state.data : null;

  const sections = useMemo(() => guideRecord?.sections ?? [], [guideRecord]);
  const matched = useMemo(() => {
    if (!requestedArticle) return null;
    const wanted = slugify(requestedArticle);
    return (
      sections.find((section) => slugify(section.title) === wanted) ??
      sections.find((section) => section.id === requestedArticle) ??
      null
    );
  }, [sections, requestedArticle]);

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="专题"
        title={
          matched
            ? matched.title
            : school
              ? `${school.nameZh} · 院校指南`
              : "院校专题"
        }
        description={
          school
            ? `${school.nameZh}（${school.name}）的指南内容，原文来自 IECG 院校文档。`
            : "未找到对应的院校。"
        }
        action={
          school ? (
            <Link
              href={schoolHref(school, "s")}
              className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              <ArrowLeft size={13} />
              返回学校档案
            </Link>
          ) : (
            <Link
              href="/s/home"
              className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              <ArrowLeft size={13} />
              返回工作台
            </Link>
          )
        }
      />

      {summaries.state.status === "loading" ? (
        <Loading message="正在读取院校数据…" />
      ) : summaries.state.status === "error" ? (
        <Failure
          code={summaries.state.code}
          onRetry={() => summaries.reload()}
        />
      ) : !school ? (
        <DataEmptyState
          title="未找到该学校"
          description={
            <>
              标识 <span className="font-mono">{schoolPart}</span>{" "}
              当前不在数据集中。
            </>
          }
        />
      ) : guide.state.status === "loading" ? (
        <Loading message="正在读取院校指南…" />
      ) : sections.length === 0 ? (
        <DataEmptyState
          title="该校暂无指南内容"
          description="当前数据源没有为该校提供 IECG 院校指南。"
        />
      ) : matched ? (
        <>
          <V2Panel>
            <p className="whitespace-pre-wrap text-sm leading-7 text-text-secondary">
              {matched.text}
            </p>
          </V2Panel>
          <V2SourceCard
            title="内容出处"
            source={
              guideRecord ? `IECG · ${guideRecord.sourceFile}` : "来源待挂接"
            }
            detail={`快照年份 ${guideRecord?.sourceSnapshotYear ?? "暂无"}。原文未做改写。`}
            href={guideRecord?.sourceUrl}
          />
        </>
      ) : (
        <V2Panel>
          <SectionTitle>指南目录</SectionTitle>
          <p className="mt-1 text-xs text-text-muted">
            未找到「{requestedArticle}」这一节，以下是该校指南的全部章节。
          </p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}>
                <Link
                  href={`/s/topic/${schoolSlug(school)}/${slugify(section.title)}`}
                  className="flex items-center justify-between gap-2 rounded-control border border-border-soft px-3 py-2 text-xs text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                >
                  <span className="truncate">{section.title}</span>
                  <ArrowUpRight size={12} className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </V2Panel>
      )}
    </main>
  );
}

// ── GPA calculator ───────────────────────────────────────────────────

const GPA_SAMPLE_SCORES = [95, 90, 85, 82, 78, 75, 70, 65, 60];

function GpaMode({ family }: { family: Family }) {
  const [courses, setCourses] = useState<GPACourse[]>([
    { name: "微积分 I", score: 88, credits: 4 },
    { name: "大学英语", score: 92, credits: 2 },
    { name: "计算机导论", score: 79, credits: 3 },
  ]);

  const usable = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.credits > 0 &&
          Number.isFinite(course.score) &&
          course.score > 0,
      ),
    [courses],
  );

  const results = useMemo(
    () =>
      (Object.keys(GPA_ALGORITHMS) as GPAAlgorithm[]).map((key) => ({
        key,
        name: GPA_ALGORITHMS[key].name,
        value: usable.length > 0 ? calculateGPA(courses, key) : null,
      })),
    [courses, usable.length],
  );

  const totalCredits = usable.reduce((sum, course) => sum + course.credits, 0);

  function updateCourse(index: number, patch: Partial<GPACourse>) {
    setCourses((prev) =>
      prev.map((course, i) => (i === index ? { ...course, ...patch } : course)),
    );
  }

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="GPA 换算"
        title="三套 4.0 算法对照"
        description="输入你的成绩与学分，同时查看标准 4.0、改进 4.0 与北大 4.0 三套换算结果。计算在你的浏览器内完成。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {results.map((result) => (
          <div
            key={result.key}
            className="rounded-card border border-border-soft bg-surface-1 px-4 py-3.5 shadow-sm"
          >
            <p className="text-[11px] text-text-muted">{result.name}</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span
                className="text-2xl font-semibold text-text-primary"
                data-counter={
                  result.value === null ? undefined : result.value.toFixed(2)
                }
              >
                {result.value === null ? (
                  <V2Missing />
                ) : (
                  result.value.toFixed(2)
                )}
              </span>
              <span className="text-xs text-text-muted">/ 4.0</span>
            </p>
          </div>
        ))}
      </div>

      <V2Panel className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>课程</SectionTitle>
          <span className="text-[11px] text-text-muted">
            合计 {totalCredits} 学分
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">课程名</th>
                <th className="w-28 px-2 py-1.5 font-medium">百分制成绩</th>
                <th className="w-24 px-2 py-1.5 font-medium">学分</th>
                <th className="w-16 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {courses.map((course, index) => (
                <tr key={index} className="border-t border-border-soft/60">
                  <td className="px-2 py-1.5">
                    <input
                      value={course.name}
                      onChange={(event) =>
                        updateCourse(index, { name: event.target.value })
                      }
                      placeholder="课程名"
                      className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-cobalt/50"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={Number.isFinite(course.score) ? course.score : ""}
                      onChange={(event) =>
                        updateCourse(index, {
                          score: Number(event.target.value),
                        })
                      }
                      className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2 text-xs text-text-primary outline-none focus:border-cobalt/50"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={
                        Number.isFinite(course.credits) ? course.credits : ""
                      }
                      onChange={(event) =>
                        updateCourse(index, {
                          credits: Number(event.target.value),
                        })
                      }
                      className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2 text-xs text-text-primary outline-none focus:border-cobalt/50"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      aria-label={`删除第 ${index + 1} 行`}
                      onClick={() =>
                        setCourses((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="h-control rounded-control border border-border-soft px-2 text-xs text-text-muted transition hover:border-danger/40 hover:text-danger"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() =>
            setCourses((prev) => [...prev, { name: "", score: 0, credits: 3 }])
          }
          className="mt-3 h-control rounded-control border border-border-soft px-3 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          添加课程
        </button>

        {usable.length === 0 ? (
          <p className="mt-3 text-[11px] text-persimmon">
            至少需要一行有效成绩与学分才能计算。
          </p>
        ) : null}
      </V2Panel>

      <V2Panel className="mt-6">
        <SectionTitle>换算对照表</SectionTitle>
        <p className="mt-1 text-xs text-text-muted">
          三套算法的百分制到 4.0 换算定义。这是算法本身，不是院校数据。
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">百分制</th>
                {(Object.keys(GPA_ALGORITHMS) as GPAAlgorithm[]).map((key) => (
                  <th key={key} className="px-2 py-1.5 font-medium">
                    {GPA_ALGORITHMS[key].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GPA_SAMPLE_SCORES.map((score) => (
                <tr key={score} className="border-t border-border-soft/60">
                  <td className="px-2 py-1.5 text-text-muted">{score}</td>
                  {(Object.keys(GPA_ALGORITHMS) as GPAAlgorithm[]).map(
                    (key) => (
                      <td key={key} className="px-2 py-1.5 text-text-secondary">
                        {GPA_ALGORITHMS[key].fn(score).toFixed(1)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </V2Panel>
    </main>
  );
}

// ── ROI calculator ───────────────────────────────────────────────────

function RoiMode({ family }: { family: Family }) {
  const [cost, setCost] = useState("240000");
  const [salary, setSalary] = useState("70000");
  const [growth, setGrowth] = useState("5");

  const totalCost = Number(cost) || 0;
  const expectedSalary = Number(salary) || 0;
  const growthRate = (Number(growth) || 0) / 100;

  const result = useMemo(
    () => calculatePayback(totalCost, expectedSalary, growthRate),
    [totalCost, expectedSalary, growthRate],
  );

  const visibleSchedule = result.schedule.slice(0, 12);
  const horizon = Math.max(totalCost, ...visibleSchedule, 1);

  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="ROI 回本测算"
        title="估算学费回收周期"
        description="输入总成本、起薪与年增长率，估算累计收入覆盖成本所需的年数。计算在你的浏览器内完成，不使用院校数据。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr,1.3fr]">
        <V2Panel>
          <SectionTitle>输入</SectionTitle>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-text-muted">
                总成本（USD）
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2.5 text-xs text-text-primary outline-none focus:border-cobalt/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-text-muted">
                起薪（USD / 年）
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
                className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2.5 text-xs text-text-primary outline-none focus:border-cobalt/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-text-muted">
                年薪增长率（%）
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={50}
                step={1}
                value={growth}
                onChange={(event) => setGrowth(event.target.value)}
                className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-2.5 text-xs text-text-primary outline-none focus:border-cobalt/50"
              />
            </label>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-text-muted">
            增长率为复利，逐年作用于当年薪资。增长率上限按 50% 计算。
          </p>
        </V2Panel>

        <div className="space-y-6">
          <V2Panel>
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-jade" />
              <SectionTitle>回本周期</SectionTitle>
            </div>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-text-primary">
                {result.years === "never" ? (
                  "40 年内未回本"
                ) : (
                  <>
                    <span data-counter={String(result.years)}>
                      {result.years}
                    </span>
                    <span className="ml-1 text-base font-normal text-text-muted">
                      年
                    </span>
                  </>
                )}
              </span>
            </p>
            <div className="mt-3 space-y-0.5">
              <DefRow label="总成本">
                {totalCost > 0 ? (
                  `$${totalCost.toLocaleString("en-US")}`
                ) : (
                  <MissingValue />
                )}
              </DefRow>
              <DefRow label="累计收入">
                {result.cumulative > 0 ? (
                  `$${Math.round(result.cumulative).toLocaleString("en-US")}`
                ) : (
                  <MissingValue />
                )}
              </DefRow>
              <DefRow label="覆盖比例">
                {totalCost > 0 ? (
                  `${Math.round((result.cumulative / totalCost) * 100)}%`
                ) : (
                  <MissingValue />
                )}
              </DefRow>
            </div>
          </V2Panel>

          <V2Panel>
            <SectionTitle>累计收入曲线</SectionTitle>
            {visibleSchedule.length === 0 ? (
              <p className="mt-3 text-xs text-text-muted">
                <V2Missing text="输入总成本与起薪后显示" />
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {visibleSchedule.map((cumulative, index) => {
                  const ratio = Math.max(0, Math.min(1, cumulative / horizon));
                  const reached = cumulative >= totalCost;
                  return (
                    <li key={index} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-[10px] text-text-muted">
                        第 {index + 1} 年
                      </span>
                      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <span
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            reached ? "bg-jade" : "bg-cobalt"
                          }`}
                          style={{ width: `${Math.max(2, ratio * 100)}%` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-[10px] text-text-secondary">
                        ${Math.round(cumulative).toLocaleString("en-US")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {result.years === "never" && visibleSchedule.length > 0 ? (
              <p className="mt-3 text-[11px] text-persimmon">
                按当前输入，40 年内累计收入仍未覆盖总成本。
              </p>
            ) : null}
          </V2Panel>
        </div>
      </div>
    </main>
  );
}

// ── Unknown mode fallback ────────────────────────────────────────────

function UnknownMode({ mode, family }: { mode: string; family: Family }) {
  return (
    <main className={PAGE}>
      <V2PageHeader
        eyebrow="工作台"
        title="未知模块"
        description={`模块标识 "${mode}" 没有对应的视图。`}
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
        }
      />
      <DataEmptyState
        title="没有这个模块"
        description="请从工作台进入已实现的模块。"
        action={
          <Link
            href={family === "f" ? "/f/home" : "/s/home"}
            className="rounded-control border border-border-soft bg-surface-1 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            打开工作台
          </Link>
        }
      />
    </main>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────

export interface V2WorkbenchProps {
  mode: string;
  family?: "f";
  id?: string;
  slug?: string;
  informationCoverage?: WorkbenchFactCoverage;
}

export default function V2Workbench({
  mode,
  family: familyProp,
  id = "",
  slug = "",
  informationCoverage,
}: V2WorkbenchProps) {
  const family: Family = familyProp === "f" ? "f" : "s";

  // Every mode renders through one PageMotion wrapper so the shared reveal /
  // counter / heading contract applies to all 13 surfaces at once, instead of
  // each mode hand-rolling its own scroll chrome.
  const content = (() => {
    switch (mode) {
      case "home":
        return (
          <HomeMode family={family} informationCoverage={informationCoverage} />
        );
      case "majors":
        return <MajorsMode family={family} />;
      case "major":
        return <MajorDetailMode id={id} family={family} />;
      case "compare":
        return <CompareMode family={family} />;
      case "timeseries":
        return <TimeSeriesMode family={family} />;
      case "radar":
        // /s/radar is the new-programs radar (V2 S3): same news feed,
        // but framed around new-program detection with a coverage roll-up.
        return <NewsMode variant="radar" family={family} />;
      case "policy":
        return <NewsMode variant="policy" family={family} />;
      case "cases":
        return <CasesMode family={family} />;
      case "case":
        return <CaseDetailMode id={id} family={family} />;
      case "school":
        return <SchoolMode slug={slug} family={family} />;
      case "topic":
        return <TopicMode slug={slug} />;
      case "gpa":
        return <GpaMode family={family} />;
      case "roi":
        return <RoiMode family={family} />;
      default:
        return <UnknownMode mode={mode} family={family} />;
    }
  })();

  return <PageMotion>{content}</PageMotion>;
}
