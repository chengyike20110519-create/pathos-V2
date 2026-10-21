"use client";

import { useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import type { UniversitySummary } from "@/domain/dataset";
import { getSchoolNamePair } from "@/lib/school-name";

export default function MapSchoolList({ schools, selectedId, scope, refreshing, program, topOffset, onSelect, onHover, onClose, onResetScope, onClearProgram, onClearFilters }: {
  schools: UniversitySummary[]; selectedId: string | null; scope: string[] | null; refreshing: boolean; program: string | null;
  onSelect: (school: UniversitySummary) => void; onHover: (id: string | null) => void; onClose: () => void;
  onResetScope: () => void; onClearProgram: () => void; onClearFilters: () => void;
  topOffset: number;
}) {
  const [query, setQuery] = useState("");
  const scoped = scope ? schools.filter((school) => scope.includes(school.id)) : schools;
  const results = scoped.filter((school) => `${school.name} ${school.nameZh} ${school.city ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <section aria-label="学校结果列表" aria-busy={refreshing} onMouseLeave={() => onHover(null)} style={{ top: Math.max(64, topOffset) }}
    className="absolute bottom-3 left-3 top-28 z-map-toolbar flex w-[min(330px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-line/70 bg-panel/95 shadow-panel backdrop-blur lg:left-16 lg:top-16">
    <header className="border-b border-line/50 p-3">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-ink">{scope ? "附近学校" : "学校列表"} <span aria-live="polite" className="text-xs font-normal text-ink/45">{query.trim() ? `${results.length} / ${scoped.length}` : scoped.length} 所</span></h2><button onClick={onClose} aria-label="关闭学校列表" className="grid h-8 w-8 place-items-center rounded-lg text-ink/60 hover:bg-line/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"><X size={15} /></button></div>
      <p className="mt-1 text-[10px] leading-relaxed text-ink/50">{refreshing ? "正在更新；以下暂保留上次结果。" : "点击学校定位并打开信息卡；按英文校名排序。"}</p>
      {program && <div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-[11px] text-cobalt" title={program}>专业：{program}</p><button type="button" onClick={onClearProgram} className="shrink-0 rounded-md px-1.5 py-1 text-[10px] text-cobalt hover:bg-cobalt/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">清除专业</button></div>}
      <label className="mt-2 flex items-center gap-2 rounded-lg border border-line/60 bg-paper/60 px-2.5 py-2 focus-within:border-cobalt/50 focus-within:ring-2 focus-within:ring-focus-ring/40"><Search size={13} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索结果中的学校" placeholder="搜索校名或城市" className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none" /></label>
      {scope && <button onClick={onResetScope} className="mt-2 rounded-md px-1 py-0.5 text-left text-xs text-cobalt hover:bg-cobalt/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">返回全部筛选结果</button>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <ul aria-label="匹配学校">{results.map((school) => <li key={school.id}><button type="button" data-school-row={school.id} aria-pressed={selectedId === school.id} disabled={refreshing}
        onMouseEnter={() => onHover(school.id)} onFocus={() => onHover(school.id)} onBlur={() => onHover(null)} onClick={() => onSelect(school)}
        className={`my-0.5 flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60 ${selectedId === school.id ? "border-cobalt/40 bg-cobalt/10" : "border-transparent hover:border-cobalt/20 hover:bg-cobalt/5"}`}>
        <span className="min-w-0">{(() => { const names = getSchoolNamePair(school); return <><span className="block text-xs font-semibold text-ink">{names.zh}</span><span className="mt-1 block text-[10px] leading-relaxed text-ink/50" lang="en">{names.en}</span></>; })()}<span className="mt-1 block text-[10px] text-ink/45">{[school.city, school.state].filter(Boolean).join(" · ")}</span>{school.topPrograms?.length ? <span className="mt-2 block" aria-label="专业速览"><span className="mb-1 block text-[9px] text-ink/35">专业速览 · 仅作方向提示</span><span className="flex flex-wrap gap-1">{school.topPrograms.slice(0, 2).map((program) => <span key={program} className="max-w-[10rem] truncate rounded-full bg-cobalt/10 px-1.5 py-0.5 text-[9px] text-cobalt">{program}</span>)}</span></span> : <span className="mt-2 block text-[9px] text-ink/35">点击查看学校信息卡</span>}</span><ArrowUpRight size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-cobalt" />
      </button></li>)}</ul>
      {results.length === 0 && (refreshing ? <p role="status" className="px-3 py-8 text-xs text-ink/50">正在读取匹配学校…</p> : <div className="px-3 py-8 text-xs leading-6 text-ink/55"><p>{query ? "没有匹配的校名，试试英文或清空搜索。" : "当前条件下暂无已收录学校，不代表该地区或专业没有大学。"}</p>{!query && <button onClick={onClearFilters} className="mt-3 rounded-lg border border-line px-3 py-2 text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">清除筛选，查看全部学校</button>}</div>)}
    </div>
    {schools.length >= 250 && <p className="border-t border-line/50 p-3 text-[10px] text-ink/50">本次已达 250 校展示上限，请缩小范围继续查看。</p>}
  </section>;
}
