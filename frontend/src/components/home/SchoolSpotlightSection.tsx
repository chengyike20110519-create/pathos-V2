"use client";

// SchoolSpotlightSection — tabbed spotlight for the four school
// archetypes Chinese families ask about most. Modeled after the
// bestieu.com "探索国际升学" pattern: one eyebrow, a tab strip
// (顶尖综合 / 理工强校 / 文理学院 / 公立旗舰), and a 2×4 grid of
// university cards that swap in with a fade when the active tab
// changes. Each card shows rank tier, zh + en name, location,
// cost band, and acceptance — every field is "暂无" rather than
// fabricated when the upstream is missing.
//
// Why a separate component rather than reusing FeaturedSchoolsSection:
//   Spotlight is an *editorial* curation (the 4 archetype tabs),
//   while Featured is the data-driven top-6 list. Sharing one
//   component would force the editorial logic into the dynamic
//   component and blur the missing-first contract. Keeping them
//   separate also lets us style the spotlight cards with a
//   larger, image-block layout that the 6-card list can't carry.

import Link from "next/link";
import { ArrowUpRight, MapPin, Wallet, Sparkles, Atom, BookOpenText, Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { UniversitySummary } from "@/domain/dataset";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversitySummaries } from "@/hooks/use-data-source";
import styles from "@/app/home.module.css";

type SpotlightTabId = "comprehensive" | "stem" | "liberal" | "public";

interface SpotlightTab {
  id: SpotlightTabId;
  label: string;
  eyebrow: string;
  description: string;
  icon: ReactNode;
  predicate: (s: UniversitySummary) => boolean;
}

const SPOTLIGHT_TABS: SpotlightTab[] = [
  {
    id: "comprehensive",
    label: "顶尖综合",
    eyebrow: "COMPREHENSIVE",
    description: "US News 排名前 50 的研究型大学，覆盖文理工商全学科。",
    icon: <Sparkles aria-hidden="true" size={15} />,
    predicate: (s) => {
      const tier = s.rankingSummary?.rankingTier ?? s.rankingTier;
      return tier === "top20" || tier === "top50";
    },
  },
  {
    id: "stem",
    label: "理工强校",
    eyebrow: "STEM STRONG",
    description: "CS / 工程 / 数学方向常驻 Top 30 的工程强校。",
    icon: <Atom aria-hidden="true" size={15} />,
    predicate: (s) => {
      const tier = s.rankingSummary?.rankingTier ?? s.rankingTier;
      if (tier !== "top20" && tier !== "top50" && tier !== "top100") return false;
      const programs = (s.topPrograms ?? []).map((p) => p.toLowerCase());
      return programs.some((p) =>
        p.includes("computer") ||
        p.includes("engineering") ||
        p.includes("math") ||
        p.includes("physics") ||
        p.includes("science"),
      );
    },
  },
  {
    id: "liberal",
    label: "文理学院",
    eyebrow: "LIBERAL ARTS",
    description: "小班教学 + 通识课程，注重本科学术体验的文理学院。",
    icon: <BookOpenText aria-hidden="true" size={15} />,
    predicate: (s) => {
      const tier = s.rankingSummary?.rankingTier ?? s.rankingTier;
      // Liberal-arts colleges typically appear with moderate national
      // rank and small enrollment. Without a separate school-type tag
      // we approximate by rank-band + name heuristics.
      if (!tier) return false;
      const programs = (s.topPrograms ?? []).map((p) => p.toLowerCase());
      const humanities = programs.some((p) =>
        p.includes("liberal") || p.includes("art") || p.includes("history") || p.includes("literature"),
      );
      const enrollment = s.enrollmentSummary?.total ?? null;
      const smallSchool = typeof enrollment === "number" && enrollment > 0 && enrollment < 6000;
      return humanities || smallSchool;
    },
  },
  {
    id: "public",
    label: "公立旗舰",
    eyebrow: "PUBLIC FLAGSHIP",
    description: "州内旗舰，性价比突出，录取口径相对友好。",
    icon: <Building2 aria-hidden="true" size={15} />,
    predicate: (s) => {
      const tier = s.rankingSummary?.rankingTier ?? s.rankingTier;
      const rate = s.acceptanceRate;
      return (
        tier === "top50" ||
        tier === "top100" ||
        (typeof rate === "number" && rate >= 35)
      );
    },
  },
];

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

function formatAcceptance(summary: UniversitySummary): string {
  const rate = summary.acceptanceRate;
  if (typeof rate !== "number") return "暂无";
  return `${rate.toFixed(1)}%`;
}

function formatRank(summary: UniversitySummary): string {
  const tier = summary.rankingSummary?.rankingTier ?? summary.rankingTier;
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

export function SchoolSpotlightSection() {
  const source = useDataSource();
  const { state } = useUniversitySummaries(source);
  const [activeTab, setActiveTab] = useState<SpotlightTabId>("comprehensive");

  const all = state.status === "ready" ? state.data : [];
  const activeConfig = SPOTLIGHT_TABS.find((t) => t.id === activeTab)!;
  const matches = all.filter(activeConfig.predicate).slice(0, 8);

  return (
    <section
      className={styles.spotlight}
      aria-labelledby="spotlight-title"
      data-section="spotlight" data-chapter-target="spotlight"
    >
      <span className={styles.chapterMarker} aria-hidden="true">05 / 14</span>
      <div className={styles.spotlightInner}>
        <div className={styles.spotlightHeader}>
          <div className={styles.sectionHeading} data-reveal="true">
            <p>SCHOOL SPOTLIGHT</p>
            <h2
              id="spotlight-title"
              data-reveal="true"
              data-heading-stagger="true"
            >
              按家庭最常问的四类院校切到对应切片。
            </h2>
            <p className={styles.sectionLead}>
              每个 tab 都是一份精选列表，缺失字段保持缺失语义。
            </p>
          </div>

          <div className={styles.spotlightTabs} role="tablist" aria-label="院校类型切换">
            {SPOTLIGHT_TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="spotlight-panel"
                  className={`${styles.spotlightTab} ${
                    isActive ? styles.spotlightTabActive : ""
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                  data-reveal="true"
                  data-reveal-delay={String(SPOTLIGHT_TABS.indexOf(tab) * 80 + 80)}
                >
                  <span className={styles.spotlightTabIcon}>{tab.icon}</span>
                  <span className={styles.spotlightTabLabel}>{tab.label}</span>
                  <span className={styles.spotlightTabEyebrow}>{tab.eyebrow}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          id="spotlight-panel"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className={styles.spotlightPanel}
          key={activeTab}
        >
          <p className={styles.spotlightPanelLead} data-reveal="true">
            {activeConfig.description}
          </p>

          {matches.length === 0 ? (
            <p className={styles.spotlightEmpty} data-reveal="true" data-reveal-delay="80">
              暂无匹配的院校数据。
            </p>
          ) : (
            <ul
              className={styles.spotlightGrid}
              data-reveal="true"
              data-reveal-delay="160"
            >
              {matches.map((summary, idx) => {
                const delay = String(Math.min(idx * 60, 480));
                return (
                  <li
                    key={summary.id}
                    data-reveal="true"
                    data-reveal-delay={delay}
                    style={{ listStyle: "none" }}
                  >
                    <Link
                      href={`/university/${summary.id}`}
                      className={styles.spotlightCard}
                    >
                      <div className={styles.spotlightCardHead}>
                        <span className={styles.spotlightRank}>{formatRank(summary)}</span>
                        <ArrowUpRight aria-hidden="true" size={16} />
                      </div>
                      <h3 className={styles.spotlightCardName}>
                        {formatName(summary)}
                      </h3>
                      {formatEnglishName(summary) ? (
                        <p className={styles.spotlightCardNameEn}>
                          {formatEnglishName(summary)}
                        </p>
                      ) : null}
                      <dl className={styles.spotlightCardFacts}>
                        <div className={styles.spotlightCardFact}>
                          <dt>
                            <MapPin aria-hidden="true" size={13} /> 录取率
                          </dt>
                          <dd>{formatAcceptance(summary)}</dd>
                        </div>
                        <div className={styles.spotlightCardFact}>
                          <dt>
                            <Wallet aria-hidden="true" size={13} /> 费用区间
                          </dt>
                          <dd>{formatCost(summary)}</dd>
                        </div>
                      </dl>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
