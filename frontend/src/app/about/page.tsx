import Link from "next/link";
import {
  ArrowUpRight,
  Compass,
  FileSearch,
  GitCompareArrows,
  LineChart,
  Radar,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import PageMotion from "@/components/shared/PageMotion";

const PRINCIPLES = [
  {
    icon: Compass,
    tone: "text-cobalt",
    title: "旧版体验持续在线",
    body: "地图、测评、预算与学校档案保持原路径、原数据源和原视觉规范。新增能力只做增量，不替换任何已上线入口。",
  },
  {
    icon: ShieldCheck,
    tone: "text-jade",
    title: "字段级来源透明",
    body: "每个数值都标注出处、更新时间与核验状态。没有来源的字段直接显示缺失原因，而不是补一个看起来合理的数字。",
  },
  {
    icon: FileSearch,
    tone: "text-persimmon",
    title: "缺失优先于猜测",
    body: "当数据源没有该字段时，页面渲染“暂无”并说明原因。宁可留白，也不让家庭基于虚构数据做决定。",
  },
];

const SURFACES = [
  { icon: GitCompareArrows, href: "/compare", title: "专业横向对比", body: "把分散在各校官网的专业口径拉到同一张表里比较。" },
  { icon: LineChart, href: "/s/timeseries", title: "时序与趋势", body: "录取、学费与排名的逐年变化，保留原始口径与采集时间。" },
  { icon: Radar, href: "/s/radar", title: "事件雷达", body: "政策与招生变动按时间线归档，附来源链接。" },
  { icon: Wallet, href: "/calculator", title: "家庭预算工具", body: "按学制、城市与汇率拆解四年总支出结构。" },
];

export default function Page() {
  return (
    <PageMotion>
      <main className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
        <header className="max-w-3xl border-b border-border-soft pb-6" data-reveal="true">
          <p className="text-label font-semibold uppercase tracking-[0.14em] text-cobalt">ABOUT / PATHOS</p>
          <h1 className="mt-1 text-page text-text-primary" data-heading-stagger="true">
            让留学信息可验证、可追溯、可比较
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            选校决策的难点很少是信息太少，而是信息来源彼此矛盾、口径不一致、又无法追溯。PathOS
            把每个字段还原到它的出处，让家庭看到的不只是结论，还有结论是怎么来的。
          </p>
        </header>

        <section className="mt-8" data-section="true">
          <h2 className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">我们坚持的三件事</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {PRINCIPLES.map((item, index) => {
              const Icon = item.icon;
              return (
                <section
                  key={item.title}
                  className="rounded-card border border-border-soft bg-surface-1 p-5 shadow-sm"
                  data-reveal="true"
                  data-reveal-delay={String(80 + index * 80)}
                >
                  <Icon size={19} className={item.tone} aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-text-primary">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-text-secondary">{item.body}</p>
                </section>
              );
            })}
          </div>
        </section>

        <section className="mt-10" data-section="true">
          <div className="flex items-baseline justify-between gap-3">            <h2 className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">正在建设的能力</h2>            <span className="page-motion-stat">              <span data-counter="4" data-counter-format="locale" className="page-motion-stat-value">4</span>              <span className="page-motion-stat-label">个入口</span>            </span>          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            以下入口已经可用，数据仍在逐步补全。每个页面都会显示当前覆盖范围，而不是假装已经完整。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SURFACES.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-card border border-border-soft bg-surface-1 p-4 shadow-sm transition hover:border-cobalt/40 hover:shadow-md"
                  data-reveal="true"
                  data-reveal-delay={String(80 + index * 80)}
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-2 text-cobalt">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                      {item.title}
                      <ArrowUpRight
                        size={14}
                        className="text-text-muted transition group-hover:translate-x-0.5 group-hover:text-cobalt"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-text-secondary">{item.body}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section
          className="mt-10 rounded-card border border-border-soft bg-surface-2 p-6"
          data-reveal="true"
          data-reveal-delay="80"
        >
          <h2 className="text-base font-semibold text-text-primary">从工作台开始</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-text-secondary">
            工作台汇总了专业、院校、案例与趋势四类视图，适合已经有初步目标、需要交叉验证的阶段。
          </p>
          <Link
            href="/s/home"
            className="mt-4 inline-flex h-control items-center gap-1.5 rounded-control bg-ink px-4 text-caption font-semibold text-paper transition hover:opacity-90"
          >
            进入 v2 功能工作台
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </main>
    </PageMotion>
  );
}
