"use client";

// Magic-link form. Posts to /api/auth/magic-link and shows a single
// confirmation state regardless of whether the address was previously
// known -- enumeration is handled server-side, never here.
import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";

interface LoginFormProps {
  initialError?: string;
}

const ERROR_COPY: Record<string, string> = {
  invalid: "链接已失效，请重新发送登录邮件。",
  unavailable: "登录服务暂不可用，请稍后再试。",
};

export function LoginForm({ initialError }: LoginFormProps): JSX.Element {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? ERROR_COPY[initialError] ?? "登录失败，请重试。" : null,
  );
  const [limit, setLimit] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError("请输入邮箱地址。");
      return;
    }
    setSubmitting(true);
    setError(null);
    setLimit(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        retryAfter?: number;
      };
      if (!res.ok) {
        if (res.status === 429 && typeof data.retryAfter === "number") {
          setLimit(data.retryAfter);
          setError("请求过于频繁，请稍后再试。");
        } else {
          setError("暂时无法发送，请稍后重试。");
        }
        return;
      }
      setSent(true);
    } catch {
      setError("网络异常，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-control border border-border-soft bg-surface-1 p-6 text-text-primary">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-cobalt/10 text-cobalt">
            <Mail size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold">登录邮件已发送</div>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              如果 <span className="font-medium text-text-primary">{email.trim()}</span> 对应一个账号，我们会发送一封带有登录链接的邮件。
              链接 15 分钟内有效，且只能使用一次。
            </p>
            <p className="mt-3 text-[12px] text-text-tertiary">
              没收到？检查垃圾邮件夹，或稍后重新发送。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-text-secondary">邮箱地址</span>
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      </label>
      {error && (
        <div className="rounded-control border border-amber-300/40 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
          {error}
          {limit !== null && <span className="ml-1 text-text-tertiary">{limit}s 后可重试</span>}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-control items-center justify-center gap-1.5 rounded-control bg-ink px-4 text-[13px] font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {submitting ? "发送中…" : "发送登录链接"}
        {!submitting && <ArrowRight size={14} aria-hidden="true" />}
      </button>
      <p className="text-[11px] leading-relaxed text-text-tertiary">
        登录即表示同意 <a href="/about" className="underline hover:text-text-secondary">服务条款</a>。
        我们不会向第三方分享你的邮箱。
      </p>
    </form>
  );
}

export default LoginForm;
