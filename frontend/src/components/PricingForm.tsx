"use client";

// Pricing form: collects contact info and posts to /api/subscriptions.
// All three plans share this form. The plan id is fixed by the parent
// <PricingForm plan="..." /> prop so we never accidentally let the
// user submit under a different price.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

type PlanId = "advisor_annual" | "single_report" | "data_api";

interface PricingFormProps {
  plan: PlanId;
  planName: string;
  featured?: boolean;
}

interface ApiOk { ok: true; id: string; plan: string }
interface ApiErr { ok: false; error?: { code: string; message?: string }; code?: string; message?: string }

export function PricingForm({ plan, planName, featured }: PricingFormProps) {
  const router = useRouter();
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [wechat, setWechat] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contactName.trim()) { setError("请填写称呼"); return; }
    if (!phone.trim() && !wechat.trim() && !email.trim()) {
      setError("手机号、微信、邮箱至少填一个，方便顾问联系"); return;
    }
    setPending(true);
    try {
      const resp = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          contactName: contactName.trim(),
          phone: phone.trim() || undefined,
          wechat: wechat.trim() || undefined,
          email: email.trim() || undefined,
          company: company.trim() || undefined,
          notes: notes.trim() || undefined,
          source: "pricing",
        }),
      });
      const data = (await resp.json()) as ApiOk | ApiErr;
      if (!resp.ok || !("ok" in data) || data.ok !== true) {
        const code = (data as ApiErr).code ?? (data as ApiErr).error?.code ?? "UNKNOWN";
        const message = (data as ApiErr).message ?? (data as ApiErr).error?.message ?? "提交失败，请稍后再试";
        setError(`(${code}) ${message}`);
        setPending(false);
        return;
      }
      setSubmittedId(data.id);
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请稍后再试");
      setPending(false);
    }
  }

  if (submittedId) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />
          <p className="font-medium">申请已收到，我们会尽快与您联系。</p>
        </div>
        <p className="mt-1 pl-7 text-[13px] text-text-secondary">
          申请编号：<code className="font-mono text-[12px]">{submittedId}</code>，
          请留存以便后续查询。也可以
          <button
            type="button"
            onClick={() => router.push("/")}
            className="ml-1 underline decoration-text-tertiary underline-offset-2 hover:text-text-primary"
          >
            回到首页
          </button>
          。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <input type="hidden" value={plan} readOnly />
      <label className="block text-[13px] font-medium text-text-primary">
        方案
      </label>
      <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-text-primary">
        {planName}
      </div>
      <label className="block text-[13px] font-medium text-text-primary">
        称呼 <span className="text-text-tertiary">*</span>
      </label>
      <input
        type="text"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        placeholder="家长 / 学生 / 机构名称"
        className="h-9 w-full rounded-control border border-border-soft bg-surface-1 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-cobalt/60 focus:outline-none focus:ring-2 focus:ring-focus-ring"
      />
      <label className="block text-[13px] font-medium text-text-primary">
        手机号 / 微信 / 邮箱（至少一个）
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="手机号"
          className="h-9 rounded-control border border-border-soft bg-surface-1 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-cobalt/60 focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
        <input
          type="text"
          value={wechat}
          onChange={(e) => setWechat(e.target.value)}
          placeholder="微信号"
          className="h-9 rounded-control border border-border-soft bg-surface-1 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-cobalt/60 focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          className="h-9 rounded-control border border-border-soft bg-surface-1 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-cobalt/60 focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
      </div>
      {plan === "data_api" && (
        <>
          <label className="block text-[13px] font-medium text-text-primary">
            机构名称
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="留学机构 / 国际学校 / 教辅平台"
            className="h-9 w-full rounded-control border border-border-soft bg-surface-1 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-cobalt/60 focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </>
      )}
      <label className="block text-[13px] font-medium text-text-primary">
        备注（可选）
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full rounded-control border border-border-soft bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-cobalt/60 focus:outline-none focus:ring-2 focus:ring-focus-ring"
        placeholder="简单描述一下您的需求 / 期望的回复时间"
      />
      {error && (
        <p className="rounded-control bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">{error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={
          "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-control text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
          (featured
            ? "bg-ink text-paper hover:bg-ink/90 disabled:bg-ink/60"
            : "border border-border-soft bg-surface-1 text-text-primary hover:border-cobalt/40 hover:text-cobalt disabled:opacity-60")
        }
      >
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
        {pending ? "提交中…" : "留下联系方式，顾问联系您"}
      </button>
      <p className="text-[11px] leading-relaxed text-text-tertiary">
        点击提交即表示您同意 PathOS 通过您填写的联系方式与您沟通本次申请。
        我们不会用于其它营销用途，也不会分享给第三方。
      </p>
    </form>
  );
}
