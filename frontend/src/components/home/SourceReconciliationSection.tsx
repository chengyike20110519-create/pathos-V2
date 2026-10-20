"use client";

import {
  ArrowUpRight,
  BookOpenText,
  GitCompareArrows,
  Sigma,
} from "lucide-react";
import Link from "next/link";
import styles from "@/app/home.module.css";

type SourceId = "us-news" | "qs" | "the";
type Confidence = "high" | "mid" | "low";

const SOURCE_META: Record<SourceId, { label: string; color: string }> = {
  "us-news": { label: "US News", color: "cobalt" },
  qs: { label: "QS World", color: "persimmon" },
  the: { label: "THE", color: "jade" },
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "高置信（gap ≤ 5）",
  mid: "中等置信（gap 5–15）",
  low: "仅展示（gap > 15）",
};

const SAMPLES = [
  {
    schoolId: "harvard-university",
    nameZh: "哈佛大学",
    nameEn: "Harvard University",
    reconciledRank: 3,
    sources: [
      { source: "us-news" as const, rank: 3, weight: 0.4 },
      { source: "qs" as const, rank: 4, weight: 0.35 },
      { source: "the" as const, rank: 2, weight: 0.25 },
    ],
    note: "三源位次 2–4 之间，调和位列全国第 3，置信度高。",
    confidence: "high" as Confidence,
  },
  {
    schoolId: "stanford-university",
    nameZh: "斯坦福大学",
    nameEn: "Stanford University",
    reconciledRank: 6,
    sources: [
      { source: "us-news" as const, rank: 6, weight: 0.4 },
      { source: "qs" as const, rank: 5, weight: 0.35 },
      { source: "the" as const, rank: 3, weight: 0.25 },
    ],
    note: "QS 与 US News 接近，THE 把它推得更高，调和后列第 6。",
    confidence: "high" as Confidence,
  },
  {
    schoolId: "university-of-chicago",
    nameZh: "芝加哥大学",
    nameEn: "University of Chicago",
    reconciledRank: 12,
    sources: [
      { source: "us-news" as const, rank: 12, weight: 0.4 },
      { source: "qs" as const, rank: 21, weight: 0.35 },
      { source: "the" as const, rank: 7, weight: 0.25 },
    ],
    note: "QS 把它放在 21 位，THE 推至第 7；差异显著，仅作展示。",
    confidence: "low" as Confidence,
  },
] as const;

const PRINCIPLES = [
  {
    title: "三源全部摆出来",
    body: "US News / QS / THE 各有方法论；我们不藏任何一个。",
    icon: GitCompareArrows,
  },
  {
    title: "差异越大置信越低",
    body: "三源差距 ≤5 显示高置信，5–15 显示中置信，>15 仅展示原始位次。",
    icon: Sigma,
  },
  {
    title: "点击进学校看完整证据链",
    body: "调和位次只是入口；每所学校页面有原始分数、置信度和最新更新日期。",
    icon: BookOpenText,
  },
] as const;

export function SourceReconciliationSection() {
  return (
    <section
      className={styles.reconcile}
      aria-labelledby="reconcile-title"
      data-section="reconcile" data-chapter-target="reconcile"
    >
      <span className={styles.chapterMarker} aria-hidden="true">04 / 14</span>
      <div className={styles.sectionHeading} data-reveal="true">
        <p>ONE SOURCE / MANY OPINIONS</p>
        <h2 id="reconcile-title" data-reveal="true" data-heading-stagger="true">把不同榜单的差异摊开来看，再做决定。</h2>
        <p className={styles.sectionLead}>
          每所学校的调和位次 = US News × 0.4 + QS × 0.35 + THE × 0.25。差距越大，置信度越低。
        </p>
      </div>

      <div className={styles.reconcileGrid}>
        {SAMPLES.map((s, idx) => {
          const delay = String(Math.min(idx * 120, 360));
          return (
            <article
              key={s.schoolId}
              className={styles.reconcileCard}
              data-reveal="true"
              data-reveal-delay={delay}
            >
              <header className={styles.reconcileCardHead}>
                <span className={styles.reconcileCardEyebrow}>案例 {String(idx + 1).padStart(2, "0")}</span>
                <h3 className={styles.reconcileCardTitle}>{s.nameZh}</h3>
                <p className={styles.reconcileCardEn}>{s.nameEn}</p>
              </header>
              <table className={styles.reconcileTable}>
                <tbody>
                  {s.sources.map((row) => {
                    const meta = SOURCE_META[row.source];
                    return (
                      <tr key={row.source} className={styles.reconcileRow} data-row="body">
                        <td className={styles.reconcileSourceLabel} data-source={row.source}>
                          <span className={styles.reconcileSourceDot} data-source={row.source} aria-hidden="true" />
                          {meta.label}
                        </td>
                        <td className={styles.reconcileRank}>#{row.rank}</td>
                        <td className={styles.reconcileWeight}>w {row.weight}</td>
                      </tr>
                    );
                  })}
                  <tr className={styles.reconcileRow} data-row="total">
                    <td className={styles.reconcileSourceLabel}>调和位次</td>
                    <td className={styles.reconcileRank} colSpan={2}>#{s.reconciledRank}</td>
                  </tr>
                </tbody>
              </table>
              <p className={styles.reconcileNote}>{s.note}</p>
              <div
                className={styles.reconcileConfidence}
                data-confidence={s.confidence}
                role="status"
              >
                <span aria-hidden="true" className={styles.reconcileConfidenceDot} data-confidence={s.confidence} />
                {CONFIDENCE_LABEL[s.confidence]}
              </div>
              <Link href={`/university/${s.schoolId}`} className={styles.reconcileLink}>
                查看完整证据链 <ArrowUpRight aria-hidden="true" size={14} />
              </Link>
            </article>
          );
        })}
      </div>

      <div className={styles.reconcilePrinciples}>
        {PRINCIPLES.map((p, idx) => {
          const Icon = p.icon;
          const delay = String(360 + idx * 80);
          return (
            <div
              key={p.title}
              className={styles.reconcilePrinciple}
              data-reveal="true"
              data-reveal-delay={delay}
            >
              <span className={styles.reconcilePrincipleIcon}>
                <Icon aria-hidden="true" size={18} />
              </span>
              <h3 className={styles.reconcilePrincipleTitle}>{p.title}</h3>
              <p className={styles.reconcilePrincipleBody}>{p.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
