"use client";

// FAQSection · 6 个家庭最常见的问题，可点击展开/收起。
// 章节号 12/13，置于 howto 之后。展开用 height + opacity 过渡，
// 避免 max-height 抖动，节奏和章节 reveal 一致。

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "@/app/home.module.css";

interface FaqItem {
  q: string;
  a: string;
  hint?: string;
}

const FAQS: FaqItem[] = [
  {
    q: "PathOS 的数据和 US News 直接拿来有什么区别？",
    a: "US News 用 19 个指标的加权打分，每年的权重不公开。PathOS 把原始数据按字段拆开展示：录取率、SAT/ACT 区间、毕业率、费用等都来自 Common Data Set 或学校官网，调和位次只是 US News / QS / THE 三个排名的加权平均，差异越大我们越会标低置信。",
    hint: "一句话：原始事实 + 调和位次，不藏分歧。",
  },
  {
    q: "为什么有些学校显示「暂无」而不是估计值？",
    a: "我们拒绝猜测。预估会变成家庭决策里的「事实」，然后被引用好几年。如果学校没有公开，我们就直说暂无，并把对应字段标为缺失——你点进学校页可以看到缺失时间和最近一次更新。",
    hint: "缺失是诚实，不是失败。",
  },
  {
    q: "调和位次怎么算？为什么差距大时要标低置信？",
    a: "调和位次 = US News × 0.4 + QS × 0.35 + THE × 0.25。三源差距 ≤ 5 标高置信，5–15 标中等置信，> 15 只展示原始位次。芝加哥大学就是典型的低置信案例：US News #12、QS #21、THE #7。",
  },
  {
    q: "申请预算到底该准备多少？",
    a: "学费 + 生活费 + 保险 + 机票 + 一次探校。PathOS 费用计算器会列出学校公布的费用区间（费用上下限可能差 $20,000），并提示哪些项缺失。",
    hint: "预算不是底线，是家庭讨论的起点。",
  },
  {
    q: "PathOS 会替我做决定吗？",
    a: "不会。我们提供数据 + 可调整的匹配权重 + 学校评估问题清单。最终决策永远是你和家庭的。AI 评估给的是「还需要进一步核实的问题」，不是「该不该申」。",
    hint: "AI 给问题清单，人给判断。",
  },
  {
    q: "数据多久更新一次？学校有变化我怎么知道？",
    a: "我们跟踪 NCES / CDS / 学校官网三个来源，更新时间标在每所学校的页面上。「最新动态」章节会列出最近收录的政策与项目变化，你可以订阅学校关注。",
  },
];

function FaqRow({ item, index }: { item: FaqItem; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const delay = String(Math.min(index * 80, 320));
  return (
    <div
      className={styles.faqItem}
      data-open={open ? "true" : "false"}
      data-reveal="true"
      data-reveal-delay={delay}
    >
      <button
        type="button"
        className={styles.faqQuestion}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.faqQuestionText}>{item.q}</span>
        <span className={styles.faqPlus} aria-hidden="true">
          <Plus size={16} />
        </span>
      </button>
      <div className={styles.faqAnswer} aria-hidden={!open}>
        <div className={styles.faqAnswerInner}>
          <p className={styles.faqAnswerBody}>{item.a}</p>
          {item.hint ? (
            <p className={styles.faqAnswerHint}>{item.hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FAQSection() {
  return (
    <section
      className={styles.faq}
      aria-labelledby="faq-title"
      data-section="faq"
      data-chapter-target="faq"
    >
      <span className={styles.chapterMarker} aria-hidden="true">13 / 14</span>
      <div className={styles.sectionHeading} data-reveal="true">
        <p>FAMILIES ASK</p>
        <h2 id="faq-title" data-reveal="true" data-heading-stagger="true">
          家庭最常问的 6 个问题，先在这里答一遍。
        </h2>
        <p className={styles.sectionLead}>
          没找到答案？<Link href="/about" className={styles.faqInlineLink}>看完整说明</Link> 或 <Link href="/entry/match" className={styles.faqInlineLink}>直接开始自主匹配</Link>。
        </p>
      </div>

      <div className={styles.faqList}>
        {FAQS.map((item, idx) => (
          <FaqRow key={item.q} item={item} index={idx} />
        ))}
      </div>
    </section>
  );
}
