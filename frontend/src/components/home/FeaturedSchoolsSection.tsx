"use client";

// FeaturedSchoolsSection — dynamic list of up to 6 universities, sourced
// from the same data source as the map / search / calculator. Missing
// fields render as 暂无 rather than fabricated placeholders. Each card
// is wrapped with data-reveal so HomeScrollFx picks them up; the card
// index drives the stagger delay.

import Link from "next/link";
import { ArrowUpRight, MapPin, Wallet } from "lucide-react";
import type { UniversitySummary } from "@/domain/dataset";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversitySummaries } from "@/hooks/use-data-source";
import styles from "@/app/home.module.css";


function freshnessFromAsOf(asOf: string | undefined): { level: "fresh" | "aging" | "stale"; label: string } | null {
  if (!asOf) return null;
  const then = new Date(asOf).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 30) return { level: "fresh", label: "近 30 天更新" };
  if (days <= 90) return { level: "aging", label: "30–90 天内" };
  return { level: "stale", label: "超 90 天" };
}

function DataFreshnessDot({ asOf }: { asOf?: string }) {
  const f = freshnessFromAsOf(asOf);
  if (!f) return null;
  return (
    <span
      className={styles.freshnessDot}
      data-freshness={f.level}
      title={asOf ? `最后更新：${asOf}` : undefined}
      aria-label={f.label}
    />
  );
}


const RANK_LABEL: Record<string, string> = {
  top20: "TOP 20",
  top50: "TOP 50",
  top100: "TOP 100",
  other: "RANKED",
};

function formatCost(summary: UniversitySummary): string {
  const cost = summary.costSummary;
  if (!cost) return "暂无";
  const min = cost.minimumUsd;
  const max = cost.maximumUsd;
  if (typeof min === "number" && typeof max === "number") {
    return `$${min.toLocaleString()} – $${max.toLocaleString()}`;
  }
  if (typeof min === "number") return `$${min.toLocaleString()}+`;
  if (typeof max === "number") return `≤ $${max.toLocaleString()}`;
  return cost.displayLabel ?? "暂无";
}

function formatRank(summary: UniversitySummary): string {
  const tier = summary.rankingSummary?.rankingTier;
  if (tier && RANK_LABEL[tier]) return RANK_LABEL[tier];
  const rank = summary.rankingSummary?.nationalRank;
  if (typeof rank === "number") return `#${rank}`;
  return "暂无排名";
}

function formatName(summary: UniversitySummary): string {
  return summary.nameZh || summary.chineseName || summary.name || "未命名院校";
}

function formatEnglishName(summary: UniversitySummary): string {
  return summary.name || "";
}

function formatLocation(summary: UniversitySummary): string {
  return [summary.city, summary.state].filter(Boolean).join(", ");
}

export function FeaturedSchoolsSection() {
  const source = useDataSource();
  const { state } = useUniversitySummaries(source);

  const all = state.status === "ready" ? state.data : [];
  const featured = all.slice(0, 6);

  return (
    <section className="border-b border-border-soft bg-surface-base" aria-labelledby="featured-title" data-section="featured">
      <div className="mx-auto w-full max-w-page px-4 py-10 sm:px-6 lg:py-14">
        <div className="max-w-2xl" data-reveal="true">
          <p className="text-label text-cobalt">FEATURED SCHOOLS</p>
          <h2 id="featured-title" className="mt-2 text-page">先看几所被收录的真实院校。</h2>
          <p className="mt-3 text-body text-text-secondary">
            字段缺失的地方显示「暂无」，不做编造。点击进入学校主页查看完整事实链。
          </p>
        </div>

        {featured.length === 0 ? (
          <p className="mt-6 rounded-card border border-border-soft bg-surface-1 p-5 text-body text-text-secondary" data-reveal="true" data-reveal-delay="80">
            院校数据加载中或暂未收录…
          </p>
        ) : (
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((summary, idx) => {
              const delay = String(Math.min(idx * 60, 480));
              const rank = formatRank(summary);
              const cost = formatCost(summary);
              const zhName = formatName(summary);
              const enName = formatEnglishName(summary);
              const location = formatLocation(summary);
              return (
                <Link
                  key={summary.id}
                  href={`/university/${summary.id}`}
                  className="flex flex-col rounded-card border border-border-soft bg-surface-1 p-5 transition hover:-translate-y-0.5 hover:border-cobalt/40"
                  data-reveal="true"
                  data-reveal-delay={delay}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-caption font-semibold text-cobalt">{rank}<DataFreshnessDot asOf={summary.datasetVersion} /></span>
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </div>
                  <h3 className="mt-3 text-section text-text-primary">{zhName}</h3>
                  {enName ? (
                    <p className="mt-1 truncate text-caption text-text-muted">{enName}</p>
                  ) : null}
                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="flex items-center gap-1.5 text-caption text-text-muted">
                        <MapPin aria-hidden="true" size={13} /> 所在地
                      </dt>
                      <dd className="mt-1 text-body text-text-secondary">{location || "未采集"}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1.5 text-caption text-text-muted">
                        <Wallet aria-hidden="true" size={13} /> 费用区间
                      </dt>
                      <dd className="mt-1 text-body text-text-secondary">{cost}</dd>
                    </div>
                  </dl>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
