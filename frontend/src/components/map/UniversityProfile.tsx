"use client";

// Stage 7A — UniversityProfile panel.
//
// Replaces the legacy UniversityCard as the on-map detail panel. Renders
// from the canonical `UniversitySummary` shape (no `?? 0` fabrication)
// plus optional detail via `useUniversityDetail`. Missing fields show
// the "未报告" / "数据补充中" empty state — never 0/N/A.
//
// Designed to be rendered as an edge-docked popover (desktop right,
// mobile bottom sheet). Itself is non-modal: it never blocks map
// dragging or hover. Closes on Escape, on click-empty (handled by
// MapShell), and on explicit close button.

import { useEffect } from "react";
import { X, GraduationCap, MapPin, DollarSign, Shield, Users, ExternalLink, Sparkles, BookOpen, AlertTriangle, Loader2, ChevronRight, CheckCircle2 } from "lucide-react";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversityDetail } from "@/hooks/use-data-source";
import { tuitionRmbFromSummary } from "@/lib/legacy-mappers";
import type { UniversitySummary } from "@/domain/dataset";
import { UniversityPrograms } from "./UniversityPrograms";
import { CampusGallery } from "./CampusGallery";

export interface UniversityProfileProps {
  /** The selected university summary (canonical shape). */
  summary: UniversitySummary;
  /** Whether this university is currently in the user's compare set. */
  inCompare?: boolean;
  /** Add to compare (max 3 enforced by caller). */
  onAddToCompare?: () => void;
  /** Remove from compare. */
  onRemoveFromCompare?: () => void;
  /** Open the dedicated /university/[id] page. */
  onViewProfile?: () => void;
  /** Close the panel (escape / close button / click empty). */
  onClose: () => void;
}

export function UniversityProfile({
  summary,
  inCompare = false,
  onAddToCompare,
  onRemoveFromCompare,
  onViewProfile,
  onClose,
}: UniversityProfileProps) {
  const dataSource = useDataSource();
  const detailState = useUniversityDetail(dataSource, summary.id);
  const detail = detailState.state.status === "ready" && detailState.state.data?.id === summary.id
    ? detailState.state.data : null;
  const profile = detail ?? summary;
  const missingLabel = detailState.state.status === "error"
    ? "详情未加载"
    : !detail
      ? "加载中…" : "未报告";

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tuition = tuitionRmbFromSummary(profile);
  // IECG fill (P1): prefer the explicit tuition band from the parsed
  // CollegeGuide when present (e.g. "$65,800") over the USD-derived
  // `costSummary.minimumUsd * 7.2` value. Fall through to the legacy
  // derived number; only render "未报告" when both are missing.
  const gpTuition = profile.guidePreview?.tuition?.total;
  const officialTuition = profile.officialResearch?.tuitionOutOfState;
  const costLabel = typeof officialTuition === "number" && officialTuition > 0
    ? `$${Math.round(officialTuition).toLocaleString("en-US")}/年`
    : gpTuition
      ? `${gpTuition}/年`
      : profile.costSummary?.displayLabel
        ? `${profile.costSummary.displayLabel}/年`
        : tuition !== null
      ? `¥${Math.round(tuition / 10000)}万/年`
      : missingLabel;
  // IECG fill (P1): quick-stats (师生比 / 4年毕业率 / 保留率 / 截止日 / 学制)
  const sfrLabel = profile.guidePreview?.studentFacultyRatio ?? "数据补充中";
  const grad4Label = profile.guidePreview?.graduationRate4Yr ?? "数据补充中";
  const retentionLabel = profile.guidePreview?.freshmanRetentionRate ?? "数据补充中";
  const deadlineLabel = profile.guidePreview?.applicationDeadlines ?? "数据补充中";
  const systemLabel = profile.guidePreview?.academicSystem ?? "数据补充中";
  const curriculumUrl = profile.guidePreview?.curriculumUrl;
  const rankingTier = summary.rankingSummary?.rankingTier ?? summary.rankingTier ?? null;
  const rankingLabel = summary.rankingSummary?.rankingLabel ?? "未在当前排名范围";
  const nationalRank = summary.rankingSummary?.nationalRank ?? null;
  const warnings = profile.qualitySummary?.warningCodes ?? [];
  const hasPartialGuide = profile.guidePreview?.coverageStatus === "partial_official_catalog";

  // Detail-only fields (programs, cost records, nearby towns).
  // NOTE: the Preview Bundle currently returns the legacy
  // UniversityDetail shape (programs / cost / ranking / etc.) but
  // does NOT yet expose the PreviewMetadata's admissions/enrollment
  // blocks. We read both safely: when the blocks are present we
  // surface them; otherwise we render the empty-state label.
  // `detail` itself can be null while the detail hook is still
  // loading; treat null as the empty object so `.admissions?.…` and
  // similar chains don't throw before the optional chain can run.
  const detailAny = (detail ?? {}) as unknown as {
    programs?: Array<{ id: string; name: string; category?: string; rank?: number; membership?: "top" | "notable"; displayTier?: string }>;
    cost?: Array<{ amount: number; currency: string; year: number; components?: { tuition?: boolean; roomBoard?: boolean; mandatoryFees?: boolean } }>;
    nearbyTowns?: Array<{ name: string; nameZh?: string; distanceKm?: number }>;
    admissions?: { acceptanceRate?: { value: number | null; status?: string } };
    previewMetadata?: { enrollment?: { undergraduate?: { value: number | null; status?: string } } };
    allMajors?: Array<{ name: string; displayName: string }>;
    programSpotlights?: Array<{ name: string; kind: "strength" | "distinctive"; nameZh?: string }>;
    officialResearch?: { acceptanceRate: number | null; undergraduateEnrollment: number | null; tuitionOutOfState: number | null; tuitionInState: number | null };
    sources?: Array<{ url: string; status?: string; retrievedAt?: string }>;
    campusImages?: Array<{
      id: string; url: string; thumbnailUrl?: string | null; label: string;
      sourceUrl: string; publisher: string;
      licenseStatus: "verified" | "pending_review" | "not_suitable";
      reviewStatus: "approved" | "pending" | "rejected";
      checkedOn: string; displayOrder: number;
    }>;
  };
  const official = detail?.officialResearch ?? summary.officialResearch;
  const acceptanceRate = detailAny.admissions?.acceptanceRate?.value ?? official?.acceptanceRate ?? null;
  const undergradCount =
    official?.undergraduateEnrollment ??
    detailAny.previewMetadata?.enrollment?.undergraduate?.value ??
    profile.enrollmentSummary?.undergraduate ??
    null;
  const detailSources = detailAny.sources ?? [];
  const retrievedOn = detail?.officialResearch?.retrievedOn ?? detailSources.find((source) => source.retrievedAt)?.retrievedAt ?? "";

  function emptyReport(value: number | string | null | undefined, fallback: string): string {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) return fallback;
    if (typeof value === "string" && value.trim() === "") return fallback;
    return String(value);
  }

  return (
    <div
      role="dialog"
      aria-label={`${summary.chineseName || summary.name} 详细信息`}
      className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line/70 bg-panel/95 text-ink shadow-[0_20px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl"
    >
      {/* ── Header ── */}
      <header className="relative shrink-0 overflow-hidden border-b border-line/50 bg-gradient-to-br from-cobalt/[0.11] via-panel to-jade/[0.07] px-4 pb-4 pt-3.5">
        <div className="absolute -right-8 -top-12 h-32 w-32 rounded-full bg-cobalt/10 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-cobalt/80">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-cobalt/15"><CheckCircle2 size={10} aria-hidden="true" /></span>
            <span>学校信息卡</span>
            <span className="font-normal tracking-normal text-ink/40">先看概况，再看专业</span>
          </div>
          <h2 className="text-[17px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {summary.chineseName || summary.name || "未提供名称"}
          </h2>
          {summary.name && summary.chineseName !== summary.name && (
            <p className="truncate text-xs text-ink/55" lang="en">{summary.name}</p>
          )}
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink/48">
            <MapPin size={10} aria-hidden="true" />
            <span>{emptyReport(profile.city, missingLabel)}</span>
            {summary.state ? (
              <>
                <span className="mx-0.5 text-ink/24" aria-hidden="true">·</span>
                <span>{emptyReport(summary.state, "未报告")}</span>
              </>
            ) : null}
          </p>
        </div>
        {rankingTier && (
          <span className="shrink-0 rounded-full border border-line/60 bg-paper px-2 py-0.5 text-[10px] font-medium text-ink/70">
            {nationalRank !== null ? `全美 #${nationalRank}` : "排名未收录"}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭学校详情"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink/40 transition-colors hover:bg-line/30 hover:text-ink"
        >
          <X size={14} />
        </button>
        </div>
        <div className="relative mt-3 flex items-center gap-2 text-[10px] text-ink/55">
          <span className="inline-flex items-center gap-1 rounded-full border border-cobalt/20 bg-panel/70 px-2 py-1 text-cobalt"><CheckCircle2 size={11} aria-hidden="true" />官方来源已接入</span>
          <span className="rounded-full border border-line/50 bg-panel/60 px-2 py-1">点击下方专业进入详情</span>
        </div>
      </header>

      <section className="shrink-0 border-b border-line/50" aria-label="校园影像">
        <CampusGallery images={detailAny.campusImages} />
        {detailAny.campusImages?.some((image) => image.reviewStatus === "approved" && image.licenseStatus === "verified") && (
          <p className="px-4 py-1.5 text-[9px] text-ink/40">图片仅展示已审核来源；点击右上角可查看原始来源。</p>
        )}
      </section>

      <nav aria-label="学校信息阅读顺序" className="flex shrink-0 items-center gap-1 border-b border-line/50 bg-paper/45 px-3 py-2 text-[10px] text-ink/50">
        <a href="#school-overview" aria-current="step" className="rounded-md bg-cobalt/10 px-2 py-1 font-medium text-cobalt hover:bg-cobalt/15">1 概况</a>
        <span aria-hidden="true">→</span>
        <a href="#school-programs" className="rounded-md px-2 py-1 hover:bg-line/20 hover:text-ink">2 专业</a>
        <span aria-hidden="true">→</span>
        <a href="#school-sources" className="rounded-md px-2 py-1 hover:bg-line/20 hover:text-ink">3 来源</a>
        <span className="ml-auto hidden items-center gap-0.5 text-[9px] text-ink/35 sm:inline-flex">点击跳转 <ChevronRight size={10} aria-hidden="true" /></span>
      </nav>

      {detail && (
        <section aria-label="学校信息摘要" className="shrink-0 border-b border-line/50 bg-cobalt/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cobalt/75">PathOS quick read</p>
              <p className="mt-0.5 text-xs font-medium text-ink">先看结论，再决定要不要深入</p>
            </div>
            <span className="rounded-full border border-cobalt/20 bg-panel/70 px-2 py-1 text-[10px] text-ink/60">已加载完整档案</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="rounded-xl border border-line/40 bg-panel/75 px-2.5 py-2"><span className="block text-ink/45">专业目录</span><strong className="mt-0.5 block text-base text-ink">{detailAny.allMajors?.length ?? 0}<small className="ml-0.5 text-[9px] font-normal text-ink/45">项</small></strong></div>
            <div className="rounded-xl border border-cobalt/15 bg-panel/75 px-2.5 py-2"><span className="block text-ink/45">有依据亮点</span><strong className="mt-0.5 block text-base text-cobalt">{detailAny.programSpotlights?.length ?? 0}<small className="ml-0.5 text-[9px] font-normal text-ink/45">项</small></strong></div>
            <div className="rounded-xl border border-line/40 bg-panel/75 px-2.5 py-2"><span className="block text-ink/45">来源记录</span><strong className="mt-0.5 block text-base text-ink">{detailSources.length || 0}<small className="ml-0.5 text-[9px] font-normal text-ink/45">条</small></strong></div>
          </div>
        </section>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Key facts 2x2 grid */}
        <section id="school-overview" className="scroll-mt-2 grid grid-cols-2 gap-px border-b border-line/50 bg-line/20 text-[11px]">
          <Stat icon={<DollarSign size={12} aria-hidden="true" />} label="年学费" labelEn="Tuition" value={costLabel} />
          <Stat icon={<GraduationCap size={12} aria-hidden="true" />} label="学校排名" labelEn="Rank" value={nationalRank !== null ? `No.${nationalRank}` : rankingLabel} />
          <Stat icon={<BookOpen size={12} aria-hidden="true" />} label="录取率" labelEn="Acceptance" value={
            acceptanceRate !== null && Number.isFinite(acceptanceRate)
              ? `${(acceptanceRate * 100).toFixed(1)}%`
              : missingLabel
          } />
          <Stat icon={<Users size={12} aria-hidden="true" />} label="本科人数" labelEn="Undergrad" value={
            undergradCount !== null && Number.isFinite(undergradCount) && undergradCount > 0
              ? `${undergradCount.toLocaleString()}`
              : missingLabel
          } />
        </section>

        {/* IECG fill (P1): secondary quick-stats row — only renders when
            the guidePreview has at least one of these facts. */}
        {profile.guidePreview?.hasData && (
          <section className="grid grid-cols-3 gap-px border-b border-line/50 bg-line/20 text-[11px]">
            <Stat icon={<Users size={11} aria-hidden="true" />} label="师生比" labelEn="Student:Faculty" value={sfrLabel} />
            <Stat icon={<GraduationCap size={11} aria-hidden="true" />} label="4 年毕业率" labelEn="4-Yr Grad" value={grad4Label} />
            <Stat icon={<Shield size={11} aria-hidden="true" />} label="大一保留率" labelEn="Retention" value={retentionLabel} />
          </section>
        )}

        {/* Detail area */}
        <section className="space-y-3 px-4 py-3 text-[12px]">
          {detailState.state.status === "loading" && (
            <div role="status" aria-label="正在加载学校详情" className="space-y-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-line/50 bg-paper/60 p-2.5 text-[11px] text-ink/55">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" /> 正在加载学校详情…
              </div>
              <div aria-hidden="true" className="space-y-2 rounded-xl border border-line/40 bg-paper/35 p-3">
                <div className="h-3 w-28 animate-pulse rounded bg-ink/10" />
                <div className="h-2.5 w-full animate-pulse rounded bg-ink/8" />
                <div className="h-2.5 w-4/5 animate-pulse rounded bg-ink/8" />
                <div className="flex gap-2 pt-1"><div className="h-7 w-24 animate-pulse rounded-lg bg-ink/8" /><div className="h-7 w-32 animate-pulse rounded-lg bg-ink/8" /></div>
              </div>
            </div>
          )}
          {detailState.state.status === "error" && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-persimmon/30 bg-persimmon/10 p-2.5 text-[11px] text-persimmon" role="alert">
              <span>详情连接暂时失败，尚未获取的数据会在重试后显示。</span>
              <button type="button" onClick={detailState.reload} className="shrink-0 rounded border border-persimmon/40 px-2 py-1 font-semibold hover:bg-persimmon/10">重试</button>
            </div>
          )}
          {detail && <div id="school-programs" className="scroll-mt-2"><UniversityPrograms key={detail.id} detail={detail} /></div>}
          {warnings.length > 0 && (
            <div className="rounded-lg border border-persimmon/30 bg-persimmon/10 p-2.5 text-[11px] leading-relaxed text-persimmon">
              <div className="flex items-center gap-1 font-semibold">
                <AlertTriangle size={11} aria-hidden="true" /> 数据警示
              </div>
              <p className="mt-1">
                当前已记录 {warnings.length} 项数据来源待补强。具体字段请以「未报告」标识为准。
              </p>
            </div>
          )}
          {hasPartialGuide && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300" role="status">
              <div className="flex items-center gap-1 font-semibold">
                <BookOpen size={11} aria-hidden="true" /> 官方目录资料已接入（部分）
              </div>
              <p className="mt-1">专业目录与官方链接已核验；费用、录取率、申请截止日等未标明的字段仍在补充，暂不作为结论。</p>
            </div>
          )}

          {detailState.state.status === "ready" && (detailSources.length > 0 || retrievedOn) && (
            <div id="school-sources" className="scroll-mt-2 rounded-lg border border-line/50 bg-paper/60 p-2.5 text-[11px] leading-relaxed text-ink/65">
              <p className="font-semibold text-ink/75">数据来源与更新时间</p>
              <p className="mt-0.5">来源 {detailSources.length || 1} 个 · {retrievedOn ? `基础数据最近采集 ${retrievedOn}` : "更新时间未报告"}</p>
              {detailSources[0]?.url && (
                <a href={detailSources[0].url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-cobalt hover:underline">
                  <ExternalLink size={10} aria-hidden="true" /> 查看原始来源
                </a>
              )}
            </div>
          )}

          {/* IECG fill (P1): 申请要点 + 课程链接 — parents & counselors can read
              deadlines / academic system at a glance. */}
          {(deadlineLabel !== "数据补充中" || systemLabel !== "数据补充中" || curriculumUrl) && (
            <div className="rounded-lg border border-cobalt/20 bg-cobalt/5 p-2.5 text-[11px] leading-relaxed text-ink/72">
              <p className="flex items-center gap-1 font-semibold text-cobalt">
                <Sparkles size={11} aria-hidden="true" /> 申请要点
              </p>
              <div className="mt-1 space-y-0.5">
                {deadlineLabel !== "数据补充中" && (
                  <p><span className="text-ink/44">申请截止 </span><span className="font-medium">{deadlineLabel}</span></p>
                )}
                {systemLabel !== "数据补充中" && (
                  <p><span className="text-ink/44">学制 </span><span className="font-medium">{systemLabel}</span></p>
                )}
                {curriculumUrl && (
                  <p>
                    <a href={curriculumUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-cobalt hover:underline">
                      <ExternalLink size={10} aria-hidden="true" /> 课程体系原文
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Prose block: ranking summary, plus a "what we report" footer. */}
          <div className="rounded-lg bg-paper/80 p-2.5 text-[11px] leading-relaxed text-ink/65">
            <p>{emptyReport(rankingLabel, "未在当前排名范围")}。地理坐标 {(summary.latitude ?? "未报告").toString()} / {(summary.longitude ?? "未报告").toString()}。</p>
            {detail?.warnings && detail.warnings.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[10px] text-ink/50">
                {detail.warnings.slice(0, 3).map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ── Action footer ── */}
      <footer className="flex shrink-0 gap-2 border-t border-line/50 bg-paper/60 px-3 py-2.5">
        <button
          type="button"
          disabled={!onAddToCompare && !onRemoveFromCompare}
          onClick={() => (inCompare ? onRemoveFromCompare?.() : onAddToCompare?.())}
          className={
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition " +
            (inCompare
              ? "border-jade/40 bg-jade/8 text-jade hover:bg-jade/12"
              : "border-line/60 bg-white text-ink/72 hover:border-cobalt/30 hover:bg-cobalt/5 hover:text-cobalt")
          }
        >
          {inCompare ? (
            <>
              <CheckSmall /> 已加入对比
            </>
          ) : (
            <>
              <Sparkles size={12} aria-hidden="true" /> 加入对比
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onViewProfile}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cobalt/30 bg-cobalt/5 px-3 py-1.5 text-[11px] font-semibold text-cobalt transition hover:border-cobalt/45 hover:bg-cobalt/10"
        >
          <ExternalLink size={12} aria-hidden="true" /> 完整档案
        </button>
      </footer>
    </div>
  );
}

function Stat({ icon, label, labelEn, value }: { icon: React.ReactNode; label: string; labelEn: string; value: string }) {
  return (
    <div className="flex items-start gap-2 bg-panel px-3 py-2">
      <div className="mt-0.5 text-ink/40">{icon}</div>
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-wide text-ink/45">
          {label}<span className="ml-0.5 font-normal normal-case text-ink/30" lang="en">{labelEn}</span>
        </p>
        <p className="mt-0.5 truncate text-[12px] font-semibold text-ink" title={value}>{value}</p>
      </div>
    </div>
  );
}

function CheckSmall() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default UniversityProfile;

// Re-export the cost label helper for backwards compatibility with
// existing callers (Calculator, ComparePanel) that imported from
// legacy-mappers.
export type { legacyPoiAnnualCostLabel } from "@/lib/legacy-mappers";
