"use client";

// TopicTilesSection — six entry tiles for the topics families most
// commonly ask about. Each tile is a Link into /guides so the tile
// doubles as a category landing: family click → topic page →
// long-form guide. The visual treatment follows bestieu.com's
// "客户案例" pattern (large colored panel + headline + arrow),
// re-skinned to match PathOS's lo-fi tokens (jade/cobalt/persimmon
// accents on a neutral paper background).
//
// Tiles are static + lightweight — no data fetch. The page already
// loads 3-5 dynamic sections; this one stays instant and gives the
// scroll a clear visual landmark.

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  Compass,
  GraduationCap,
  Layers,
  ScrollText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import styles from "@/app/home.module.css";

interface TopicTile {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: ReactNode;
  tone: "jade" | "cobalt" | "persimmon" | "ink";
}

const TOPIC_TILES: readonly TopicTile[] = [
  {
    index: "01",
    eyebrow: "EA / ED",
    title: "提前批到底怎么选？",
    description:
      "EA / ED / REA / RD 四种口径对家庭的实际意义，录取率会改变多少。",
    href: "/guides?topic=ea-ed",
    cta: "进入主题",
    icon: <CalendarClock aria-hidden="true" size={20} />,
    tone: "jade",
  },
  {
    index: "02",
    eyebrow: "CS STRONG",
    title: "CS 强校怎么挑？",
    description:
      "综合大校的 CS 系、文理学院的 CS 路径、公立旗舰的工程学位差异。",
    href: "/topics/cs-engineering",
    cta: "查看 CS 主题",
    icon: <Layers aria-hidden="true" size={20} />,
    tone: "cobalt",
  },
  {
    index: "03",
    eyebrow: "SAFETY",
    title: "校园安全怎么看？",
    description:
      "用州级犯罪数据 + 校园年报做交叉核对，避免单一年份的偏差。",
    href: "/guides?topic=safety",
    cta: "查看安全主题",
    icon: <ShieldCheck aria-hidden="true" size={20} />,
    tone: "persimmon",
  },
  {
    index: "04",
    eyebrow: "AID",
    title: "奖学金与资助政策",
    description:
      "Need-blind / Need-aware 的实际差异，以及中国家庭常见的口径误解。",
    href: "/guides?topic=scholarship",
    cta: "查看奖助主题",
    icon: <Wallet aria-hidden="true" size={20} />,
    tone: "ink",
  },
  {
    index: "05",
    eyebrow: "LIBERAL ARTS",
    title: "文理学院 vs 大校",
    description:
      "课堂规模、学术资源、研究生申请路径的可比较维度。",
    href: "/guides?topic=liberal-arts",
    cta: "查看 LAC 主题",
    icon: <GraduationCap aria-hidden="true" size={20} />,
    tone: "jade",
  },
  {
    index: "06",
    eyebrow: "TIMELINE",
    title: "申请时间线",
    description:
      "9 年级到 12 年级的关键动作清单，配可下载的家庭版 checklist。",
    href: "/guides?topic=timeline",
    cta: "查看时间线",
    icon: <Compass aria-hidden="true" size={20} />,
    tone: "cobalt",
  },
] as const;

function TileIcon({ tile }: { tile: TopicTile }) {
  return (
    <span
      className={`${styles.topicTileIcon} ${
        styles[`topicTileIcon_${tile.tone}` as keyof typeof styles]
      }`}
    >
      {tile.icon}
    </span>
  );
}

export function TopicTilesSection() {
  return (
    <section
      className={styles.topicTiles}
      aria-labelledby="topics-title"
      data-section="topics" data-chapter-target="topics"
    >
      <span className={styles.chapterMarker} aria-hidden="true">10 / 14</span>
      <div className={styles.sectionHeading} data-reveal="true">
        <p>DEEPER TOPICS</p>
        <h2
          id="topics-title"
          data-reveal="true"
          data-heading-stagger="true"
        >
          想更深入？这 6 个主题家庭最常问到。
        </h2>
        <p className={styles.sectionLead}>
          主题卡直接连到对应长文页，每篇都标注数据来源与最近一次更新时间。
        </p>
      </div>

      <ul className={styles.topicTilesGrid}>
        {TOPIC_TILES.map((tile, idx) => {
          const delay = String(Math.min(idx * 60, 480));
          return (
            <li
              key={tile.href}
              className={`${styles.topicTile} ${
                styles[`topicTile_${tile.tone}` as keyof typeof styles]
              }`}
              data-reveal="true"
              data-reveal-delay={delay}
              style={{ listStyle: "none" }}
            >
              <Link href={tile.href} className={styles.topicTileLink}>
                <header className={styles.topicTileHeader}>
                  <span className={styles.topicTileIndex}>{tile.index}</span>
                  <TileIcon tile={tile} />
                </header>
                <span className={styles.topicTileEyebrow}>{tile.eyebrow}</span>
                <h3 className={styles.topicTileTitle}>{tile.title}</h3>
                <p className={styles.topicTileDescription}>{tile.description}</p>
                <span className={styles.topicTileCta}>
                  {tile.cta} <ArrowUpRight aria-hidden="true" size={14} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className={styles.topicTilesNote} data-reveal="true" data-reveal-delay="400">
        <ScrollText aria-hidden="true" size={14} /> 主题内容随学校数据补齐持续更新，目前已有
        <strong> 6 篇 </strong>深度文章上线。
      </p>
    </section>
  );
}
