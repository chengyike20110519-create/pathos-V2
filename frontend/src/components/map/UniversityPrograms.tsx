"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { ProgramSpotlight, UniversityDetail } from "@/domain/dataset";
import { normalizeProgramName, programDefinition, programExploreHref, schoolProgramNames } from "@/lib/university-programs";
import styles from "./UniversityProfile.module.css";

export function UniversityPrograms({ detail, variant = "full", onViewAll }: { detail: UniversityDetail; variant?: "preview" | "full"; onViewAll?: () => void }) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const catalogRef = useRef<HTMLElement>(null);
  const names = useMemo(() => schoolProgramNames(detail), [detail]);
  const highlights = detail.programSpotlights ?? [];
  const translatedName = (name: string) => highlights.find((item) => normalizeProgramName(item.name) === normalizeProgramName(name))?.nameZh || programDefinition(name)?.nameZh;
  const strengths = highlights.filter((item) => item.kind === "strength");
  const distinctive = highlights.filter((item) => item.kind === "distinctive");
  // Reserve space for distinctive programs even when many ranked programs exist.
  const preview = [...strengths.slice(0, distinctive.length ? 1 : 2), ...distinctive.slice(0, 1)];
  const filtered = names.filter((name) => `${name} ${translatedName(name) ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  function browseCatalog() {
    const catalog = catalogRef.current;
    const scroller = catalog?.closest<HTMLElement>("[data-university-scroll]");
    if (catalog && scroller) {
      scroller.scrollTop += catalog.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 88;
    }
  }

  if (variant === "preview") return <section className={styles.programPreview} aria-label="专业亮点">
    <div className={styles.sectionHeading}><h3 className={styles.sectionTitle}>值得关注的专业</h3><button type="button" onClick={onViewAll} className={styles.textButton}>全部 {names.length} 项<ChevronRight size={14} aria-hidden="true" /></button></div>
    {preview.length > 0 ? <div className={styles.previewList}>{preview.map((program) => <Spotlight key={program.name} program={program} universityId={detail.id} compact />)}</div> : <p className={styles.bodyCopy}>专业亮点尚待补充，可先浏览学校已收录的专业目录。</p>}
    <button type="button" onClick={onViewAll} className={styles.exploreButton}><span><strong>找到适合你的专业</strong><small>浏览完整目录，了解专业与相关院校</small></span><ArrowRight size={18} aria-hidden="true" /></button>
  </section>;

  return <section aria-label="学校专业" className={styles.programs}>
    <div><p className={styles.eyebrow}>从兴趣出发</p><h3 className={styles.panelTitle}>在这里，可以学什么？</h3><p className={styles.bodyCopy}>点击专业，了解学习内容与开设该专业的其他学校。</p>
      <label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="搜索学校专业" placeholder="搜索专业名称，中英文均可" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(20); }} />{query && <button type="button" aria-label="清除专业搜索" onClick={() => { setQuery(""); setVisibleCount(20); }}><X size={14} aria-hidden="true" /></button>}</label>
      {!query && <button type="button" className={styles.textButton} onClick={browseCatalog}>直接浏览全部 {names.length} 项<ChevronRight size={14} aria-hidden="true" /></button>}
    </div>
    {!query && strengths.length > 0 && <section aria-label="优势专业"><h4 className={styles.sectionTitle}>优势专业<span className={styles.sectionSubtitle}>附专业级排名依据</span></h4><div className={styles.spotlightList}>{strengths.map((program) => <Spotlight key={program.name} program={program} universityId={detail.id} />)}</div></section>}
    {!query && distinctive.length > 0 && <section aria-label="学校特色专业"><h4 className={styles.sectionTitle}>这所学校的特色<span className={styles.sectionSubtitle}>从项目本身认识学校</span></h4><div className={styles.spotlightList}>{distinctive.map((program) => <Spotlight key={program.name} program={program} universityId={detail.id} />)}</div></section>}
    <section ref={catalogRef} aria-label="完整专业目录" className={styles.catalog}>
      <div className={styles.sectionHeading}><h4 className={styles.sectionTitle}>全部专业</h4><span className={styles.muted}>{names.length} 项已收录</span></div>
      <p className={styles.catalogNote}>{query ? `找到 ${filtered.length} 项匹配专业` : "按名称排列 · 学位与主辅修以学校目录为准"}</p>
      <ul className={styles.programList} aria-label="全部学校专业">{filtered.slice(0, visibleCount).map((name) => {
        const translated = translatedName(name);
        return <li key={name}><Link prefetch={false} href={programExploreHref(name, detail.id)}><span><strong>{translated || name}</strong>{translated && <small lang="en">{name}</small>}</span><ArrowUpRight size={15} aria-hidden="true" /></Link></li>;
      })}</ul>
      {filtered.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 20)} className={styles.moreButton}>继续查看 · 还有 {filtered.length - visibleCount} 项<ChevronDown size={15} aria-hidden="true" /></button>}
      {!filtered.length && <div className={styles.emptySearch}><Search size={23} aria-hidden="true" /><p>{names.length ? "没有找到匹配的专业" : "专业目录暂待补充"}</p>{names.length > 0 && <small>试试英文名称，或缩短关键词。</small>}</div>}
    </section>
  </section>;
}

function Spotlight({ program, universityId, compact = false }: { program: ProgramSpotlight; universityId: string; compact?: boolean }) {
  const strength = program.kind === "strength";
  return <article className={`${styles.spotlight} ${compact ? styles.compactSpotlight : ""}`}>
    <Link prefetch={false} href={programExploreHref(program.name, universityId)} className={styles.spotlightLink}>
      <div className={styles.spotlightMeta}><span className={strength ? styles.strengthLabel : styles.distinctiveLabel}>{strength ? "优势专业" : "特色项目"}</span>{strength && <span>{program.rankingYear} · {program.tied ? "并列 " : ""}#{program.rank}</span>}</div>
      <div className={styles.spotlightTitle}><h4>{program.nameZh || program.name}</h4><ArrowUpRight size={16} aria-hidden="true" /></div>
      {!compact && program.nameZh && <p lang="en" className={styles.spotlightEnglish}>{program.name}</p>}
      <p className={styles.spotlightReason}>{program.reason}</p>
    </Link>
    {!compact && <details className={styles.evidence}><summary>查看依据<ChevronDown size={12} aria-hidden="true" /></summary><div><p>{program.reason}</p>{strength && <p>{program.rankingPublisher} · {program.rankingYear} · 本科专业排名{program.tied === null ? "；原文未注明是否并列" : ""}</p>}<a href={program.sourceUrl} target="_blank" rel="noopener noreferrer">学校官方来源<ArrowUpRight size={12} aria-hidden="true" /></a><span>核验于 {program.checkedOn}</span></div></details>}
  </article>;
}
