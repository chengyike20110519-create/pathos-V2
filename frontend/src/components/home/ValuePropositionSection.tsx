"use client";

// ValuePropositionSection · 三个核心价值主张
// 数据透明 / 真实可追溯 / 决策独立
// 放在 topics 之后、howto 之前，章节号 10/13。
// 用 --token-cobalt / --token-jade / --token-persimmon 作强调色，
// 不抢 hero 的深色基调。

import { ArrowUpRight, BookOpenText, Eye, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "@/app/home.module.css";

const PROPOSITIONS = [
  {
    icon: Eye,
    eyebrow: "01 透明",
    title: "数据透明",
    body: "每一项字段都标明来源 IPEDS / US News / CDS / 官网，未报告时直接显示「暂无」，从不用零或近似值假装存在。",
    proof: "全量院校 · 专业目录 · 来源可追溯",
    accent: "jade",
  },
  {
    icon: BookOpenText,
    eyebrow: "02 可追溯",
    title: "真实可追溯",
    body: "学校页每一项数据背后都有原始链接；点击进入院校主页即可看到官方页面、收录时间和最近一次更新。",
    proof: "每所学校都有事实链 · 收录日期可查",
    accent: "cobalt",
  },
  {
    icon: ShieldCheck,
    eyebrow: "03 独立",
    title: "决策独立",
    body: "PathOS 不接学校广告，不接佣金。排序、匹配与评估都基于公开数据，不为任何学校调整权重。",
    proof: "不接受院校付费 · 排序规则公开",
    accent: "persimmon",
  },
] as const;

const FOOTER_LINKS = [
  { label: "查看可信边界", href: "/entry/map", caption: "先看哪些已经验证" },
  { label: "读学校评估方法", href: "/about", caption: "了解我们如何打分" },
];

export function ValuePropositionSection() {
  return (
    <section
      className={styles.valueProp}
      aria-labelledby="valueprop-title"
      data-section="valueprop"
      data-chapter-target="valueprop"
    >
      <span className={styles.chapterMarker} aria-hidden="true">11 / 14</span>
      <div className={styles.sectionHeading} data-reveal="true">
        <p>VALUE PROPOSITION</p>
        <h2 id="valueprop-title" data-reveal="true" data-heading-stagger="true">
          我们相信的三件事，决定了 PathOS 长什么样。
        </h2>
        <p className={styles.sectionLead}>
          这些不是口号，是写进每一次更新里的工程约束。
        </p>
      </div>

      <div className={styles.valuePropGrid}>
        {PROPOSITIONS.map((p, idx) => {
          const Icon = p.icon;
          const delay = String(Math.min(idx * 120, 360));
          return (
            <article
              key={p.title}
              className={styles.valuePropCard}
              data-accent={p.accent}
              data-reveal="true"
              data-reveal-delay={delay}
            >
              <span className={styles.valuePropEyebrow}>{p.eyebrow}</span>
              <span className={styles.valuePropIcon} aria-hidden="true">
                <Icon size={22} />
              </span>
              <h3 className={styles.valuePropTitle}>{p.title}</h3>
              <p className={styles.valuePropBody}>{p.body}</p>
              <p className={styles.valuePropProof}>{p.proof}</p>
            </article>
          );
        })}
      </div>

      <div className={styles.valuePropFooter} data-reveal="true" data-reveal-delay="400">
        {FOOTER_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={styles.valuePropFooterLink}>
            <span className={styles.valuePropFooterLinkMain}>
              {l.label} <ArrowUpRight aria-hidden="true" size={14} />
            </span>
            <span className={styles.valuePropFooterLinkCaption}>{l.caption}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
