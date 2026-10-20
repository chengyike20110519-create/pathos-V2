"use client";

// Client half of /workbench/orgs/[id]. The server pre-loads the
// members list + pending invitations so we never flash an empty UI;
// the only state owned here is the new-invitation form, the just-
// issued share URL banner, and the optimistic revoke.

import { useState } from "react";
import { Check, Copy, Link as LinkIcon, Mail, Trash2, UserPlus } from "lucide-react";

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: "team" | "agency" | "studio";
  createdAt: string;
  createdByUserId: string;
}

interface MemberRow {
  userId: string;
  email: string;
  displayName: string | null;
  role: "owner" | "advisor";
  joinedAt: string;
}

interface InvitationRow {
  id: string;
  orgId: string;
  email: string;
  role: "advisor" | "student";
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedByUserId: string;
}

interface InviteResponse {
  ok?: boolean;
  invitation?: InvitationRow;
  shareUrl?: string;
  code?: string;
  message?: string;
}

interface OrgDetailProps {
  organization: OrgSummary;
  role: "owner" | "advisor";
  members: MemberRow[];
  invitations: InvitationRow[];
  initialError?: string | null;
  initialOk?: string | null;
}

const ROLE_COPY: Record<"owner" | "advisor", string> = {
  owner: "所有者",
  advisor: "顾问",
};

const PLAN_COPY: Record<OrgSummary["plan"], string> = {
  team: "团队版",
  agency: "机构版",
  studio: "工作室版",
};

const ERROR_COPY: Record<string, string> = {
  INVALID_EMAIL: "请输入有效邮箱地址。",
  FORBIDDEN: "你不是该组织的成员,无法发起邀请。",
  DB_UNREACHABLE: "数据库暂时不可用,请稍后重试。",
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const days = Math.round(abs / (24 * 60 * 60 * 1000));
  if (days < 1) {
    const hours = Math.round(abs / (60 * 60 * 1000));
    if (hours < 1) {
      const mins = Math.max(1, Math.round(abs / 60_000));
      return diff > 0 ? `${mins} 分钟后` : `${mins} 分钟前`;
    }
    return diff > 0 ? `${hours} 小时后` : `${hours} 小时前`;
  }
  return diff > 0 ? `${days} 天后` : `${days} 天前`;
}

export function OrgDetail({
  organization,
  role,
  members,
  invitations,
  initialError,
  initialOk,
}: OrgDetailProps): JSX.Element {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"advisor" | "student">("advisor");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? ERROR_COPY[initialError] ?? initialError : null,
  );
  const [shareUrl, setShareUrl] = useState<string | null>(
    initialOk === "invited" ? "邀请已发出,请通过邮件链接接受。" : null,
  );
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<InvitationRow[]>(invitations);

  async function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = inviteEmail.trim();
    if (!trimmed) {
      setError(ERROR_COPY.INVALID_EMAIL);
      setShareUrl(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    setShareUrl(null);
    try {
      const res = await fetch(`/api/orgs/${organization.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role: inviteRole }),
      });
      const data = (await res.json().catch(() => ({}))) as InviteResponse;
      if (!res.ok || !data.ok || !data.invitation || !data.shareUrl) {
        const code = data.code ?? "DB_UNREACHABLE";
        setError(ERROR_COPY[code] ?? data.message ?? "暂时无法发出邀请,请稍后重试。");
        return;
      }
      setRows((prev) => [data.invitation!, ...prev]);
      setShareUrl(data.shareUrl);
      setInviteEmail("");
    } catch {
      setError("网络异常,请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(invitationId: string) {
    setError(null);
    // Optimistic remove; the route is idempotent so a failure just
    // means we re-render the row.
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.id !== invitationId));
    try {
      const res = await fetch(`/api/orgs/${organization.id}/invitations/${invitationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setRows(previous);
        setError("撤销失败,请稍后重试。");
      }
    } catch {
      setRows(previous);
      setError("网络异常,请稍后再试。");
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore -- user can select manually */
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="org-heading">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
              {PLAN_COPY[organization.plan]} · {ROLE_COPY[role]}
            </p>
            <h1
              id="org-heading"
              className="mt-1 text-2xl font-semibold tracking-tight text-text-primary"
            >
              {organization.name}
            </h1>
            <p className="mt-1 text-[13px] text-text-secondary">/{organization.slug}</p>
          </div>
        </header>

        <h2 className="mt-8 text-sm font-semibold text-text-primary">成员 ({members.length})</h2>
        {members.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-tertiary">还没有成员。</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-soft rounded-control border border-border-soft bg-surface-1">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {m.displayName ?? m.email}
                  </p>
                  <p className="truncate text-[11px] text-text-secondary" lang="en">
                    {m.email}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-border-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                  {ROLE_COPY[m.role]}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-sm font-semibold text-text-primary">
          待处理邀请 ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-tertiary">没有待处理的邀请链接。</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-soft rounded-control border border-border-soft bg-surface-1">
            {rows.map((inv) => {
              const expired = new Date(inv.expiresAt).getTime() <= Date.now();
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {inv.email}
                      <span className="ml-2 rounded-full border border-border-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                        {inv.role === "advisor" ? "顾问" : "学生"}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-text-secondary">
                      {expired ? "已过期" : `${formatRelative(inv.expiresAt)}到期`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevoke(inv.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-control border border-border-soft px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:border-persimmon/40 hover:text-persimmon"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    撤销
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside aria-labelledby="invite-heading">
        <div className="rounded-control border border-border-soft bg-surface-1 p-4">
          <h2 id="invite-heading" className="text-sm font-semibold text-text-primary">
            邀请新成员
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            链接 14 天内有效,只能使用一次。发出后可在右侧复制并转发。
          </p>
          <form onSubmit={onInvite} className="mt-4 flex flex-col gap-3" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">邮箱</span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">身份</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "advisor" | "student")}
                className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <option value="advisor">顾问 (加入组织)</option>
                <option value="student">学生 (仅查看共享报告)</option>
              </select>
            </label>
            {error && (
              <div className="rounded-control border border-amber-300/40 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
                {error}
              </div>
            )}
            {shareUrl && !error && (
              <div className="rounded-control border border-jade/30 bg-jade/10 px-3 py-2 text-[12px] text-jade">
                <div className="flex items-center gap-2">
                  <Mail size={12} aria-hidden="true" />
                  <span>邀请已发出。若邮件未到达,可手动复制链接：</span>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-control border border-jade/20 bg-surface-1 px-2 py-1.5">
                  <LinkIcon size={12} aria-hidden="true" className="shrink-0 text-jade" />
                  <code className="min-w-0 flex-1 truncate text-[11px] text-text-primary">{shareUrl}</code>
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="inline-flex shrink-0 items-center gap-1 rounded-control border border-border-soft px-2 py-0.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                  >
                    {copied ? (
                      <>
                        <Check size={11} aria-hidden="true" /> 已复制
                      </>
                    ) : (
                      <>
                        <Copy size={11} aria-hidden="true" /> 复制
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-control items-center justify-center gap-1.5 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <UserPlus size={14} aria-hidden="true" />
              {submitting ? "发送中…" : "发送邀请"}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default OrgDetail;
