"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Globe, ExternalLink } from "lucide-react";
import Image from "next/image";
import {
  DataLoadingState,
  DataUnavailableState,
  DataEmptyState,
} from "@/components/shared/data-states";
import PageMotion from "@/components/shared/PageMotion";

const POPULAR_FALLBACK: Uni[] = [
  { id: "fb-princeton", slug: "princeton-university", name: "普林斯顿大学", nameEn: "Princeton University", country: "美国", countryCode: "US", rank: 1, logoUrl: "" },
  { id: "fb-mit", slug: "massachusetts-institute-of-technology", name: "麻省理工学院", nameEn: "Massachusetts Institute of Technology", country: "美国", countryCode: "US", rank: 2, logoUrl: "" },
  { id: "fb-stanford", slug: "stanford-university", name: "斯坦福大学", nameEn: "Stanford University", country: "美国", countryCode: "US", rank: 3, logoUrl: "" },
  { id: "fb-harvard", slug: "harvard-university", name: "哈佛大学", nameEn: "Harvard University", country: "美国", countryCode: "US", rank: 4, logoUrl: "" },
  { id: "fb-yale", slug: "yale-university", name: "耶鲁大学", nameEn: "Yale University", country: "美国", countryCode: "US", rank: 5, logoUrl: "" },
];

interface Uni { id: string; slug: string; name: string; nameEn: string; country: string; countryCode: string; rank: number; logoUrl: string; }

const COUNTRY_FLAGS: Record<string, string> = {
  "美国": "🇺🇸",
  "英国": "🇬🇧",
  "澳大利亚": "🇦🇺",
  "加拿大": "🇨🇦",
  "德国": "🇩🇪",
  "日本": "🇯🇵",
  "中国": "🇨🇳",
  "法国": "🇫🇷",
  "新加坡": "🇸🇬",
  "中国香港": "🇭🇰",
};

export default function XuanxiaoPage() {
  // First-paint shows a curated short list so the grid never feels empty
  // during the cold API request; real data replaces this list as soon as it lands.
  const [unis, setUnis] = useState<Uni[]>(POPULAR_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");

  const loadUnis = useCallback(function() {
    setLoading(true);
    setError("");
    fetch("/api/xuanxiao/universities")
      .then(function(r) { return r.json(); })
      .then(function(res) { if (res.success) setUnis(res.data); else setError(res.error || "加载失败"); })
      ["catch"](function(e) { setError(e.message); })
      .finally(function() { setLoading(false); });
  }, []);

  useEffect(() => {
    loadUnis();
  }, [loadUnis]);

  const countrySet: string[] = [];
  unis.forEach(function(u) {
    if (u.country && countrySet.indexOf(u.country) === -1) countrySet.push(u.country);
  });
  const countries = countrySet.sort();

  const filtered = unis.filter(function(u) {
    if (search && u.name.indexOf(search) === -1 && u.nameEn.toLowerCase().indexOf(search.toLowerCase()) === -1) return false;
    if (selectedCountry && u.country !== selectedCountry) return false;
    return true;
  });

  return (
    <PageMotion>
    <div className="min-h-screen bg-surface-base">
      <header className="border-b border-border-soft bg-surface-1/70 backdrop-blur" data-reveal="true">
        <div className="mx-auto flex max-w-page items-center gap-3 px-4 py-3 sm:px-6">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-cobalt text-paper"><Globe size={16} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-label uppercase tracking-[0.12em] text-cobalt">全球大学库</p>
            <h1 className="text-page text-text-primary" data-heading-stagger="true">数据合作方 · 选校</h1>
          </div>
          <Link href="/match" className="ml-auto text-caption font-semibold text-cobalt hover:underline">← 返回自主测验</Link>
        </div>
      </header>
      <main className="mx-auto max-w-page px-4 py-5 sm:px-6">
        <div data-reveal="true" data-reveal-delay="60" className="mb-6 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
            <input type="text" value={search} onChange={function(e) { setSearch(e.target.value); }}
              placeholder="搜索大学..."
              className="w-full rounded-lg border border-line/60 bg-white/90 py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-cobalt/50" />
          </div>
          <select value={selectedCountry} onChange={function(e) { setSelectedCountry(e.target.value); }}
            className="rounded-lg border border-line/60 bg-white/90 px-3 py-2.5 text-sm text-ink outline-none focus:border-cobalt/50">
            <option value="">全部国家</option>
            {countries.map(function(c) { return (<option key={c} value={c}>{(COUNTRY_FLAGS[c] || "") + " " + c}</option>); })}
          </select>
        </div>

        {loading && <DataLoadingState message="正在加载全球大学库…" />}
        {error && <DataUnavailableState reason={error} onRetry={loadUnis} />}

        {!loading && !error && (
          <>
            <p data-reveal="true" data-reveal-delay="120" className="mb-4 text-xs text-ink/40">共 <span data-counter={String(filtered.length)} data-counter-format="locale" className="page-motion-stat-value font-semibold text-cobalt">{filtered.length}</span> 所大学</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-reveal="true">
              {filtered.map(function(u) {
                return (
                  <a key={u.id} href={"https://xuanxiao.org/universities/" + u.slug}
                    target="_blank" rel="noopener noreferrer"
                    className="group rounded-xl border border-line/40 bg-white/90 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-cobalt/30">
                    <div className="flex items-start justify-between mb-3">
                      {u.logoUrl ? (
                        <Image src={u.logoUrl} alt={u.name} width={40} height={40} unoptimized className="w-10 h-10 rounded-lg object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-ink/5 flex items-center justify-center text-lg">{u.name.charAt(0)}</div>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">#{u.rank || "?"}</span>
                        <ExternalLink size={12} className="text-ink/20 group-hover:text-cobalt transition-colors" />
                      </div>
                    </div>
                    <h3 className="text-sm font-semibold text-ink group-hover:text-cobalt transition-colors line-clamp-1">{u.name}</h3>
                    {u.nameEn && <p className="text-xs text-ink/40 mt-0.5">{u.nameEn}</p>}
                    <p className="mt-1.5 text-xs text-ink/50">{(COUNTRY_FLAGS[u.country] || u.countryCode) + " " + u.country}</p>
                  </a>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <DataEmptyState
                title="未找到匹配的大学"
                description="请尝试清空筛选条件,或更换关键词。"
              />
            )}
          </>
        )}

        <div data-reveal="true" data-reveal-delay="160" className="mt-10 rounded-xl border border-line/40 bg-white/80 p-4 text-center text-xs text-ink/40">
          数据由 <a href="https://xuanxiao.org" target="_blank" rel="noopener noreferrer" className="text-cobalt hover:underline">选校</a> 提供 · 点击卡片查看详细排名和信息
        </div>
      </main>
    </div>
    </PageMotion>
  );
}
