"use client";

// Client half of /invite/[token]. Confirms the invitation, calls
// /api/invitations/[token], and routes the user to the right place
// based on what kind of membership the invitation produces.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Compass } from "lucide-react";

interface InviteAcceptProps {
  token: string;
  orgName: string;
  orgSlug: string;
  role: "advisor" | "student";
  expiresAt: string;
  currentEmail: string;
}

interface AcceptResponse {
  ok?: boolean;
  org?: { id: string; name: string; slug: string };
  role?: "advisor" | "student";
  membershipRole?: "owner" | "advisor" | null;
  code?: string;
  message?: string;
}

const ROLE_COPY: Record<"advisor" | "student", string> = {
  advisor: "顾问",
  student: "学生",
};

const ERROR_COPY: Record<string, string> = {
  UNAUTHENTICATED: "请先登录后再接受邀请。",
  INVALID: "邀请已失效或当前账号邮箱不匹配。",
  INVALID_TOKEN: "邀请链接无效。",
  NOT_FOUND: "邀请链接不存在或已被撤销。",
  DB_UNREACHABLE: "数据库暂时不可用,请稍后重试。",
};

export function InviteAccept({
  token,
  orgName,
  orgSlug,
  role,
  expiresAt,
  currentEmail,
}: InviteAcceptProps): JSX.Element {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as AcceptResponse;
      if (!res.ok || !data.ok) {
        const code = data.code ?? "DB_UNREACHABLE";
        setError(ERROR_COPY[code] ?? data.message ?? "暂时无法接受邀请,请稍后重试。");
        return;
      }
      if (data.org?.id) {
        router.push(`/workbench/orgs/${data.org.id}`);
        router.refresh();
      } else {
        // Student invitation -- no membership, but the org name is
        // still useful. Land on the org list so the user sees what
        // they have.
        router.push("/workbench/orgs");
        router.refresh();
      }
    } catch {
      setError("网络异常,请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-control border border-border-soft bg-surface-1 p-6 shadow-sm">
        <Link
          href="/"
          aria-label="PathOS 首页"
          className="grid h-10 w-10 place-items-center rounded-control bg-ink text-paper dark:bg-paper dark:text-ink"
        >
          <Compass size={18} aria-hidden="true" />
        </Link>
        <h1 className="mt-3 text-[20px] font-semibold tracking-tight text-text-primary">
          接受 {orgName} 的邀请
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          邀请身份为 <span className="font-medium text-text-primary">{ROLE_COPY[role]}</span>。
          接受后将作为该 {role === "advisor" ? "组织成员" : "学生"} 加入。
        </p>
        <dl className="mt-4 grid gap-1.5 text-[12px] text-text-secondary">
          <div className="flex justify-between gap-3">
            <dt>组织</dt>
            <dd className="font-medium text-text-primary">/{orgSlug}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>当前账号</dt>
            <dd className="truncate font-medium text-text-primary" lang="en">{currentEmail}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>到期</dt>
            <dd className="font-medium text-text-primary">{new Date(expiresAt).toLocaleString("zh-CN")}</dd>
          </div>
        </dl>
        {error && (
          <div className="mt-5 rounded-control border border-amber-300/40 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={onAccept}
          disabled={submitting}
          className="mt-6 inline-flex h-control w-full items-center justify-center gap-1.5 rounded-control bg-ink px-4 text-[13px] font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {submitting ? "接受中…" : "接受邀请"}
          {!submitting && <ArrowRight size={14} aria-hidden="true" />}
        </button>
        <p className="mt-3 text-center text-[11px] text-text-tertiary">
          接受后邀请链接立即失效,无法再次使用。
        </p>
      </div>
    </main>
  );
}

export default InviteAccept;
