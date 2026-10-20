import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, FileSignature, Receipt } from "lucide-react";
import { getCommercialCapabilities, getContactChannels } from "@/lib/contact";

export const metadata: Metadata = {
  title: "我的订阅",
  description: "查看 PathOS 订阅申请的状态含义与推进流程。",
};

const STATUS_BADGES: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
  new: { label: "等待顾问联系", tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", icon: <Clock size={14} aria-hidden="true" /> },
  contacted: { label: "顾问已联系", tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", icon: <CheckCircle2 size={14} aria-hidden="true" /> },
  paid: { label: "已付款", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: <Receipt size={14} aria-hidden="true" /> },
  closed_lost: { label: "已关闭", tone: "border-text-tertiary/30 bg-text-tertiary/10 text-text-secondary", icon: <FileSignature size={14} aria-hidden="true" /> },
};

const STEPS = [
  { key: "afterFormat", title: "1. 提交申请", desc: "在 /pricing 选择方案并留下联系方式，系统会记录申请编号。" },
  { key: "afterContact", title: "2. 需求沟通", desc: "我们通过您填写的渠道联系，确认需求范围与适用方案。" },
  { key: "afterSign", title: "3. 确认商务条款", desc: "范围确定后再谈价格、账期与协议，结算方式在这一步书面确认。" },
  { key: "afterService", title: "4. 开通账户", desc: "条款确认后开通平台账户；试用申请会直接开通试用期限。" },
];

export default function AccountSubscriptionPage() {
  const contact = getContactChannels();
  const capabilities = getCommercialCapabilities();
  return (
    <main className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">我的订阅</h1>
        <p className="mt-2 max-w-2xl text-base text-text-secondary">
          这里说明订阅申请的各个状态与推进流程。还没有提交申请？
          <Link href="/pricing" className="ml-1 underline decoration-text-tertiary underline-offset-2 hover:text-text-primary">
            看看三条付费路径
          </Link>
          。
        </p>
      </header>

      <section className="mt-10 rounded-3xl border border-border-soft bg-surface-1 p-6">
        <h2 className="text-base font-semibold text-text-primary">订阅状态说明</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(STATUS_BADGES).map(([code, badge]) => (
            <li
              key={code}
              className={
                "inline-flex items-center gap-2 rounded-control border px-3 py-2 text-sm font-medium " +
                badge.tone
              }
            >
              {badge.icon}
              <span>{badge.label}</span>
              <code className="ml-auto font-mono text-[11px] text-text-tertiary">{code}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-3xl border border-border-soft bg-surface-1 p-6">
        <h2 className="text-base font-semibold text-text-primary">从提交到服务的 4 步流程</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.key} className="rounded-2xl border border-border-soft bg-surface-2/60 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-cobalt">{step.title.split(".")[0]}</p>
              <p className="mt-1 text-sm font-medium text-text-primary">{step.title.split(".").slice(1).join(".").trim()}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 rounded-3xl border border-border-soft bg-surface-1 p-6">
        <h2 className="text-base font-semibold text-text-primary">查询已有订阅</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          自助查询尚未上线。目前提交申请时填写的手机号 / 微信 / 邮箱，加上申请编号，
          就是这条申请的识别信息。
          {contact.email ? (
            <>
              需要查询进度时，请把申请编号与联系方式发到{" "}
              <a
                href={`mailto:${contact.email}?subject=${encodeURIComponent("PathOS 订阅申请查询")}`}
                className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] underline decoration-text-tertiary underline-offset-2 hover:text-text-primary"
              >
                {contact.email}
              </a>
              ，或直接回复与您沟通的同事。
            </>
          ) : (
            <>需要查询进度时，请直接回复与您沟通的同事；我们也在准备公开的支持邮箱。</>
          )}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-text-tertiary">
          {capabilities.invoices
            ? "开票请求可在同一封邮件中提出，票种以合同约定为准。"
            : "开票、退款等结算事项以双方书面约定为准，本页不单独承诺。"}
        </p>
      </section>
    </main>
  );
}
