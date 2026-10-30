"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, BookOpen, Check, ChevronRight, Loader2, MapPin, Plus, RefreshCw, X } from "lucide-react";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversityDetail } from "@/hooks/use-data-source";
import type { UniversitySummary } from "@/domain/dataset";
import { schoolProgramNames } from "@/lib/university-programs";
import { getSchoolNamePair } from "@/lib/school-name";
import { UniversityPrograms } from "./UniversityPrograms";
import { CampusGallery } from "./CampusGallery";
import styles from "./UniversityProfile.module.css";

export interface UniversityProfileProps {
  summary: UniversitySummary;
  inCompare?: boolean;
  onAddToCompare?: () => void;
  onRemoveFromCompare?: () => void;
  onViewProfile?: () => void;
  onClose: () => void;
}

const TABS = [
  { id: "overview", label: "概览" },
  { id: "programs", label: "专业" },
  { id: "sources", label: "数据来源" },
] as const;
type ProfileTab = typeof TABS[number]["id"];

function sourceName(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "原始来源"; }
}

function sourceStatusLabel(status: string) {
  switch (status) {
    case "live_verified_exact": return "已核验 · 原文对应";
    case "live_verified_normalized": return "已核验 · 已标准化";
    case "live_unavailable": return "暂时无法访问";
    case "source_review_not_completed": return "待复核";
    case "page_changed": return "页面已变化";
    case "archived_source": return "历史来源";
    default: return "来源状态待确认";
  }
}

export function UniversityProfile({ summary, inCompare = false, onAddToCompare, onRemoveFromCompare, onViewProfile, onClose }: UniversityProfileProps) {
  const dataSource = useDataSource();
  const resource = useUniversityDetail(dataSource, summary.id);
  const detail = resource.state.status === "ready" && resource.state.data?.id === summary.id ? resource.state.data : null;
  const sharedContent = detail?.sharedContent;
  const profile = detail ?? summary;
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [coverHidden, setCoverHidden] = useState(false);
  const autoRetryIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const names = getSchoolNamePair(summary);
  const title = names.zh;
  const loading = !detail && resource.state.status !== "error";
  const missing = loading ? "加载中" : resource.state.status === "error" ? "暂未获取" : "暂未收录";

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { setActiveTab("overview"); setCoverHidden(false); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [summary.id]);

  // A cold Supabase pooler connection can fail once while waking up. Retry
  // exactly once after a short pause, then leave the explicit retry button
  // available; this avoids both a dead card and an infinite request loop.
  useEffect(() => {
    if (resource.state.status !== "error" || autoRetryIdRef.current === summary.id) return;
    autoRetryIdRef.current = summary.id;
    const timer = window.setTimeout(() => resource.reload(), 900);
    return () => window.clearTimeout(timer);
  }, [resource.state.status, resource.reload, summary.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = activeTab === "overview" ? 0 : headerRef.current?.offsetHeight ?? 0;
  }, [activeTab]);

  function changeTab(tab: ProfileTab) {
    setActiveTab(tab);
    if (scrollRef.current) scrollRef.current.scrollTop = tab === "overview" ? 0 : headerRef.current?.offsetHeight ?? 0;
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.focus({ preventScroll: true });
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    changeTab(TABS[next].id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus({ preventScroll: true });
  }

  const official = detail?.officialResearch ?? summary.officialResearch;
  const summaryAcceptance = typeof summary.acceptanceRate === "number" && Number.isFinite(summary.acceptanceRate)
    ? (summary.acceptanceRate > 1 ? summary.acceptanceRate / 100 : summary.acceptanceRate)
    : undefined;
  const acceptance = detail?.previewMetadata?.admissions?.acceptanceRate?.value ?? official?.acceptanceRate ?? summaryAcceptance;
  const acceptanceReferenceYear = detail?.previewMetadata?.admissions?.acceptanceRate?.referenceYear ?? summary.acceptanceReferenceYear;
  const acceptanceNote = acceptanceReferenceYear
    ? `学校整体口径 · 数据年度 ${acceptanceReferenceYear}`
    : "学校整体口径 · 年份见数据来源";
  const undergrads = official?.undergraduateEnrollment ?? detail?.previewMetadata?.enrollment?.undergraduate?.value ?? profile.enrollmentSummary?.undergraduate;
  const enrollmentReferenceYear = detail?.previewMetadata?.enrollment?.undergraduate?.referenceYear;
  const enrollmentNote = enrollmentReferenceYear
    ? `在校本科生 · 数据年度 ${enrollmentReferenceYear}`
    : "在校本科生 · 年份见数据来源";
  const guideRankText = profile.guidePreview?.usNewsRanks?.overall?.replace(/^#\s*/, "").trim();
  const guideRank = guideRankText && /^\d+$/.test(guideRankText) ? Number(guideRankText) : undefined;
  const storedRank = profile.rankingSummary?.nationalRank ?? profile.nationalRanking;
  const rank = storedRank ?? guideRank;
  const rankRecord = detail?.ranking.find((item) => item.scope === "national" && Number(item.position) === rank);
  const rankFromGuide = storedRank == null && guideRank != null;
  const programs = detail ? schoolProgramNames(detail) : [];
  const officialTuition = official?.tuitionOutOfState;
  const guideTuition = profile.guidePreview?.tuition?.total;
  const costValue = typeof officialTuition === "number" && officialTuition > 0
    ? `$${Math.round(officialTuition).toLocaleString("en-US")}`
    : guideTuition || profile.costSummary?.displayLabel || missing;
  const costAcademicYear = profile.costSummary?.academicYear;
  const costNote = typeof officialTuition === "number" && officialTuition > 0
    ? `美元 / 年 · 州外口径${costAcademicYear ? ` · 学年 ${costAcademicYear}` : " · 学年见数据来源"}`
    : "费用口径见数据来源";
  const hasTuition = (typeof officialTuition === "number" && officialTuition > 0) || !!guideTuition;
  const location = [profile.city, profile.state].filter(Boolean).join(" · ") || "位置资料待补充";
  const hasMissingOverviewMetric = !hasTuition || !(typeof rank === "number" && rank > 0) || !(typeof acceptance === "number" && Number.isFinite(acceptance) && acceptance >= 0 && acceptance <= 1) || !(typeof undergrads === "number" && Number.isFinite(undergrads) && undergrads > 0);
  const studyFacts = [
    ["师生比", profile.guidePreview?.studentFacultyRatio],
    ["四年毕业率", profile.guidePreview?.graduationRate4Yr],
    ["大一保留率", profile.guidePreview?.freshmanRetentionRate],
    ["学制", profile.guidePreview?.academicSystem],
    ["申请截止", profile.guidePreview?.applicationDeadlines],
  ].filter((row): row is [string, string] => typeof row[1] === "string" && !!row[1].trim() && row[1] !== "数据补充中");

  // Collect the sources actually attached to the displayed facts.
  const sourceMap = new Map<string, { url: string; label: string; date?: string }>();
  for (const source of detail?.sources ?? []) sourceMap.set(source.url, { url: source.url, label: sourceName(source.url), date: source.retrievedAt });
  if (official?.sourceUrl) sourceMap.set(official.sourceUrl, { url: official.sourceUrl, label: "学校基础数据 · College Scorecard", date: official.retrievedOn ?? undefined });
  if (profile.guidePreview?.curriculumUrl) sourceMap.set(profile.guidePreview.curriculumUrl, { url: profile.guidePreview.curriculumUrl, label: "学校课程目录" });
  for (const item of detail?.programSpotlights ?? []) sourceMap.set(item.sourceUrl, { url: item.sourceUrl, label: `${item.nameZh || item.name} · 专业依据`, date: item.checkedOn });
  for (const image of detail?.campusImages ?? []) {
    if (image.reviewStatus === "approved" && image.licenseStatus === "verified") sourceMap.set(image.sourceUrl, { url: image.sourceUrl, label: "校园照片 · " + image.publisher, date: image.checkedOn });
  }
  const sources = [...sourceMap.values()];
  const refreshedOn = official?.retrievedOn;

  return (
    <section role="dialog" aria-modal="false" aria-busy={loading} aria-label={`${title} 详细信息`} className={`${styles.card} pointer-events-auto`}>
      <div ref={scrollRef} data-university-scroll onScroll={(event) => setCoverHidden(event.currentTarget.scrollTop >= (headerRef.current?.offsetHeight ?? Infinity))} className={`${styles.scrollArea} overflow-y-auto overscroll-contain`}>
      <header ref={headerRef} className={styles.header}>
        <CampusGallery key={summary.id} images={detail?.campusImages} loading={loading}>
          <div className={styles.identity}>
            <p className={styles.location}><MapPin size={12} aria-hidden="true" />{location}</p>
            <h2 id={`${uid}-title`} className={styles.schoolName}>{title}</h2>
            <p lang="en" className={styles.englishName}>{names.en}</p>
          </div>
        </CampusGallery>
      </header>

      <div className={styles.tabs}>
      <div className={styles.tabContent}>
      {coverHidden && <p className={styles.stickyTitle}>{title}</p>}
      <div ref={tabsRef} role="tablist" aria-label="学校信息" className={styles.tabsInner}>
        {TABS.map((tab, index) => (
          <button key={tab.id} type="button" role="tab" data-tab={tab.id} id={`${uid}-${tab.id}-tab`} aria-selected={activeTab === tab.id} aria-controls={`${uid}-${tab.id}-panel`} tabIndex={activeTab === tab.id ? 0 : -1} onKeyDown={(event) => handleTabKey(event, index)} onClick={() => changeTab(tab.id)} className={styles.tab}>
            {tab.label}{tab.id === "programs" && detail && <span className={styles.tabCount}>{programs.length}</span>}
          </button>
        ))}
      </div>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭学校详情" className={styles.closeButton}><X size={17} aria-hidden="true" /></button>
      </div>

        <div role="tabpanel" id={`${uid}-${activeTab}-panel`} aria-labelledby={`${uid}-${activeTab}-tab`} tabIndex={0} className={styles.tabPanel}>
          {loading && <div role="status" className={styles.detailProgress}><Loader2 size={14} className="animate-spin" aria-hidden="true" /><span><strong>基础信息已显示</strong><small>正在补充学校概括、专业和数据来源…</small></span></div>}
          {resource.state.status === "error" && <div role="alert" className={styles.loadNotice}><span>详情暂时未能加载，已获取的基本信息仍可查看。</span><button type="button" onClick={resource.reload}><RefreshCw size={13} aria-hidden="true" />重试</button></div>}

          {activeTab === "overview" && <>
            {detail && <section className={styles.secondarySection} aria-label="学校概括">
              <p className={styles.eyebrow}>学校概括</p>
              {sharedContent && sharedContent.mottoStatus !== "rejected" && <div className={styles.bodyCopy} aria-label="校训 / Motto">
                <p><strong>校训 / Motto</strong></p>
                {sharedContent.mottoZh ? <p>中文：{sharedContent.mottoZh}</p> : <p>中文：暂未核验</p>}
                {sharedContent.motto && sharedContent.motto !== sharedContent.mottoZh ? <p lang="en">English: {sharedContent.motto}</p> : <p lang="en">English: 暂未核验</p>}
                {sharedContent.mottoStatus === "confirmed" && <small>已按来源核验 · {sharedContent.mottoCheckedOn ?? "日期未记录"}</small>}
                {sharedContent.mottoStatus === "candidate" && <small>候选资料，待学校官网复核</small>}
                {sharedContent.mottoStatus === "pending" && <small>当前没有足够可靠来源，不使用推测内容</small>}
              </div>}
              <p className={styles.bodyCopy}>{sharedContent?.overviewZh || "该校简介尚未完成核实，暂不展示未经确认的内容。"}</p>
            </section>}
            {loading && <section className={styles.loadingOverview} aria-label="正在加载学校概括" aria-hidden="true">
              <span className={styles.skeletonLineShort} />
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLineMedium} />
            </section>}
            <dl className={styles.stats} aria-label="学校关键数据">
              <Stat label={hasTuition ? `年学费${officialTuition ? "（美元）" : ""}` : "年费用参考"} value={costValue} note={costNote} />
              <Stat label="综合排名" value={typeof rank === "number" && rank > 0 ? `#${rank}` : (loading ? missing : "暂未核验")} note={rankRecord ? `${rankRecord.system} ${rankRecord.year} · 全美` : rankFromGuide ? "IECG 2025 参考资料 · 待官方复核" : "当前没有可追溯的全美综合排名"} />
              <Stat label="本科录取率" value={typeof acceptance === "number" && Number.isFinite(acceptance) && acceptance >= 0 && acceptance <= 1 ? `${(acceptance * 100).toFixed(1)}%` : missing} note={acceptanceNote} />
              <Stat label="本科生人数" value={typeof undergrads === "number" && Number.isFinite(undergrads) && undergrads > 0 ? undergrads.toLocaleString("en-US") : missing} note={enrollmentNote} />
            </dl>
            {hasMissingOverviewMetric && !loading && <p className={styles.dataStatusNote} role="note">“暂未收录”表示当前核验到的公开来源没有发布该字段；不会用估算值填充。若显示“暂未获取”，可点击上方重试。</p>}
            {detail ? <UniversityPrograms key={`${detail.id}-preview`} detail={detail} variant="preview" onViewAll={() => changeTab("programs")} /> : loading && <SummaryProgramPreview programs={summary.topPrograms ?? []} onViewAll={() => changeTab("programs")} />}
            {studyFacts.length > 0 && <section className={styles.secondarySection} aria-label="学习与申请">
              <h3 className={styles.sectionTitle}>学习与申请</h3>
              <dl className={styles.factList}>{studyFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            </section>}
            <button type="button" className={styles.provenanceLink} onClick={() => changeTab("sources")}><BookOpen size={14} aria-hidden="true" /><span>查看数据口径与原始来源</span><ChevronRight size={14} aria-hidden="true" /></button>
          </>}

          {activeTab === "programs" && (detail ? <UniversityPrograms key={`${detail.id}-programs`} detail={detail} /> : loading && <SummaryProgramPreview programs={summary.topPrograms ?? []} onViewAll={() => undefined} full />)}

          {activeTab === "sources" && <section aria-label="数据来源与口径" className={styles.sources}>
            <div><p className={styles.eyebrow}>认识数据，再做判断</p><h3 className={styles.panelTitle}>每条信息，都有出处</h3><p className={styles.bodyCopy}>不同字段可能来自不同年份。下方日期表示资料采集或核验时间，具体统计年度以原文为准。</p></div>
            <dl className={styles.scopeList}>
              <div><dt>学费</dt><dd>{officialTuition ? "展示州外学费口径；住宿、生活费与其他费用需另计。" : "以所列来源的费用范围为准。"}</dd></div>
              <div><dt>录取率</dt><dd>学校整体本科录取口径，不等同于国际生或某一专业的录取率。</dd></div>
              <div><dt>专业</dt><dd>「优势」附专业级排名依据；「特色」介绍项目特点。完整目录保留全部已收录专业。</dd></div>
            </dl>
            {loading && <LoadingContent />}
            {sources.length > 0 && <div><h4 className={styles.sectionTitle}>原始来源 <span className={styles.muted}>{sources.length}</span></h4><ul className={styles.sourceList}>{sources.map((source) => {
              const reference = detail?.sources.find((item) => item.url === source.url);
              return <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer"><span><strong>{source.label}</strong><small>{sourceName(source.url)}{source.date ? ` · ${source.date.slice(0, 10)}` : ""}{reference ? ` · ${sourceStatusLabel(reference.status)}` : ""}</small></span><ArrowUpRight size={16} aria-hidden="true" /></a></li>;
            })}</ul></div>}
            {!loading && sources.length === 0 && <p className={styles.bodyCopy}>暂未获取到来源记录，请稍后重试。</p>}
            {refreshedOn && <p className={styles.muted}>基础资料采集于 {refreshedOn.slice(0, 10)}</p>}
            {!!profile.qualitySummary?.warningCodes?.length && <p className={styles.bodyCopy}>部分字段仍待补充，缺失项已在对应位置标注。</p>}
          </section>}
        </div>
      </div>

      <footer className={styles.footer}>
        <button type="button" disabled={inCompare ? !onRemoveFromCompare : !onAddToCompare} aria-pressed={inCompare} onClick={() => inCompare ? onRemoveFromCompare?.() : onAddToCompare?.()} className={`${styles.compareButton} ${inCompare ? styles.compared : ""}`}>{inCompare ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{inCompare ? "已加入对比" : "加入对比"}</button>
        <button type="button" onClick={onViewProfile} disabled={!onViewProfile} className={styles.primaryButton}>完整学校档案<ArrowUpRight size={16} aria-hidden="true" /></button>
      </footer>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.stat} title={note}><dt>{label}</dt><dd className={/^[$#\d]/.test(value) ? styles.statNumber : styles.statEmpty}>{value}</dd><p className="sr-only">{note}</p></div>;
}

function LoadingContent() {
  return <div role="status" aria-label="正在加载学校详情" className={styles.loading}><span><Loader2 size={14} className="animate-spin" aria-hidden="true" />正在读取学校资料</span><div aria-hidden="true" className={styles.skeleton} /><div aria-hidden="true" className={styles.skeleton} /></div>;
}

function SummaryProgramPreview({ programs, onViewAll, full = false }: { programs: readonly string[]; onViewAll: () => void; full?: boolean }) {
  const visible = programs.filter(Boolean).slice(0, full ? 8 : 3);
  return <section className={styles.summaryPrograms} aria-label="已收录专业预览">
    <div className={styles.sectionHeading}><div><h3 className={styles.sectionTitle}>专业预览</h3><p className={styles.catalogNote}>先显示学校摘要中的已收录项目，完整目录正在读取</p></div>{!full && <button type="button" onClick={onViewAll} className={styles.textButton}>查看专业 <ChevronRight size={14} aria-hidden="true" /></button>}</div>
    {visible.length > 0 ? <ul className={styles.summaryProgramList}>{visible.map((program) => <li key={program}>{program}</li>)}</ul> : <p className={styles.bodyCopy}>专业目录正在读取中。</p>}
    <div className={styles.summaryProgramLoading}><Loader2 size={13} className="animate-spin" aria-hidden="true" />正在补充完整目录与专业依据…</div>
  </section>;
}

export default UniversityProfile;
export type { legacyPoiAnnualCostLabel } from "@/lib/legacy-mappers";
