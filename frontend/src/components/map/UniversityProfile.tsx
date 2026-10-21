"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, BookOpen, Check, ChevronRight, Loader2, MapPin, Plus, RefreshCw, X } from "lucide-react";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversityDetail } from "@/hooks/use-data-source";
import type { UniversitySummary } from "@/domain/dataset";
import { schoolProgramNames } from "@/lib/university-programs";
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

export function UniversityProfile({ summary, inCompare = false, onAddToCompare, onRemoveFromCompare, onViewProfile, onClose }: UniversityProfileProps) {
  const dataSource = useDataSource();
  const resource = useUniversityDetail(dataSource, summary.id);
  const detail = resource.state.status === "ready" && resource.state.data?.id === summary.id ? resource.state.data : null;
  const profile = detail ?? summary;
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [coverHidden, setCoverHidden] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const title = summary.chineseName || summary.nameZh || summary.name;
  const loading = !detail && resource.state.status !== "error";
  const missing = loading ? "加载中" : resource.state.status === "error" ? "暂未获取" : "暂未收录";

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { setActiveTab("overview"); setCoverHidden(false); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [summary.id]);

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
  const acceptance = detail?.previewMetadata?.admissions?.acceptanceRate?.value ?? official?.acceptanceRate;
  const undergrads = official?.undergraduateEnrollment ?? detail?.previewMetadata?.enrollment?.undergraduate?.value ?? profile.enrollmentSummary?.undergraduate;
  const rank = profile.rankingSummary?.nationalRank ?? profile.nationalRanking;
  const rankRecord = detail?.ranking.find((item) => item.scope === "national" && Number(item.position) === rank);
  const programs = detail ? schoolProgramNames(detail) : [];
  const officialTuition = official?.tuitionOutOfState;
  const guideTuition = profile.guidePreview?.tuition?.total;
  const costValue = typeof officialTuition === "number" && officialTuition > 0
    ? `$${Math.round(officialTuition).toLocaleString("en-US")}`
    : guideTuition || profile.costSummary?.displayLabel || missing;
  const hasTuition = (typeof officialTuition === "number" && officialTuition > 0) || !!guideTuition;
  const location = [profile.city, profile.state].filter(Boolean).join(" · ") || "位置资料待补充";
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
    <section role="dialog" aria-modal="false" aria-label={`${title} 详细信息`} className={`${styles.card} pointer-events-auto`}>
      <div ref={scrollRef} data-university-scroll onScroll={(event) => setCoverHidden(event.currentTarget.scrollTop >= (headerRef.current?.offsetHeight ?? Infinity))} className={`${styles.scrollArea} overflow-y-auto overscroll-contain`}>
      <header ref={headerRef} className={styles.header}>
        <CampusGallery key={summary.id} images={detail?.campusImages}>
          <div className={styles.identity}>
            <p className={styles.location}><MapPin size={12} aria-hidden="true" />{location}</p>
            <h2 id={`${uid}-title`} className={styles.schoolName}>{title}</h2>
            {summary.name && title !== summary.name && <p lang="en" className={styles.englishName}>{summary.name}</p>}
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
          {resource.state.status === "error" && <div role="alert" className={styles.loadNotice}><span>详情暂时未能加载，已获取的基本信息仍可查看。</span><button type="button" onClick={resource.reload}><RefreshCw size={13} aria-hidden="true" />重试</button></div>}

          {activeTab === "overview" && <>
            <dl className={styles.stats} aria-label="学校关键数据">
              <Stat label={hasTuition ? `年学费${officialTuition ? "（美元）" : ""}` : "年费用参考"} value={costValue} note={typeof officialTuition === "number" && officialTuition > 0 ? "美元 / 年 · 州外口径" : "费用口径见数据来源"} />
              <Stat label="综合排名" value={typeof rank === "number" && rank > 0 ? `#${rank}` : "暂未收录"} note={rankRecord ? `${rankRecord.system} ${rankRecord.year} · 全美` : "当前收录的全美排名"} />
              <Stat label="本科录取率" value={typeof acceptance === "number" && Number.isFinite(acceptance) && acceptance >= 0 && acceptance <= 1 ? `${(acceptance * 100).toFixed(1)}%` : missing} note="学校整体口径" />
              <Stat label="本科生人数" value={typeof undergrads === "number" && Number.isFinite(undergrads) && undergrads > 0 ? undergrads.toLocaleString("en-US") : missing} note="在校本科生" />
            </dl>
            {detail ? <UniversityPrograms key={`${detail.id}-preview`} detail={detail} variant="preview" onViewAll={() => changeTab("programs")} /> : loading && <LoadingContent />}
            {studyFacts.length > 0 && <section className={styles.secondarySection} aria-label="学习与申请">
              <h3 className={styles.sectionTitle}>学习与申请</h3>
              <dl className={styles.factList}>{studyFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            </section>}
            <button type="button" className={styles.provenanceLink} onClick={() => changeTab("sources")}><BookOpen size={14} aria-hidden="true" /><span>查看数据口径与原始来源</span><ChevronRight size={14} aria-hidden="true" /></button>
          </>}

          {activeTab === "programs" && (detail ? <UniversityPrograms key={`${detail.id}-programs`} detail={detail} /> : loading && <LoadingContent />)}

          {activeTab === "sources" && <section aria-label="数据来源与口径" className={styles.sources}>
            <div><p className={styles.eyebrow}>认识数据，再做判断</p><h3 className={styles.panelTitle}>每条信息，都有出处</h3><p className={styles.bodyCopy}>不同字段可能来自不同年份。下方日期表示资料采集或核验时间，具体统计年度以原文为准。</p></div>
            <dl className={styles.scopeList}>
              <div><dt>学费</dt><dd>{officialTuition ? "展示州外学费口径；住宿、生活费与其他费用需另计。" : "以所列来源的费用范围为准。"}</dd></div>
              <div><dt>录取率</dt><dd>学校整体本科录取口径，不等同于国际生或某一专业的录取率。</dd></div>
              <div><dt>专业</dt><dd>「优势」附专业级排名依据；「特色」介绍项目特点。完整目录保留全部已收录专业。</dd></div>
            </dl>
            {loading && <LoadingContent />}
            {sources.length > 0 && <div><h4 className={styles.sectionTitle}>原始来源 <span className={styles.muted}>{sources.length}</span></h4><ul className={styles.sourceList}>{sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer"><span><strong>{source.label}</strong><small>{sourceName(source.url)}{source.date ? ` · ${source.date.slice(0, 10)}` : ""}</small></span><ArrowUpRight size={16} aria-hidden="true" /></a></li>)}</ul></div>}
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

export default UniversityProfile;
export type { legacyPoiAnnualCostLabel } from "@/lib/legacy-mappers";
