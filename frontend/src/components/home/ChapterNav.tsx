"use client";

// ChapterNav · 右侧 1-10 圆点导航 (bestieu 风格)
// 监听当前进入视口的 chapter section，高亮对应圆点。
// 点击圆点平滑滚动到对应 section。

import styles from "@/app/home.module.css";

const CHAPTERS = [
  { id: "hero", index: "01", label: "首页" },
  { id: "boundary", index: "02", label: "边界" },
  { id: "modules", index: "03", label: "章节" },
  { id: "sources", index: "04", label: "数据源" },
  { id: "reconcile", index: "05", label: "调和" },
  { id: "spotlight", index: "06", label: "切片" },
  { id: "insights", index: "07", label: "洞察" },
  { id: "featured", index: "08", label: "院校" },
  { id: "coverage", index: "09", label: "覆盖" },
  { id: "updates", index: "10", label: "更新" },
  { id: "topics", index: "11", label: "话题" },
  { id: "valueprop", index: "12", label: "价值" },
  { id: "howto", index: "13", label: "开始" },
  { id: "faq", index: "14", label: "问答" },
];

export function ChapterNav() {
  return (
    <nav className={styles.chapterNav} data-chapter-pin aria-label="章节导航">
      <ol>
        {CHAPTERS.map((c, idx) => (
          <li key={c.id}>
            <button
              type="button"
              className={styles.chapterNavItem}
              data-chapter-pin-item
              data-chapter-target={c.id}
              data-active={idx === 0 ? "true" : "false"}
              aria-label={`跳到第 ${c.index} 章：${c.label}`}
            >
              <span className={styles.chapterNavDot} aria-hidden="true" />
              <span className={styles.chapterNavLabel}>
                <span className={styles.chapterNavIndex}>{c.index}</span>
                <span className={styles.chapterNavName}>{c.label}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
