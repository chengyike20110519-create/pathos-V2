"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowUpRight, ChevronDown, Search, Sparkles } from "lucide-react";
import type { UniversityDetail } from "@/domain/dataset";
import { normalizeProgramName, programDefinition, programExploreHref, schoolProgramNames } from "@/lib/university-programs";

export function UniversityPrograms({ detail }: { detail: UniversityDetail }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const programListId = useId();
  const names = schoolProgramNames(detail);
  const highlights = (detail.programSpotlights ?? []).filter((program) => names.some((name) => normalizeProgramName(name) === normalizeProgramName(program.name)));
  const strengths = highlights.filter((program) => program.kind === "strength");
  // Legacy topPrograms are navigation suggestions, not evidence of strength.
  const available = new Set(names.map(normalizeProgramName));
  const previews = [...new Set(detail.topPrograms ?? [])].filter((name) => available.has(normalizeProgramName(name))).slice(0, 3);
  const previewNames = previews.length ? previews : names.slice(0, 3);
  const filtered = names.filter((name) => `${name} ${programDefinition(name)?.nameZh ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  function chip(name: string) {
    const translated = programDefinition(name)?.nameZh;
    return <li key={name}><Link prefetch={false} href={programExploreHref(name, detail.id)}
      className="inline-flex items-center gap-1 rounded-lg border border-line/60 bg-paper/60 px-2.5 py-1.5 text-xs text-ink/80 transition hover:border-cobalt/50 hover:text-cobalt focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt">
      {translated ? `${translated} · ${name}` : name}<ArrowUpRight size={11} aria-hidden="true" />
    </Link></li>;
  }

  return <section aria-label="学校专业" className="space-y-3" key={detail.id}>
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">先看专业</h3>
        <span className="rounded-full border border-line/60 bg-paper/70 px-2 py-0.5 text-[10px] text-ink/55">目录 {names.length} 项</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink/50">先看有来源的优势或特色，再展开完整目录。开设不等于优势，学校总排名也不代表专业排名。</p>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="专业数据说明">
        <span className="inline-flex items-center gap-1 rounded-full bg-cobalt/10 px-2 py-1 text-[10px] text-cobalt"><span className="h-1.5 w-1.5 rounded-full bg-cobalt" />已核验依据</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-jade/10 px-2 py-1 text-[10px] text-jade"><span className="h-1.5 w-1.5 rounded-full bg-jade" />官方特色</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-line/35 px-2 py-1 text-[10px] text-ink/50"><span className="h-1.5 w-1.5 rounded-full bg-ink/35" />完整目录</span>
      </div>
    </div>
    {strengths.length > 0 && <div className="rounded-xl border border-cobalt/25 bg-cobalt/5 p-3">
      <h4 className="flex items-center gap-1 text-xs font-semibold text-cobalt"><Sparkles size={12} aria-hidden="true" />有依据的优势专业</h4>
      <p className="mt-1 text-[10px] leading-relaxed text-ink/50">已核验 {strengths.length} 项 · 本科专业榜单 · 非平台自评。排名按条目标注年份，学校综合排名不代替专业排名。</p>
      <ul aria-label="优势专业" className="mt-2 divide-y divide-cobalt/10">{strengths.map((program) => <li key={program.name} className="py-2.5">
        <div className="flex items-start justify-between gap-2"><Link prefetch={false} href={programExploreHref(program.name, detail.id)} className="text-xs font-semibold text-ink hover:text-cobalt">{program.nameZh || program.name}<ArrowUpRight size={11} className="ml-1 inline" aria-hidden="true" /></Link><span className="shrink-0 text-[10px] font-semibold text-cobalt">{program.rankingYear} 本科 {program.tied ? "并列" : ""}#{program.rank}</span></div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink/65">{program.reason}</p>
        <a href={program.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] text-cobalt hover:underline">{program.rankingPublisher} · 学校官方披露 · 核验 {program.checkedOn}</a>
        {program.tied === null && <p className="text-[10px] text-ink/40">披露原文未注明是否并列。</p>}
      </li>)}</ul>
    </div>}
    {highlights.filter((program) => program.kind === "distinctive").map((program) => <article key={program.name} className="rounded-xl border border-cobalt/25 bg-cobalt/5 p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold text-cobalt"><Sparkles size={11} aria-hidden="true" />学校特色 · 编辑精选</p>
      <Link prefetch={false} href={programExploreHref(program.name, detail.id)} className="mt-1 block text-sm font-semibold text-ink hover:text-cobalt">
        {program.nameZh || program.name}<ArrowUpRight size={12} className="ml-1 inline" aria-hidden="true" />
      </Link>
      {program.nameZh && <p className="text-[11px] text-ink/55">{program.name}</p>}
      <p className="mt-1.5 text-xs leading-relaxed text-ink/75">{program.reason}</p>
      <a href={program.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] text-cobalt hover:underline">学校官方来源 · 核验 {program.checkedOn}</a>
    </article>)}
    {highlights.every((program) => program.kind !== "strength") && <div className="rounded-lg border border-line/50 bg-paper/55 px-3 py-2 text-[10px] leading-relaxed text-ink/50"><span className="font-medium text-ink/70">排名状态：</span>尚无已审核的专业级比较依据，暂不排名。</div>}
    {strengths.length === 0 && previewNames.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="专业速览">{previewNames.map(chip)}</ul>}
    <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={programListId}
      className="flex w-full items-center justify-between rounded-lg border border-line/60 px-3 py-2.5 text-xs font-medium text-ink/80 hover:bg-paper/70">
      {expanded ? "收起完整名单" : `查看全部已收录专业（${names.length}）`}<ChevronDown size={14} className={expanded ? "rotate-180" : ""} aria-hidden="true" />
    </button>
    {expanded && <div id={programListId} className="space-y-2">
      <label className="flex items-center gap-2 rounded-lg border border-line/60 bg-paper/60 px-2.5 py-2"><Search size={13} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中英文专业" aria-label="搜索学校专业" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
      <p className="text-[10px] text-ink/45">已收录 {names.length} 项，搜索结果 {filtered.length} 项；学位及主辅修以学校目录为准。没有被标为优势，不代表学校不开设。</p>
      <ul className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto" aria-label="全部学校专业">{filtered.map(chip)}</ul>
      {filtered.length === 0 && <p className="py-3 text-xs text-ink/50">没有匹配的已收录专业，试试英文名称。</p>}
    </div>}
  </section>;
}
