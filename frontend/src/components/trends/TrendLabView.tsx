"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Database,
  Download,
  LineChart,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import { SchoolPicker } from "@/components/calculator/SchoolPicker";
import PageMotion from "@/components/shared/PageMotion";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversitySummaries } from "@/hooks/use-data-source";
import { useCompareStore } from "@/state/compare-store";
import type { UniversityDetail } from "@/domain/dataset";
import type { TimeSeriesMetric, TimeSeriesPoint } from "@/types/timeseries";

const MAX_SCHOOLS = 4;

const METRICS: Array<{
  id: TimeSeriesMetric;
  label: string;
  format: (value: number) => string;
}> = [
  {
    id: "acceptanceRate",
    label: "录取率",
    format: (value) => `${(value <= 1 ? value * 100 : value).toFixed(value <= 1 ? 1 : 0)}%`,
  },
  { id: "tuitionUSD", label: "学费", format: (value) => `$${new Intl.NumberFormat("zh-CN").format(value)}` },
  { id: "sat", label: "SAT", format: (value) => String(Math.round(value)) },
  { id: "gpa", label: "GPA", format: (value) => value.toFixed(2) },
];

const SERIES_COLORS = ["#2557a0", "#16805c", "#bd5a3e", "#11151f"];

function initialMetric(raw: string | null): TimeSeriesMetric {
  return METRICS.some((item) => item.id === raw) ? raw as TimeSeriesMetric : "acceptanceRate";
}

function metricCount(detail: UniversityDetail, metric: TimeSeriesMetric) {
  return (detail.timeSeries ?? []).filter((point) => {
    const value = point[metric];
    return typeof value === "number" && Number.isFinite(value);
  }).length;
}

function snapshotValue(detail: UniversityDetail, metric: TimeSeriesMetric) {
  if (metric === "acceptanceRate") {
    const value = detail.acceptanceRate;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const percent = value <= 1 ? value * 100 : value;
    return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
  }
  if (metric === "tuitionUSD") return detail.costSummary?.displayLabel ?? null;
  if (metric === "sat") {
    return typeof detail.sat25 === "number" && typeof detail.sat75 === "number"
      ? `${detail.sat25}-${detail.sat75}`
      : null;
  }
  return null;
}

function uniqueSources(detail: UniversityDetail) {
  const seriesSources = (detail.timeSeries ?? []).map((point) => point.source);
  return [...new Set(seriesSources)];
}

type DetailsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; details: UniversityDetail[] }
  | { kind: "unavailable"; code?: string; message: string }
  | { kind: "error"; code?: string; message: string };

function parseIds(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id) seen.add(id);
  }
  return [...seen].slice(0, MAX_SCHOOLS);
}

function schoolName(detail: UniversityDetail) {
  return detail.nameZh || detail.chineseName || detail.name;
}

function yearOf(semester: string): number | null {
  const match = semester.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function seriesSegments(
  detail: UniversityDetail,
  semesters: string[],
  metric: TimeSeriesMetric,
  values: number[],
) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const range = max - min || 1;
  const bySemester = new Map(detail.timeSeries?.map((point) => [point.semester, point]) ?? []);
  const geometry = semesters.map((semester, index) => {
    const value = bySemester.get(semester)?.[metric];
    return {
      semester,
      x: semesters.length === 1 ? 50 : (index / (semesters.length - 1)) * 100,
      y: typeof value === "number" && Number.isFinite(value) ? 162 - ((value - min) / range) * 140 : null,
      value,
    };
  });

  const segments: string[] = [];
  let current: string[] = [];
  geometry.forEach((point) => {
    if (point.y === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${point.x},${point.y}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  return { geometry, segments };
}

function changeSummary(detail: UniversityDetail, metric: TimeSeriesMetric) {
  const points = [...(detail.timeSeries ?? [])]
    .flatMap((point): Array<{ semester: string; value: number }> => {
      const value = point[metric];
      return typeof value === "number" && Number.isFinite(value)
        ? [{ semester: point.semester, value }]
        : [];
    })
    .sort((a, b) => a.semester.localeCompare(b.semester));
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const change = last.value - first.value;
  const firstYear = yearOf(first.semester);
  const lastYear = yearOf(last.semester);
  const years = firstYear !== null && lastYear !== null ? lastYear - firstYear : null;
  const cagr =
    years && years > 0 && first.value > 0
      ? (Math.pow(last.value / first.value, 1 / years) - 1) * 100
      : null;
  return {
    first,
    last,
    change,
    years,
    cagr,
    missing: (detail.timeSeries?.length ?? 0) - points.length,
  };
}

function csvEscape(value: string) {
  // External school/source names are untrusted cell text. Prefix a single
  // quote before spreadsheet control characters so Excel-style apps render
  // the value instead of evaluating it as a formula.
  const safe = /^[=@+\t\r-]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function exportCsv(details: UniversityDetail[], metric: TimeSeriesMetric, label: string) {
  const semesters = [...new Set(details.flatMap((detail) => detail.timeSeries?.map((point) => point.semester) ?? []))]
    .sort((a, b) => a.localeCompare(b));
  const header = ["semester", "school_id", "school_name", "value", "source", "as_of", "verified_by", "confidence"];
  const rows = semesters.flatMap((semester) =>
    details.flatMap((detail) => {
      const point = detail.timeSeries?.find((item) => item.semester === semester);
      if (!point) return [];
      return [[
        semester,
        detail.id,
        schoolName(detail),
        point[metric] == null ? "" : String(point[metric]),
        point.source,
        point.asOf,
        point.verifiedBy,
        String(point.confidence),
      ].map(csvEscape).join(",")];
    }),
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pathos-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DataReadinessPanel({
  details,
  metric,
  metricLabel,
}: {
  details: UniversityDetail[];
  metric: TimeSeriesMetric;
  metricLabel: string;
}) {
  if (details.length === 0) {
    return (
      <section className="mt-4 rounded-card border border-dashed border-border-soft bg-surface-1 p-6" data-reveal="true">
        <Database size={20} aria-hidden="true" className="text-cobalt" />
        <h2 className="mt-2 text-body font-semibold text-text-primary">等待学校序列</h2>
        <p className="mt-1 max-w-2xl text-caption text-text-secondary">
          趋势台只读取学校已发布的 <span lang="en">timeSeries</span>。没有序列时保留空态，不会用相邻年、同类校或行业均值补点。
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-section text-text-primary">{metricLabel}数据准备状态</h2>
          <p className="mt-1 max-w-3xl text-caption text-text-secondary">
            左侧是趋势序列覆盖，右侧是当前 Preview 快照。快照只用于回到学校档案核查，不参与趋势计算。
          </p>
        </div>
        <span className="rounded-control border border-border-soft bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
          No interpolation
        </span>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {details.map((detail, index) => {
          const count = metricCount(detail, metric);
          const sources = uniqueSources(detail);
          const snapshot = snapshotValue(detail, metric);
          return (
            <article key={detail.id} className="page-motion-card rounded-card border border-border-soft bg-surface-muted/40 p-4">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px] font-semibold text-text-muted">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                    {detail.datasetVersion}
                  </p>
                  <h3 className="mt-1 truncate text-body font-semibold text-text-primary">{schoolName(detail)}</h3>
                </div>
                <span className={`shrink-0 rounded-control px-2.5 py-1 text-[11px] font-semibold ${count > 0 ? "bg-jade/10 text-jade" : "bg-persimmon/10 text-persimmon"}`}>
                  {count} 个趋势点
                </span>
              </header>

              <dl className="mt-3 grid grid-cols-2 gap-3 text-caption sm:grid-cols-4">
                <div>
                  <dt className="text-text-muted">序列点</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{detail.timeSeries?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">该指标</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{count}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">当前快照</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{snapshot ?? "未报告"}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">序列来源</dt>
                  <dd className="mt-0.5 font-semibold text-text-primary">{sources.length > 0 ? sources.join(" / ") : `${detail.sources.length} 个档案来源`}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={`/university/${encodeURIComponent(detail.id)}`}
                  className="inline-flex min-h-control-lg items-center rounded-control border border-border-soft bg-surface-1 px-3 text-caption font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                >
                  学校事实
                </Link>
                <Link
                  href="/costs"
                  className="inline-flex min-h-control-lg items-center rounded-control border border-border-soft bg-surface-1 px-3 text-caption font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                >
                  费用口径
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function TrendLabView() {
  const searchParams = useSearchParams();
  const dataSource = useDataSource();
  const summaries = useUniversitySummaries(dataSource);
  const compare = useCompareStore();
  const initialUrlIds = parseIds(searchParams.get("ids") ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialUrlIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [metric, setMetric] = useState<TimeSeriesMetric>(() => initialMetric(searchParams.get("metric")));
  const [state, setState] = useState<DetailsState>({ kind: "idle" });
  const initialized = useRef(initialUrlIds.length > 0);

  useEffect(() => {
    if (initialized.current || !compare.hydrated) return;
    if (compare.ids.length > 0) setSelectedIds(compare.ids.slice(0, MAX_SCHOOLS));
    initialized.current = true;
  }, [compare.hydrated, compare.ids]);

  useEffect(() => {
    if (!initialized.current) return;
    const params = new URLSearchParams();
    if (selectedIds.length > 0) params.set("ids", selectedIds.join(","));
    params.set("metric", metric);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [metric, selectedIds]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    if (!dataSource) {
      setState({ kind: "unavailable", message: "数据源尚未初始化" });
      return () => undefined;
    }
    Promise.all(selectedIds.map((id) => dataSource.getUniversityDetail(id, controller.signal)))
      .then((details) => setState({ kind: "ready", details }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        const code = (error as { code?: string }).code;
        setState({
          kind: code === "BACKEND_UNAVAILABLE" || code === "TIMEOUT" ? "unavailable" : "error",
          code,
          message: error instanceof Error ? error.message : "趋势数据读取失败",
        });
      });
    return () => controller.abort();
  }, [dataSource, selectedIds]);

  const schools = summaries.state.status === "ready" ? summaries.state.data : [];
  const details = useMemo(
    () => (state.kind === "ready" ? state.details : []),
    [state],
  );
  const activeMetric = METRICS.find((item) => item.id === metric) ?? METRICS[0];

  const semesters = useMemo(
    () => [...new Set(details.flatMap((detail) => detail.timeSeries?.map((point) => point.semester) ?? []))]
      .sort((a, b) => a.localeCompare(b)),
    [details],
  );
  const numericValues = useMemo(
    () => details.flatMap((detail) =>
      (detail.timeSeries ?? []).map((point) => point[metric]).filter((value): value is number =>
        typeof value === "number" && Number.isFinite(value),
      ),
    ),
    [details, metric],
  );
  const hasChart = semesters.length > 0 && numericValues.length > 0;
  const chartScale = useMemo(() => {
    const max = Math.max(...numericValues, 0);
    const min = Math.min(...numericValues, 0);
    const range = max - min || 1;
    return { min, max, ticks: [max, min + range * 0.5, min].map((value) => activeMetric.format(value)) };
  }, [activeMetric, numericValues]);

  const updateSelection = (next: string[]) => {
    const capped = [...new Set(next)].slice(0, MAX_SCHOOLS);
    setSelectedIds(capped);
    compare.replaceIds(capped);
  };

  return (
    <PageMotion>
      <div className="min-h-screen bg-surface-base">
        <EnterprisePageHeader
          eyebrow="Trend Lab"
          title="趋势台"
          description="最多比较 4 所学校的录取率、学费、SAT 与 GPA 序列。缺失年份保留空档，不插值、不预测。"
          icon={LineChart}
          stats={[
            { label: "学校", value: `${selectedIds.length}/${MAX_SCHOOLS}` },
            { label: "时间点", value: String(semesters.length) },
            { label: "有效点", value: String(numericValues.length) },
            { label: "指标", value: activeMetric.label },
          ]}
          sourceNote="序列来自 UniversityDetail.timeSeries。每个点保留来源、时点、核验者与置信度；未发布序列的学校不会被补数据。"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={selectedIds.length >= MAX_SCHOOLS}
                className="inline-flex min-h-control-lg items-center gap-1.5 rounded-control bg-persimmon px-3 text-caption font-semibold text-white transition hover:bg-[#dd8568] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={14} aria-hidden="true" />
                添加学校
              </button>
              <button
                type="button"
                onClick={() => exportCsv(details, metric, activeMetric.id)}
                disabled={!hasChart}
                className="inline-flex min-h-control-lg items-center gap-1.5 rounded-control border border-[#eef1f526] px-3 text-caption font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={14} aria-hidden="true" />
                导出 CSV
              </button>
            </div>
          }
        />

        <main className="mx-auto w-full max-w-page px-4 pb-12 pt-5 sm:px-6">
          <section className="rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-section text-text-primary">学校与指标</h2>
                <p className="mt-1 text-caption text-text-secondary">指标覆盖只统计真实数值点，URL 会保留当前研究组合。</p>
              </div>
              <div role="group" aria-label="趋势指标" className="grid grid-cols-2 gap-1 rounded-control border border-border-soft bg-surface-muted p-1 sm:grid-cols-4">
                {METRICS.map((item) => (
                  (() => {
                    const coveredSchools = details.filter((detail) => metricCount(detail, item.id) > 0).length;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setMetric(item.id)}
                        aria-pressed={metric === item.id}
                        className={`min-h-control-lg min-w-[104px] rounded-control px-3 text-left text-caption font-medium transition ${
                          metric === item.id
                            ? "bg-ink text-paper"
                            : "text-text-secondary hover:bg-surface-1 hover:text-text-primary"
                        }`}
                      >
                        <span className="block">{item.label}</span>
                        <span className={`mt-0.5 block text-[10px] tabular-nums ${metric === item.id ? "text-paper/65" : "text-text-muted"}`}>
                          {coveredSchools}/{details.length || 0} 校
                        </span>
                      </button>
                    );
                  })()
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {details.map((detail, index) => (
                <div
                  key={detail.id}
                  className="inline-flex max-w-full items-center gap-2 rounded-control border border-border-soft bg-surface-muted px-2.5 py-1.5"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                  <Link href={`/university/${encodeURIComponent(detail.id)}`} className="inline-flex min-h-control-lg items-center truncate text-caption font-medium text-text-primary hover:text-cobalt">
                    {schoolName(detail)}
                  </Link>
                  <button
                    type="button"
                    onClick={() => updateSelection(selectedIds.filter((id) => id !== detail.id))}
                    aria-label={`移除${schoolName(detail)}`}
                    className="grid h-11 w-11 place-items-center rounded-control text-text-muted transition hover:bg-surface-1 hover:text-persimmon"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {selectedIds.length === 0 ? <p className="text-caption text-text-muted">尚未选择学校。</p> : null}
            </div>
          </section>

          {state.kind === "loading" ? (
            <p className="mt-4 rounded-card border border-border-soft bg-surface-1 p-4 text-caption text-text-secondary">正在读取学校序列…</p>
          ) : null}

          {state.kind === "unavailable" || state.kind === "error" ? (
            <p className="mt-4 flex items-start gap-2 rounded-card border border-persimmon/30 bg-persimmon/8 p-4 text-caption text-persimmon">
              <AlertCircle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                趋势数据暂不可用{state.code ? `（${state.code}）` : ""}：{state.message}
              </span>
            </p>
          ) : null}

          {state.kind === "ready" && !hasChart ? (
            <DataReadinessPanel details={details} metric={metric} metricLabel={activeMetric.label} />
          ) : null}

          {state.kind === "ready" && hasChart ? (
            <>
              <section className="mt-4 rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-section text-text-primary">{activeMetric.label}多年序列</h2>
                  <p className="text-caption text-text-muted">{semesters[0]} - {semesters[semesters.length - 1]}</p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                  <svg viewBox="0 0 100 180" className="h-[360px] w-full" preserveAspectRatio="none" role="img" aria-label={`${selectedIds.length}所学校${activeMetric.label}趋势图`}>
                    {[22, 57, 92, 127, 162].map((y) => (
                      <path key={y} d={`M0 ${y}H100`} stroke="currentColor" className="text-border-soft" strokeWidth=".25" />
                    ))}
                    {semesters.map((semester, index) => (
                      <path
                        key={semester}
                        d={`M${semesters.length === 1 ? 50 : (index / (semesters.length - 1)) * 100} 18V162`}
                        stroke="currentColor"
                        className="text-border-soft"
                        strokeWidth=".15"
                      />
                    ))}
                    {details.map((detail, index) => {
                      const { geometry, segments } = seriesSegments(detail, semesters, metric, numericValues);
                      return (
                        <g key={detail.id}>
                          {segments.map((points, segmentIndex) => (
                            <polyline
                              key={segmentIndex}
                              points={points}
                              fill="none"
                              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                              strokeWidth="1.1"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                          {geometry.map((point) =>
                            point.y === null ? null : (
                              <circle
                                key={`${detail.id}-${point.semester}`}
                                cx={point.x}
                                cy={point.y}
                                r="1.3"
                                fill="#fff"
                                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                                strokeWidth=".6"
                              />
                            ),
                          )}
                        </g>
                      );
                    })}
                  </svg>
                  <div className="flex flex-col justify-between text-caption text-text-muted">
                    <div className="flex items-center justify-between"><span>最大</span><span className="font-semibold tabular-nums">{chartScale.ticks[0]}</span></div>
                    <div className="flex items-center justify-between"><span>中间</span><span className="font-semibold tabular-nums">{chartScale.ticks[1]}</span></div>
                    <div className="flex items-center justify-between"><span>最小</span><span className="font-semibold tabular-nums">{chartScale.ticks[2]}</span></div>
                    <div className="space-y-2 border-t border-border-soft pt-3">
                      {details.map((detail, index) => (
                        <p key={detail.id} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                          <span className="truncate text-text-secondary">{schoolName(detail)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-text-muted">X 轴仅显示区间；详细年份请看下方明细表。断线代表该学校该年缺失，不做插值。</p>
              </section>

              <section className="mt-4 grid gap-3 lg:grid-cols-2" data-reveal="true">
                {details.map((detail) => {
                  const summary = changeSummary(detail, metric);
                  const points = detail.timeSeries ?? [];
                  return (
                    <article key={detail.id} className="page-motion-card rounded-card border border-border-soft bg-surface-1 p-4">
                      <header className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-body font-semibold text-text-primary">{schoolName(detail)}</h3>
                          <p className="mt-0.5 text-caption text-text-muted">{points.length} 个序列点 · {summary?.missing ?? 0} 个该指标缺失</p>
                        </div>
                        <Link href={`/university/${encodeURIComponent(detail.id)}`} className="shrink-0 text-caption font-medium text-cobalt hover:underline">
                          学校档案
                        </Link>
                      </header>
                      {summary ? (
                        <dl className="mt-3 grid grid-cols-3 gap-2 text-caption">
                          <div><dt className="text-text-muted">区间变化</dt><dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{activeMetric.format(summary.change)}</dd></div>
                          <div><dt className="text-text-muted">年数</dt><dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{summary.years ?? "无法解析"}</dd></div>
                          <div><dt className="text-text-muted">年均变化</dt><dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{summary.cagr === null ? "不可计算" : `${summary.cagr.toFixed(1)}%`}</dd></div>
                        </dl>
                      ) : (
                        <p className="mt-3 text-caption text-text-muted">该指标不足两个有效点，无法计算区间变化。</p>
                      )}
                      <div className="mt-3 max-h-64 overflow-auto rounded-control border border-border-soft">
                        <table className="w-full border-collapse text-caption">
                          <thead className="sticky top-0 bg-surface-muted text-left text-[11px] text-text-muted">
                            <tr>
                              <th scope="col" className="px-2 py-2">时点</th>
                              <th scope="col" className="px-2 py-2">数值</th>
                              <th scope="col" className="px-2 py-2">来源</th>
                            </tr>
                          </thead>
                          <tbody>
                            {points.map((point) => {
                              const value = point[metric];
                              return (
                                <tr key={point.semester} className="border-t border-border-soft">
                                  <td className="px-2 py-2 font-mono text-[11px]">{point.semester}</td>
                                  <td className="px-2 py-2 font-semibold tabular-nums">{typeof value === "number" ? activeMetric.format(value) : "缺失"}</td>
                                  <td className="px-2 py-2">
                                    <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                                      <ShieldCheck size={11} aria-hidden="true" className={point.confidence >= 80 ? "text-jade" : "text-persimmon"} />
                                      {point.source} · {point.confidence}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </section>
            </>
          ) : null}
        </main>

        <SchoolPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          candidates={schools}
          selectedIds={selectedIds}
          max={MAX_SCHOOLS}
          title="选择大学加入趋势"
          onPick={(id) => {
            updateSelection([...selectedIds, id]);
            setPickerOpen(false);
          }}
          storageKey="pathos-trend-picker"
        />
      </div>
    </PageMotion>
  );
}

export default TrendLabView;
