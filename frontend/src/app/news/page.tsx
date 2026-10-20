"use client";

import { useState } from "react";
import { useDataSource } from "@/services/data-source-provider";
import { useNews } from "@/hooks/use-data-source";
import { Newspaper, ExternalLink, ChevronDown, ChevronUp, Clock, Tag } from "lucide-react";
import { DataLoadingState, DataUnavailableState, DataEmptyState } from "@/components/shared/data-states";
import { NewsEntryHero } from "@/components/news/NewsEntryHero";
import PageMotion from "@/components/shared/PageMotion";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import Link from "next/link";

// page-motion.css only ships discrete delay steps, so list stagger has to snap
// to them instead of computing an arbitrary per-item offset.
const REVEAL_STEPS = [80, 160, 240, 320, 400, 480];
function revealDelay(index: number): string {
  return String(REVEAL_STEPS[Math.min(index, REVEAL_STEPS.length - 1)]);
}

const CATEGORY_LABELS: Record<string, string> = {
  admissions: "录取申请", visa: "签证",
  ranking: "排名", life: "留学生活",
  career: "职业发展", policy: "政策动态",
};

const CAT_COLORS: Record<string,string> = {
  admissions: "bg-cobalt/10 text-cobalt", visa: "bg-persimmon/10 text-persimmon",
  ranking: "bg-jade/10 text-jade", life: "bg-emerald-500/10 text-emerald-600",
  career: "bg-purple-500/10 text-purple-600", policy: "bg-amber-500/10 text-amber-600",
};

function fmtDate(iso: string) {
  try {
    var d = new Date(iso);
    return d.getFullYear() + "年" + String(d.getMonth()+1).padStart(2,"0") + "月" + String(d.getDate()).padStart(2,"0") + "日";
  } catch { return iso; }
}

function isUnitedStatesArticle(article: { title?: string; summary?: string; whatChanged?: string }): boolean {
  return /美国|美本|美高|常春藤|Ivy|H-1B|OPT|CPT|SEVIS|F-1|US News/i.test(
    `${article.title ?? ""} ${article.summary ?? article.whatChanged ?? ""}`,
  );
}

export default function NewsPage() {
  var [expandedId, setExpandedId] = useState<string | null>(null);
  var [activeCategory, setActiveCategory] = useState("");

  var dataSource = useDataSource();
  var newsState = useNews(dataSource);
  var loading = newsState.state.status === "loading";
  var articles = newsState.state.status === "ready"
    ? newsState.state.data.filter(isUnitedStatesArticle)
    : [];

  var catSet: string[] = [];
  articles.forEach(function(a: any) {
    if (catSet.indexOf(a.category) === -1) catSet.push(a.category);
  });
  var categories = catSet;
  var filtered = activeCategory ? articles.filter(function(a: any) { return a.category === activeCategory; }) : articles;

  return (
    <PageMotion className="min-h-screen bg-surface-base">
      <NewsEntryHero />
      <div id="news-list" className="mx-auto max-w-page">
      <EnterprisePageHeader
        eyebrow="US Information Feed"
        title="美国信息动态"
        description="只保留与美国本科申请、签证政策、排名数据和校园变化相关的收录内容；其他国家或目的地营销内容不进入这个信息流。"
        icon={Newspaper}
        stats={[
          { label: "当前结果", value: filtered.length },
          { label: "分类", value: categories.length },
          { label: "数据源", value: "Preview 收录" },
          { label: "焦点", value: "美国" },
        ]}
        sourceNote="来源 · 学校/机构公开页面与 QS 公开数据；每条保留原文链接，不把转载内容当 approved fact。"
        actions={
          <>
            <Link href="/search" className="inline-flex min-h-control items-center rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]">全局检索</Link>
            <Link href="/opportunities" className="inline-flex min-h-control items-center rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]">机会动态</Link>
          </>
        }
      />
      <main className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <div className="mb-6 flex flex-wrap gap-2" data-reveal="true">
          <button onClick={function() { setActiveCategory(""); }}
            className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " + (!activeCategory ? "bg-ink text-paper" : "border border-border-soft bg-surface-1 text-text-secondary hover:border-cobalt/40 hover:text-cobalt")}>全部</button>
          {categories.map(function(cat: string) {
            return <button key={cat} onClick={function() { setActiveCategory(cat); }}
              className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " + (activeCategory === cat ? "bg-ink text-paper" : "border border-border-soft bg-surface-1 text-text-secondary hover:border-cobalt/40 hover:text-cobalt")}>{CATEGORY_LABELS[cat] || cat}</button>;
          })}
        </div>
        <p className="mb-4 text-xs text-text-muted" data-reveal="true" data-reveal-delay="80">共 <span data-counter={String(filtered.length)} data-counter-format="locale">{filtered.length}</span> 篇资讯</p>
        {loading && (
          <DataLoadingState message="正在加载留学资讯…" />
        )}
        {newsState.state.status === "error" && (
          <DataUnavailableState
            reason="资讯后端暂不可用,后端准备就绪后将自动恢复。"
            onRetry={() => newsState.reload()}
          />
        )}
        {!loading && newsState.state.status === "ready" && articles.length === 0 && (
          <DataEmptyState
            title="数据补充中"
            description="当前暂无留学资讯,后端持续补充中。"
          />
        )}
        <div className="space-y-3">
          {filtered.map(function(article: any, index: number) {
            var isExpanded = expandedId === article.id;
            return (
              <div key={article.id} className="rounded-xl border border-border-soft bg-surface-1 shadow-sm transition hover:shadow-md" data-reveal="true" data-reveal-delay={revealDelay(index)}>
                <button onClick={function() { setExpandedId(isExpanded ? null : article.id); }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-1 text-sm font-semibold text-text-primary">{article.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                      <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " + (CAT_COLORS[article.category] || "bg-ink/5 text-ink/60")}>
                        <Tag size={10} /> {CATEGORY_LABELS[article.category] || article.category}
                      </span>
                      <span className="flex items-center gap-1"><Clock size={10} /> {fmtDate(article.publishedAt)}</span>
                      <span>{article.source}</span>
                    </div>
                  </div>
                  <div className="mt-1 shrink-0">{isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}</div>
                </button>
                {isExpanded && (
                  <div className="border-t border-border-soft px-4 py-3">
                    <p className="text-xs leading-relaxed text-text-secondary">{article.summary}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <a href={article.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-cobalt/10 px-3 py-1.5 text-[11px] font-medium text-cobalt transition-colors hover:bg-cobalt/20">
                        <ExternalLink size={12} /> 查看原文
                      </a>
                      <span className="text-[10px] text-text-muted">来源: {article.source}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
      </div>
    </PageMotion>
  );
}
