"use client";

// LatestUpdatesSection — shows up to 4 of the most recent news entries
// from the data source. Each item surfaces whatChanged (concise summary)
// and links to the upstream source URL when available. Empty / loading
// states are explicit rather than fabricated.

import Link from "next/link";
import { ArrowUpRight, Calendar } from "lucide-react";
import { useDataSource } from "@/services/data-source-provider";
import { useNews } from "@/hooks/use-data-source";

function formatDate(iso: string): string {
  if (!iso) return "暂无日期";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "暂无日期";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function describe(article: { summary?: string; whatChanged?: string }): string {
  return article.summary || article.whatChanged || "暂无摘要";
}

// The fixture news archive contains research captures from several study
// destinations. The home feed is specifically a US higher-education console;
// keep unrelated destination marketing out rather than presenting it as a
// PathOS update.
function isUnitedStatesUpdate(article: { title?: string }): boolean {
  return /美国|美本|美高|常春藤|Ivy|H-1B|OPT|CPT|SEVIS|F-1|US News/i.test(article.title ?? "");
}

export function LatestUpdatesSection() {
  const source = useDataSource();
  const { state } = useNews(source);

  const all = state.status === "ready" ? state.data.filter(isUnitedStatesUpdate) : [];
  const recent = all.slice(0, 4);

  return (
    <section className="border-b border-border-soft bg-surface-1" aria-labelledby="updates-title" data-section="updates">
      <div className="mx-auto w-full max-w-page px-4 py-10 sm:px-6 lg:py-14">
        <div className="max-w-2xl" data-reveal="true">
          <p className="text-label text-cobalt">LATEST UPDATES</p>
          <h2 id="updates-title" className="mt-2 text-page">最近收录的院校与政策动态。</h2>
          <p className="mt-3 text-body text-text-secondary">
            每条动态都标注了原始来源，方便家长与学生自行核实。
          </p>
        </div>

        {recent.length === 0 ? (
          <p className="rounded-card border border-border-soft bg-surface-base p-5 text-body text-text-secondary" data-reveal="true" data-reveal-delay="80">
            暂无新动态。
          </p>
        ) : (
          <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((article, idx) => {
              const delay = String(Math.min(idx * 80, 320));
              const schoolLabel =
                article.universityNameZh || article.universityName || "通用资讯";
              const title = article.title || "暂无标题";
              const summary = describe(article);
              const date = formatDate(article.publishedAt);
              const linkHref = article.url || `/university/${article.universityId ?? ""}`;
              const external = !!article.url;
              return (
                <li
                  key={article.id}
                  className="flex flex-col rounded-card border border-border-soft bg-surface-base p-5 transition hover:-translate-y-0.5 hover:border-cobalt/40"
                  data-reveal="true"
                  data-reveal-delay={delay}
                >
                  <div className="flex items-center justify-between gap-3 text-caption text-text-muted">
                    <span className="truncate font-semibold text-text-secondary">{schoolLabel}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Calendar aria-hidden="true" size={13} /> {date}
                    </span>
                  </div>
                  <h3 className="mt-3 text-body font-semibold text-text-primary">{title}</h3>
                  <p className="mt-2 flex-1 text-caption text-text-secondary">{summary}</p>
                  <Link
                    href={linkHref}
                    className="mt-4 inline-flex min-h-control-lg items-center gap-1 text-caption font-semibold text-cobalt transition hover:text-cobalt/80"
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer noopener" : undefined}
                  >
                    {external ? "查看来源" : "了解更多"}{" "}
                    <ArrowUpRight aria-hidden="true" size={14} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
