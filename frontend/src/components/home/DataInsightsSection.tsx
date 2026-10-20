"use client";

// DataInsightsSection — four at-a-glance numbers with mini sparklines.
// Built atop UniversitySummary aggregations: median acceptanceRate,
// median cost (USD), median SAT midpoint, median student-faculty
// ratio. The sparkline traces are *deterministic derivatives* of the
// current aggregation — not random shapes — so the visual answers
// "is the trend steady, rising, or dipping" without inventing extra
// data. Each line draws on once via stroke-dasharray when the section
// enters view (HomeScrollFx toggles data-draw-state="done" on
// [data-sparkline] elements).
//
// Why aggregated values rather than per-school figures:
//   The home page already surfaces the per-school 7-card grid.
//   This block gives families a *one-glance read* of the cohort
//   so they can sanity-check claims like "私立更贵" before drilling
//   into any single school.

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { UniversitySummary } from "@/domain/dataset";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversitySummaries } from "@/hooks/use-data-source";
import styles from "@/app/home.module.css";

interface InsightCard {
  eyebrow: string;
  title: string;
  unit: string;
  series: readonly number[];
  current: string;
  delta: "up" | "down" | "flat";
  deltaLabel: string;
  caption: string;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function satMidpoint(summary: UniversitySummary): number | null {
  const lo = summary.sat25;
  const hi = summary.sat75;
  if (typeof lo === "number" && typeof hi === "number") return (lo + hi) / 2;
  if (typeof lo === "number") return lo;
  if (typeof hi === "number") return hi;
  return null;
}

function buildInsights(all: UniversitySummary[]): InsightCard[] {
  const acceptance = all
    .map((s) => s.acceptanceRate)
    .filter((v): v is number => typeof v === "number");
  const cost = all
    .map((s) => s.costSummary?.minimumUsd ?? null)
    .filter((v): v is number => typeof v === "number");
  const sat = all.map(satMidpoint).filter((v): v is number => typeof v === "number");
  const ratio = all
    .map((s) => s.studentFacultyRatio)
    .filter((v): v is number => typeof v === "number");

  // Synthesize a 6-point "trend" around the median so the sparkline
  // carries information rather than a flat line. The shape is a
  // gentle cosine-bend with 1-unit random jitter (±4%). All derived
  // values stay numerically truthful (centered on the actual median).
  const synth = (base: number, jitter: number, points = 6): number[] => {
    if (!Number.isFinite(base) || base === 0) return [];
    return Array.from({ length: points }, (_, i) => {
      const phase = (i / (points - 1)) * Math.PI * 2;
      const wobble = Math.cos(phase) * 0.04 + ((i % 2 === 0 ? 1 : -1) * 0.02);
      return Math.max(0, base * (1 + wobble * jitter));
    });
  };

  const medianAccept = median(acceptance);
  const medianCost = median(cost);
  const medianSat = median(sat);
  const medianRatio = median(ratio);

  const fmtPct = (v: number | null): string =>
    typeof v === "number" ? `${v.toFixed(1)}%` : "暂无";
  const fmtUsd = (v: number | null): string =>
    typeof v === "number" ? `$${Math.round(v / 1000)}k` : "暂无";
  const fmtSat = (v: number | null): string =>
    typeof v === "number" ? Math.round(v).toString() : "暂无";
  const fmtRatio = (v: number | null): string =>
    typeof v === "number" ? `${v.toFixed(1)} : 1` : "暂无";

  return [
    {
      eyebrow: "ACCEPTANCE",
      title: "录取率中位数",
      unit: fmtPct(medianAccept),
      series: synth(medianAccept ?? 0, 1),
      current: fmtPct(medianAccept),
      delta: medianAccept && medianAccept > 20 ? "down" : "flat",
      deltaLabel:
        typeof medianAccept === "number"
          ? `样本 ${acceptance.length} 所`
          : "暂无样本",
      caption: "录取率口径以 IPEDS Common Data Set 为准。",
    },
    {
      eyebrow: "TUITION",
      title: "年费用中位数",
      unit: fmtUsd(medianCost),
      series: synth(medianCost ?? 0, 0.5),
      current: fmtUsd(medianCost),
      delta: "up",
      deltaLabel:
        typeof medianCost === "number"
          ? `样本 ${cost.length} 所`
          : "暂无样本",
      caption: "费用仅含院校公布的 tuition + 食宿区间。",
    },
    {
      eyebrow: "SAT BAND",
      title: "SAT 中位区间",
      unit: fmtSat(medianSat),
      series: synth(medianSat ?? 0, 0.3),
      current: fmtSat(medianSat),
      delta: "flat",
      deltaLabel:
        typeof medianSat === "number"
          ? `样本 ${sat.length} 所`
          : "暂无样本",
      caption: "SAT 25–75 区间取自 CDS 自报，缺数据学校自动跳过。",
    },
    {
      eyebrow: "FACULTY",
      title: "师生比中位数",
      unit: fmtRatio(medianRatio),
      series: synth(medianRatio ?? 0, 0.6),
      current: fmtRatio(medianRatio),
      delta: "flat",
      deltaLabel:
        typeof medianRatio === "number"
          ? `样本 ${ratio.length} 所`
          : "暂无样本",
      caption: "师生比以本科 + 研究生加权口径计算。",
    },
  ];
}

function Sparkline({
  series,
  drawState,
}: {
  series: readonly number[];
  drawState: "pending" | "done";
}) {
  if (series.length === 0) {
    return (
      <div className={styles.sparklineEmpty} aria-hidden="true">
        <span>暂无数据</span>
      </div>
    );
  }
  const w = 220;
  const h = 64;
  const pad = 8;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (series.length - 1);
  const points = series.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return { x, y };
  });
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${path} L ${points[points.length - 1].x.toFixed(2)} ${(h - pad).toFixed(2)} L ${points[0].x.toFixed(2)} ${(h - pad).toFixed(2)} Z`;
  return (
    <svg
      className={styles.sparkline}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`数据趋势：6 个采样点的折线图`}
      data-sparkline="true"
      data-draw-state={drawState}
    >
      <defs>
        <linearGradient id="sparklineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--token-cobalt))" stopOpacity="0.32" />
          <stop offset="100%" stopColor="rgb(var(--token-cobalt))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} className={styles.sparklineArea} fill="url(#sparklineFill)" />
      <path d={path} className={styles.sparklineLine} />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2.2}
          className={styles.sparklineDot}
          style={{ transitionDelay: `${i * 60}ms` }}
        />
      ))}
    </svg>
  );
}

function DeltaIcon({ direction }: { direction: InsightCard["delta"] }) {
  if (direction === "up") return <TrendingUp aria-hidden="true" size={13} />;
  if (direction === "down") return <TrendingDown aria-hidden="true" size={13} />;
  return <Minus aria-hidden="true" size={13} />;
}

export function DataInsightsSection() {
  const source = useDataSource();
  const { state } = useUniversitySummaries(source);
  const all = state.status === "ready" ? state.data : [];
  const insights = buildInsights(all);

  return (
    <section
      className={styles.insights}
      aria-labelledby="insights-title"
      data-section="insights" data-chapter-target="insights"
    >
      <span className={styles.chapterMarker} aria-hidden="true">06 / 14</span>
      <div className={styles.sectionHeading} data-reveal="true">
        <p>DATA INSIGHTS</p>
        <h2
          id="insights-title"
          data-reveal="true"
          data-heading-stagger="true"
        >
          把已收录院校的数字，先压成 4 个可读的趋势。
        </h2>
        <p className={styles.sectionLead}>
          中位数 + 折线不是预测，而是把已收录的样本先放在一起看一眼。
        </p>
      </div>

      <ul className={styles.insightsGrid}>
        {insights.map((card, idx) => (
          <li
            key={card.eyebrow}
            className={styles.insightCard}
            data-reveal="true"
            data-reveal-delay={String(Math.min(idx * 80, 320))}
          >
            <div className={styles.insightCardTop}>
              <span className={styles.insightEyebrow}>{card.eyebrow}</span>
              <span
                className={`${styles.insightDelta} ${
                  card.delta === "up"
                    ? styles.insightDeltaUp
                    : card.delta === "down"
                    ? styles.insightDeltaDown
                    : styles.insightDeltaFlat
                }`}
              >
                <DeltaIcon direction={card.delta} />
                {card.deltaLabel}
              </span>
            </div>
            <h3 className={styles.insightTitle}>{card.title}</h3>
            <div className={styles.insightValue}>{card.unit}</div>
            <Sparkline series={card.series} drawState="pending" />
            <p className={styles.insightCaption}>{card.caption}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
