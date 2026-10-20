import type { Metadata } from "next";
import Link from "next/link";
import { Check, MessageCircle } from "lucide-react";
import { PricingForm } from "@/components/PricingForm";
import { getCommercialCapabilities, getContactChannels } from "@/lib/contact";

export const metadata: Metadata = {
  title: "付费方案",
  description: "PathOS 顾问工作台试用、单次 AI 解读报告、数据 API 内测三条路径。留下联系方式即可申请，商务与结算细节在沟通阶段确认。",
};

const PLANS = [
  {
    id: "single_report" as const,
    name: "单次 AI 解读报告",
    price: "按需报价",
    unit: "/ 份",
    summary: "适合已经初步定校的家庭。基于平台数据生成一份可分享的在线解读报告。",
    bullets: [
      "AI 选校定位 + 风险提示，逐条标注数据来源",
      "在线报告链接，分享可设有效期、可随时撤销",
      "可指定 1-3 所目标学校",
      "报价与交付时间在需求沟通后确认",
    ],
  },
  {
    id: "advisor_annual" as const,
    name: "顾问工作台",
    price: "试用免费",
    unit: "/ 14 天",
    summary: "面向独立顾问与国际学校升学老师的选校工作台，当前开放试用名额。",
    bullets: [
      "平台全功能：留学地图、AI 学校评估、清单分析、数据工作台",
      "选校清单与报告版本留存在账号内，可重复调用",
      "试用期 14 天，期间不收费、不需要绑定支付方式",
      "试用名额有限，按申请顺序开通",
      "试用结束后的订阅价格与账期单独沟通",
    ],
    featured: true,
  },
  {
    id: "data_api" as const,
    name: "数据 API（内测）",
    price: "内测申请",
    unit: "/ 需评估",
    summary: "面向留学机构、国际学校、教辅平台的只读数据接入，目前处于内测阶段。",
    bullets: [
      "/api/v1/universities 只读接入，返回字段含来源与更新时间",
      "按月配额与限流，响应头返回剩余额度与 Retry-After",
      "需签署数据使用协议后开通密钥",
      "字段过滤与 Webhook 回调在规划中，尚未上线",
      "内测期间按需评估用量与报价",
    ],
  },
];

export default function PricingPage() {
  const contact = getContactChannels();
  const capabilities = getCommercialCapabilities();
  return (
    <main className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
          选校不再靠感觉，决策有据可依
        </h1>
        <p className="mt-4 text-base text-text-secondary sm:text-lg">
          三条路径：单次报告轻量起步、顾问工作台开放试用、数据 API 内测接入。
          留下联系方式即可申请，具体范围与报价在沟通阶段一起确认。
        </p>
      </header>

      <section id="plans" className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={
              "flex flex-col rounded-3xl border bg-surface-1 p-6 shadow-sm transition " +
              (plan.featured
                ? "border-cobalt/40 ring-2 ring-cobalt/30 lg:scale-[1.02]"
                : "border-border-soft hover:border-border-strong/50")
            }
          >
            {plan.featured && (
              <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-cobalt/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-cobalt">
                主推方案
              </span>
            )}
            <h2 className="text-lg font-semibold text-text-primary">{plan.name}</h2>
            <p className="mt-1 text-sm text-text-secondary">{plan.summary}</p>
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-text-primary">{plan.price}</span>
              <span className="text-sm text-text-tertiary">{plan.unit}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-text-secondary">
              {plan.bullets.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-cobalt" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <PricingForm plan={plan.id} planName={plan.name} featured={plan.featured} />
          </article>
        ))}
      </section>

      <section className="mt-16 rounded-3xl border border-border-soft bg-surface-1 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-text-primary">其它问题</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-text-primary">付款方式？</dt>
            <dd className="mt-1 text-sm text-text-secondary">
              {capabilities.onlinePayment
                ? "支持线上付款，也可走银行转账。"
                : "平台暂未接入线上支付。当前阶段先提交申请，付款方式在商务沟通时确认。"}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-text-primary">顾问是谁？</dt>
            <dd className="mt-1 text-sm text-text-secondary">
              平台数据与算法由 PathOS 团队维护。顾问侧服务由我们对接的独立顾问提供，
              具体人员与经历会在沟通时说明，不做匿名分配。
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-text-primary">数据从哪来？</dt>
            <dd className="mt-1 text-sm text-text-secondary">
              以院校官方披露、IPEDS 等公开数据源为主。平台内的关键字段会标注来源、
              抓取时间与核验状态，未核验的字段会明确标记，不做无出处的结论。
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-text-primary">开票与退款？</dt>
            <dd className="mt-1 text-sm text-text-secondary">
              {capabilities.invoices
                ? "可开具咨询服务费发票，票种与税率在合同阶段确认。"
                : "开票与退款条款随合同一并确认，平台页面不单独承诺。顾问工作台试用期不收费，因此不涉及退款。"}
              {" 更多背景见"}
              <Link href="/about" className="ml-1 underline decoration-text-tertiary underline-offset-2 hover:text-text-primary">
                关于 PathOS
              </Link>
              。
            </dd>
          </div>
        </dl>
      </section>

      <aside className="mt-12 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-text-secondary">没有看到合适的方案？</p>
        {contact.email ? (
          <a
            href={`mailto:${contact.email}?subject=${encodeURIComponent("PathOS 商务咨询")}`}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-primary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <MessageCircle size={14} aria-hidden="true" />
            邮件联系 {contact.email}
          </a>
        ) : (
          <a
            href="#plans"
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-primary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <MessageCircle size={14} aria-hidden="true" />
            在上方表单留下联系方式
          </a>
        )}
        {contact.wechatId && (
          <p className="text-xs text-text-tertiary">微信 {contact.wechatId}</p>
        )}
        <p className="text-xs text-text-tertiary">
          {contact.hours ? `我们会在工作时间（${contact.hours}）内回复。` : "我们会尽快与您联系。"}
        </p>
      </aside>
    </main>
  );
}
