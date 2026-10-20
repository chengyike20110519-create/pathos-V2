"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useProgramOptions } from "@/hooks/use-data-source";
import { useDataSource } from "@/services/data-source-provider";
import { programDefinition } from "@/lib/university-programs";

export default function MapProgramFilter({ selected, onSelect }: { selected: string | null; onSelect: (name: string | null) => void }) {
  const [query, setQuery] = useState("");
  const translated = programDefinition(query)?.nameEn.split("/")[0].trim();
  const result = useProgramOptions(useDataSource(), translated ?? query);
  return <section aria-label="专业筛选面板" className="absolute right-0 top-full mt-2 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line/70 bg-panel shadow-panel">
    <div className="border-b border-line/50 p-3">
      <h2 className="text-sm font-semibold text-ink">先选专业，再找学校</h2>
      <label className="mt-2 flex items-center gap-2 rounded-lg border border-line/70 bg-paper/70 px-2.5 py-2 focus-within:border-cobalt/50 focus-within:ring-2 focus-within:ring-focus-ring/40"><Search size={14} aria-hidden="true" /><input autoFocus value={query} maxLength={240} onChange={(event) => setQuery(event.target.value)} aria-label="搜索地图专业" placeholder="计算机科学 / Symbolic Systems" className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none" /></label>
      <p className="mt-2 text-[10px] leading-relaxed text-ink/50">匹配目录中的同名项目；数量为全库已收录学校数，不是专业实力排名。</p>
    </div>
    <button type="button" onClick={() => onSelect(null)} className="w-full border-b border-line/50 px-3 py-2 text-left text-xs text-cobalt hover:bg-cobalt/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">不限专业{!selected ? " ✓" : ""}</button>
    <div className="max-h-[min(320px,38dvh)] overflow-y-auto p-1" aria-live="polite">
      {result.state.status === "loading" || result.state.status === "idle" ? <p role="status" className="p-4 text-xs text-ink/50">正在读取专业选项…</p> : result.state.status === "error" ?
        <button onClick={result.reload} className="m-3 rounded border border-line px-3 py-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">专业选项加载失败，重试</button> :
        result.state.data.length === 0 ? <p className="p-4 text-xs leading-relaxed text-ink/55">未找到匹配的已收录名称，试试官方英文专业名。</p> :
        <ul aria-label="专业选项">{result.state.data.map((option) => <li key={option.name}><button type="button" onClick={() => onSelect(option.name)} aria-pressed={selected === option.name}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-ink hover:bg-cobalt/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
          <span className="min-w-0"><span className="block">{programDefinition(option.name)?.nameZh ?? option.name}</span>{programDefinition(option.name) && <span className="mt-0.5 block text-[10px] text-ink/45">{option.name}</span>}</span>
          <span className="shrink-0 text-[10px] text-ink/55">{option.schoolCount} 校{selected === option.name ? " ✓" : ""}</span>
        </button></li>)}</ul>}
    </div>
    <p className="border-t border-line/50 px-3 py-2 text-[10px] text-ink/40">最多显示 60 项；主辅修、学位及课程以各校目录为准。</p>
  </section>;
}
