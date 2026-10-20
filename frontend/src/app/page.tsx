import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, Database, FileSearch, Globe2, ShieldCheck } from "lucide-react";
import HomeScrollFx from "@/components/home/HomeScrollFx";
import { DataCoverageDashboard } from "@/components/home/DataCoverageDashboard";
import { LatestUpdatesSection } from "@/components/home/LatestUpdatesSection";
import { FeaturedSchoolsSection } from "@/components/home/FeaturedSchoolsSection";
import styles from "./home-editorial.module.css";
import "./home-fx.css";

export const metadata: Metadata = {
  title: "PathOS — 美国高等教育信息基础设施",
  description: "PathOS 把学校、专业、费用、信息和多年趋势放进同一个可追溯的学生研究系统。",
};

const TRUSTED_SOURCES = ["Common Data Set", "学校官网", "IPEDS", "College Scorecard", "US News", "QS / THE"] as const;

const PILLARS = [
  { className: "schoolCell", number: "01", title: "学校速览", description: "地点、排名、录取、规模、费用与政策集中在一页，先看口径再看数字。", href: "/map" },
  { className: "factCell", number: "02", title: "信息核查", description: "每个字段保留学术年份、适用范围、来源链接和缺失原因。", href: "/search" },
  { className: "compareCell", number: "03", title: "横向比较", description: "最多 4 所学校同屏对照，突出单位、年份和来源差异。", href: "/compare" },
  { className: "trendCell", number: "04", title: "趋势分析", description: "录取率、学费、SAT 与 GPA 使用真实序列，缺失年份不插值。", href: "/trends" },
  { className: "researchCell", number: "05", title: "我的研究", description: "用研究问题组织学校、证据、比较与趋势视图，让资料可以复盘和引用。", href: "/research" },
] as const;

const STRIP = [
  { value: "94", label: "院校摘要" },
  { value: "62", label: "详细档案" },
  { value: "904", label: "验证记录" },
  { value: "51", label: "州级辖区 · 4 项区域指标" },
] as const;

const JOURNEY = [
  { step: "01", title: "先找一批学校", description: "你还没有目标时，从地图、专业或搜索开始，先建立一个候选集合。", href: "/search", action: "开始找学校" },
  { step: "02", title: "看它适不适合你", description: "打开大学指南，先看学习环境、专业方向、费用和申请现实，再深入读数字。", href: "/guides", action: "打开大学指南" },
  { step: "03", title: "放在一起比较", description: "把候选学校放到同一张表里，看差异、趋势和预算，不再靠感觉来回跳页面。", href: "/compare", action: "开始比较" },
  { step: "04", title: "形成下一步计划", description: "最后检查申请组合、截止日期和预算，把研究结果变成可以执行的清单。", href: "/portfolio", action: "检查我的计划" },
] as const;

const STANDARDS = [
  { title: "Common Data Set", description: "录取率、标化区间和费用的标准化起点。", icon: Database },
  { title: "学校官网", description: "项目、政策和截止日期逐条回链原文。", icon: FileSearch },
  { title: "IPEDS / 州级数据", description: "就业、安全和区域生活成本的外部参照。", icon: Globe2 },
  { title: "审核边界", description: "未采集、官方未报告和暂不可用始终分开。", icon: ShieldCheck },
] as const;

export default function HomePage() {
  return (
    <main className={styles.root} data-home-root="true">
      <div aria-hidden="true" data-scroll-progress />
      <HomeScrollFx />

      <header className={styles.hero} data-hero="true">
        <div className={styles.heroMedia} data-hero-earth="true" aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.masthead} data-reveal="true">
            <p className={styles.mastheadLeft}>{TRUSTED_SOURCES.join(" · ")}</p>
            <p className={styles.mastheadRight}>信息基础设施 · 持续更新</p>
          </div>
          <h1 className={styles.heroTitle} aria-label="快速读懂美国大学，看清数据与趋势">
            <span className={styles.heroTitleLine}>快速读懂美国大学，</span>
            <span className={styles.heroTitleLine}>
              <em>看清数据与趋势</em>
            </span>
          </h1>
          <p className={styles.heroLede} data-reveal="true" data-reveal-delay="160">
            PathOS 把学校、专业、费用、信息和多年趋势放进同一套可追溯的数据结构。Preview 数据只展示已收录与已验证内容；先解释来源与边界，再支持学生完成研究。
          </p>
          <div className={styles.ctaRow} data-reveal="true" data-reveal-delay="240">
            <Link href="/map" className={`${styles.primaryCta} ${styles.focusable}`}>从院校地图开始</Link>
            <Link href="/trends" className={`${styles.ghostCta} ${styles.focusable}`}>打开趋势台</Link>
            <Link href="/search" className={`${styles.ghostCta} ${styles.focusable}`}>全局检索</Link>
          </div>
        </div>
        <p className={styles.scrollCue} data-reveal="true" data-reveal-delay="320">Scroll</p>
      </header>

      <section className={styles.section} aria-labelledby="pillars-title">
        <div className={styles.sectionHead} data-reveal="true">
          <div>
            <p className={styles.kicker}>Content Pillars</p>
            <h2 id="pillars-title" className={styles.sectionTitle} data-reveal="true" data-heading-stagger="true" aria-label="从找到学校到看清趋势的研究路径">从找到学校到看清趋势的研究路径</h2>
          </div>
          <p className={styles.sectionIntro} data-reveal="true" data-reveal-delay="80">速览、核查、比较、趋势和研究资料分别解决不同问题；任何一步都能回到来源与更新时间。</p>
        </div>

        <div className={styles.bento}>
          {PILLARS.map((pillar, index) => (
            <Link
              key={pillar.href}
              href={pillar.href}
              className={`${styles[pillar.className]} ${styles.cell} ${styles.focusable}`}
              data-reveal="true"
              data-reveal-delay={String(index * 80)}
            >
              {pillar.number ? <span className={styles.cellNumber}>{pillar.number}</span> : null}
              <h3 className={styles.cellTitle}>{pillar.title}</h3>
              <p className={styles.cellCopy}>{pillar.description}</p>
            </Link>
          ))}
        </div>

        <dl className={styles.strip}>
          {STRIP.map((item, index) => (
            <div
              key={item.label}
              className={styles.stripItem}
              data-reveal="true"
              data-reveal-delay={String(index * 80)}
            >
              <dt className={styles.stripLabel}>{item.label}</dt>
              <dd className={styles.stripValue} data-counter={item.value}>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="journey-title">
        <div className={styles.sectionHead} data-reveal="true">
          <div>
            <p className={styles.kicker}>START HERE</p>
            <h2 id="journey-title" className={styles.sectionTitle} data-reveal="true" data-heading-stagger="true" aria-label="从找学校到形成申请计划">不知道从哪里开始？按这条路径走</h2>
          </div>
          <p className={styles.sectionIntro} data-reveal="true" data-reveal-delay="80">每一步只解决一个问题：先找到候选，再判断适配，接着比较取舍，最后形成自己的申请计划。</p>
        </div>
        <div className={styles.workflowGrid}>
          {JOURNEY.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.workflowCard} ${styles.focusable}`}
              data-reveal="true"
              data-reveal-delay={String(index * 90)}
            >
              <p className={styles.workflowStep}>{item.step}</p>
              <h3 className={styles.workflowTitle}>{item.title}</h3>
              <p className={styles.workflowCopy}>{item.description}</p>
              <span className={styles.workflowAction}>
                {item.action} <ArrowUpRight size={15} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className={styles.dynamicSection}>
        <DataCoverageDashboard />
        <LatestUpdatesSection />
        <FeaturedSchoolsSection />
      </div>

      <section className={styles.section} aria-labelledby="standards-title">
        <div className={styles.sectionHead} data-reveal="true">
          <div>
            <p className={styles.kicker}>Data Standards</p>
            <h2 id="standards-title" className={styles.sectionTitle} data-reveal="true" data-heading-stagger="true" aria-label="每条数字都能回到来源">每条数字都能回到来源</h2>
          </div>
          <p className={styles.sectionIntro} data-reveal="true" data-reveal-delay="80">PathOS 不用估算值填充空白，也不把缺失包装成确定结论；AI 评估与匹配结果均不构成录取保证。</p>
        </div>
        <dl className={styles.standardsGrid}>
          {STANDARDS.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className={styles.standardItem} data-reveal="true" data-reveal-delay={String(index * 70)}>
                <dt className={styles.standardTitle}>
                  <Icon size={16} aria-hidden="true" /> {item.title}
                </dt>
                <dd className={styles.standardCopy}>{item.description}</dd>
              </div>
            );
          })}
        </dl>
        <div className={styles.missingRow} aria-label="缺失语义">
          <span className={styles.missingChip} data-reveal="true" data-reveal-delay="240">未采集</span>
          <span className={styles.missingChip} data-reveal="true" data-reveal-delay="320">官方未报告</span>
          <span className={styles.missingChip} data-reveal="true" data-reveal-delay="400">口径不一致</span>
          <span className={styles.missingChip} data-reveal="true" data-reveal-delay="480">已过期</span>
          <span className={styles.missingChip} data-reveal="true" data-reveal-delay="560">暂不可用</span>
        </div>
      </section>

      <button type="button" data-back-to-top aria-label="返回顶部" className="grid place-items-center">
        <ArrowUp aria-hidden="true" size={17} />
      </button>
    </main>
  );
}
