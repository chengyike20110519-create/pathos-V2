"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  Database,
  Download,
  ExternalLink,
  Plus,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import PageMotion from "@/components/shared/PageMotion";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import { SchoolPicker } from "@/components/calculator/SchoolPicker";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversitySummaries } from "@/hooks/use-data-source";
import { useCompareStore } from "@/state/compare-store";
import {
  COMPARISON_PERSPECTIVES,
  COMPARISON_PERSPECTIVE_META,
  comparisonMissingLabel,
  comparisonRowsForPerspective,
  comparisonToCsv,
  createUniversityComparison,
  type ComparisonCell,
  type ComparisonPerspective,
  type UniversityComparisonModel,
} from "@/domain/information/comparison";
import type { Fact } from "@/domain/information/fact";

type FactsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; factsByUniversity: Record<string, Fact[]> }
  | { kind: "unavailable"; code?: string; message: string };

const MAX_COMPARE = 4;

function parseIds(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id) seen.add(id);
  }
  return [...seen].slice(0, MAX_COMPARE);
}

function displayName(university: { name: string; nameZh: string; chineseName: string }) {
  return university.nameZh || university.chineseName || university.name;
}

function SourceChip({ cell }: { cell: ComparisonCell }) {
  if (cell.source.kind === "approved_fact") {
    return (
      <a
        href={cell.source.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={[
          `来源：${cell.source.label}`,
          cell.source.sourceId ? `来源 ID：${cell.source.sourceId}` : null,
          cell.source.retrievedAt ? `抓取：${cell.source.retrievedAt}` : null,
          cell.source.reviewedAt ? `审核：${cell.source.reviewedAt}` : null,
          cell.source.confidence ? `置信度：${cell.source.confidence}` : null,
        ].filter(Boolean).join("\n")}
        className="inline-flex max-w-[130px] items-center gap-1 rounded-full border border-jade/30 bg-jade/10 px-1.5 py-0.5 text-[10px] font-medium text-jade transition hover:border-jade/50"
      >
        <ShieldCheck size={10} aria-hidden="true" />
        <span className="truncate">Approved</span>
        <ExternalLink size={9} aria-hidden="true" className="shrink-0" />
      </a>
    );
  }
  if (cell.source.kind === "preview") {
    return (
      <span
        title={`来源：${cell.source.label}。该值不是 approved fact，仅用于旧数据集显式降级展示。`}
        className="inline-flex items-center gap-1 rounded-full border border-border-soft bg-surface-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
      >
        Preview
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-soft bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
      缺失
    </span>
  );
}

function CellValue({ cell }: { cell: ComparisonCell }) {
  if (cell.value == null) {
    return <span className="italic text-text-muted">{comparisonMissingLabel(cell)}</span>;
  }
  return (
    <span
      className={`inline-flex rounded-control px-2 py-1 font-medium tabular-nums ${
        cell.isBest
          ? "border border-jade/40 bg-jade/10 text-jade"
          : cell.isExtreme
            ? "border border-persimmon/35 bg-persimmon/8 text-persimmon"
            : "text-text-primary"
      }`}
    >
      {cell.value}
    </span>
  );
}

export default function ComparisonMatrix() {
  const searchParams = useSearchParams();
  const dataSource = useDataSource();
  const summaries = useUniversitySummaries(dataSource);
  const compareStore = useCompareStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [perspective, setPerspective] = useState<ComparisonPerspective>("admission");
  const [academicYear, setAcademicYear] = useState("");
  const [factsState, setFactsState] = useState<FactsState>({ kind: "idle" });
  const initialized = useRef(false);
  const userChangedSelection = useRef(false);

  useEffect(() => {
    if (userChangedSelection.current) return;
    if (initialized.current) return;
    if (typeof window === "undefined") return;
    const urlIds = parseIds(
      searchParams.get("ids") ?? searchParams.getAll("compare").join(",") ?? "",
    );
    if (urlIds.length > 0) {
      setSelectedIds(urlIds);
      initialized.current = true;
    } else if (compareStore.hydrated && compareStore.ids.length > 0) {
      setSelectedIds(compareStore.ids.slice(0, MAX_COMPARE));
      initialized.current = true;
    }
  }, [compareStore.hydrated, compareStore.ids, searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedIds.length > 0) params.set("ids", selectedIds.join(","));
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }, [selectedIds]);

  const schools = useMemo(
    () => (summaries.state.status === "ready" ? summaries.state.data : []),
    [summaries.state],
  );
  const selected = useMemo(
    () => selectedIds
      .map(id => schools.find(school => school.id === id))
      .filter((school): school is NonNullable<typeof school> => Boolean(school)),
    [schools, selectedIds],
  );

  useEffect(() => {
    if (selectedIds.length < 2) {
      setFactsState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    setFactsState({ kind: "loading" });
    const params = new URLSearchParams({ ids: selectedIds.join(",") });
    if (academicYear.trim()) params.set("academicYear", academicYear.trim());
    fetch(`/api/information/compare?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async response => {
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            code?: string;
            message?: string;
          };
          setFactsState({
            kind: "unavailable",
            code: body.code,
            message: body.message ?? `approved facts 请求失败 (${response.status})`,
          });
          return;
        }
        const body = (await response.json()) as {
          ok?: boolean;
          factsByUniversity?: Record<string, Fact[]>;
        };
        if (!body.ok || !body.factsByUniversity) {
          setFactsState({ kind: "unavailable", message: "approved facts 返回格式无效" });
          return;
        }
        setFactsState({ kind: "ready", factsByUniversity: body.factsByUniversity });
      })
      .catch(error => {
        if (error instanceof Error && error.name === "AbortError") return;
        setFactsState({
          kind: "unavailable",
          message: error instanceof Error ? error.message : "approved facts 网络请求失败",
        });
      });
    return () => controller.abort();
  }, [academicYear, selectedIds]);

  const model = useMemo<UniversityComparisonModel>(() => createUniversityComparison({
    universities: selected,
    factsByUniversity: factsState.kind === "ready" ? factsState.factsByUniversity : {},
  }), [factsState, selected]);
  const rows = useMemo(
    () => comparisonRowsForPerspective(model, perspective),
    [model, perspective],
  );

  function addSchool(id: string) {
    userChangedSelection.current = true;
    setSelectedIds(current =>
      current.includes(id) || current.length >= MAX_COMPARE ? current : [...current, id],
    );
    setPickerOpen(false);
  }

  function removeSchool(id: string) {
    userChangedSelection.current = true;
    setSelectedIds(current => current.filter(item => item !== id));
  }

  function exportCsv() {
    const csv = comparisonToCsv(model);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pathos-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <PageMotion>
      <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
        <EnterprisePageHeader
          eyebrow="Comparison 2.0"
          title="学校对比工作台"
          description="最多并排比较 4 所学校。Approved facts 优先；事实层不可用时旧 Preview 字段会显式降级，绝不伪装成已审核数据。"
          icon={Scale}
          stats={[
            { label: "已选学校", value: `${selected.length}/${MAX_COMPARE}` },
            {
              label: "approved facts",
              value: factsState.kind === "ready"
                ? Object.values(factsState.factsByUniversity).flat().length
                : "待加载",
            },
            { label: "当前视角", value: COMPARISON_PERSPECTIVE_META[perspective].title },
            { label: "学年过滤", value: academicYear || "全部学年" },
          ]}
          sourceNote="每个单元格保留数值、学年、申请人范围、来源与审核状态；CSV 导出包含口径警告。"
          actions={
            <>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={selected.length >= MAX_COMPARE}
                className="inline-flex h-control items-center gap-1.5 rounded-none bg-[#bd5a3e] px-3 text-xs font-semibold text-white transition hover:bg-[#dd8568] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={13} aria-hidden="true" />
                添加学校
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={selected.length === 0}
                className="inline-flex h-control items-center gap-1.5 rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={13} aria-hidden="true" />
                导出 CSV
              </button>
            </>
          }
        />

        <section className="mt-5 border border-border-soft bg-surface-1 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {COMPARISON_PERSPECTIVES.map(id => {
                const active = perspective === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPerspective(id)}
                    aria-pressed={active}
                    className={active
                      ? "h-control rounded-control border border-cobalt/50 bg-cobalt/10 px-3 text-xs font-semibold text-cobalt"
                      : "h-control rounded-control border border-border-soft px-3 text-xs font-medium text-text-secondary transition hover:border-cobalt/30 hover:text-cobalt"}
                  >
                    {COMPARISON_PERSPECTIVE_META[id].title}
                  </button>
                );
              })}
            </div>
            <label className="block lg:w-56">
              <span className="text-[11px] font-medium text-text-muted">事实学年过滤</span>
              <input
                value={academicYear}
                onChange={event => setAcademicYear(event.target.value)}
                placeholder="例如 2026-2027"
                className="mt-1 h-control w-full rounded-control border border-border-soft bg-surface-muted/30 px-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-cobalt/50"
              />
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-text-secondary">
            {COMPARISON_PERSPECTIVE_META[perspective].description}
          </p>
        </section>

        {factsState.kind === "unavailable" && (
          <div className="mt-4 flex items-start gap-2 rounded-control border border-persimmon/30 bg-persimmon/8 p-3 text-xs leading-5 text-persimmon">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Approved facts 对比暂不可用{factsState.code ? `（${factsState.code}）` : ""}。
              已自动降级到可追溯 Preview 字段，不会标记为已审核。
            </span>
          </div>
        )}

        {summaries.state.status === "loading" ? (
          <div className="mt-8 flex min-h-[240px] items-center justify-center border border-border-soft bg-surface-1">
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Database size={16} aria-hidden="true" />
              正在读取院校档案…
            </p>
          </div>
        ) : summaries.state.status === "error" ? (
          <div className="mt-8 border border-persimmon/30 bg-persimmon/8 p-6 text-sm text-persimmon">
            院校档案读取失败：{summaries.state.message ?? "未知错误"}
          </div>
        ) : selected.length < 2 ? (
          <div className="mt-8 flex min-h-[280px] flex-col items-center justify-center border border-dashed border-border-soft bg-surface-1/70 p-8 text-center">
            <Scale size={26} className="text-text-muted" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold text-text-primary">选择至少两所学校</h2>
            <p className="mt-1 max-w-md text-xs leading-5 text-text-secondary">
              可以从地图、学校页或这里加入学校；URL 会保存当前对比组合，方便复盘和引用。
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-4 inline-flex h-control items-center gap-1.5 rounded-control bg-cobalt px-3 text-xs font-semibold text-paper"
            >
              <Plus size={13} aria-hidden="true" />
              添加学校
            </button>
          </div>
        ) : (
          <section className="mt-5 overflow-x-auto border border-border-soft bg-surface-1">
            <table className="w-full min-w-[860px] text-left">
              <caption className="sr-only">
                {COMPARISON_PERSPECTIVE_META[perspective].title}对比矩阵
              </caption>
              <thead>
                <tr className="border-b border-border-soft bg-surface-muted/45">
                  <th scope="col" className="w-52 px-4 py-3 text-[11px] font-medium text-text-muted">
                    字段
                  </th>
                  {model.universities.map(item => (
                    <th key={item.university.id} scope="col" className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/university/${encodeURIComponent(item.university.id)}`}
                            className="block truncate text-sm font-semibold text-text-primary hover:text-cobalt"
                          >
                            {displayName(item.university)}
                          </Link>
                          <p className="mt-0.5 truncate text-[10px] text-text-muted" lang="en">
                            {item.university.name}
                          </p>
                          <p className="mt-1 text-[10px] text-text-muted">
                            {item.approvedFactCount} 条 approved facts
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSchool(item.university.id)}
                          aria-label={`移除${displayName(item.university)}`}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-control text-text-muted transition hover:bg-surface-muted hover:text-persimmon"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {rows.map(row => (
                  <tr key={row.id} className="align-top">
                    <th scope="row" className="px-4 py-3 text-left">
                      <p className="text-xs font-semibold text-text-primary">{row.label}</p>
                      <p className="mt-1 text-[10px] leading-4 text-text-muted">{row.description}</p>
                      {row.yearMismatch && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-control bg-persimmon/10 px-1.5 py-0.5 text-[10px] font-medium text-persimmon">
                          学年口径不同
                        </p>
                      )}
                      {row.sourceMismatch && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-control bg-persimmon/10 px-1.5 py-0.5 text-[10px] font-medium text-persimmon">
                          来源口径不同
                        </p>
                      )}
                      {row.unitMismatch && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-control bg-persimmon/10 px-1.5 py-0.5 text-[10px] font-medium text-persimmon">
                          单位口径不同
                        </p>
                      )}
                    </th>
                    {row.cells.map(cell => (
                      <td key={cell.key} className="px-4 py-3">
                        <div className="flex min-h-[46px] flex-col justify-between gap-2">
                          <div>
                            <CellValue cell={cell} />
                            <p className="mt-1 text-[10px] text-text-muted">
                              {[cell.academicYear, cell.applicantScope].filter(Boolean).join(" · ") || "范围未标注"}
                            </p>
                          </div>
                          <SourceChip cell={cell} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-jade" aria-hidden="true" />
            绿色边框表示该行数值相对更优
          </span>
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight size={12} aria-hidden="true" />
            Approved 单元格可打开来源链接
          </span>
          <span>CSV 导出包含缺失、学年口径与来源口径警告。</span>
        </footer>

        {pickerOpen && (
          <SchoolPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            candidates={schools}
            selectedIds={selectedIds}
            max={MAX_COMPARE}
            onPick={addSchool}
            storageKey="pathos-compare-2"
          />
        )}
      </main>
    </PageMotion>
  );
}
