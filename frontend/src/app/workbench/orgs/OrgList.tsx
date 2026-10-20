"use client";

// Client half of /workbench/orgs. The server component passes in the
// initial org list (so we render something on first paint); this
// component owns the "create new org" form and the empty state.
//
// Why the form is here and not a server action: a server action would
// still need to round-trip via fetch under the hood and would not
// give us the loading spinner we want. fetch() keeps the JSX small
// and lets us reuse the same error envelope as the rest of the API.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Plus } from "lucide-react";

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: "team" | "agency" | "studio";
  createdAt: string;
  createdByUserId: string;
}

interface CreateOrgResponse {
  ok?: boolean;
  organization?: OrgSummary;
  code?: string;
  message?: string;
}

interface OrgListProps {
  initialOrgs: OrgSummary[];
  initialError?: string | null;
  initialOk?: string | null;
}

const ERROR_COPY: Record<string, string> = {
  MISSING_NAME: "请填写组织名称。",
  INVALID_NAME: "组织名称无效,请避免使用控制字符。",
  DB_UNREACHABLE: "数据库暂时不可用,请稍后重试。",
};

const PLAN_COPY: Record<OrgSummary["plan"], string> = {
  team: "团队版",
  agency: "机构版",
  studio: "工作室版",
};

export function OrgList({ initialOrgs, initialError, initialOk }: OrgListProps): JSX.Element {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgSummary[]>(initialOrgs);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<OrgSummary["plan"]>("team");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? ERROR_COPY[initialError] ?? initialError : null,
  );
  const [ok, setOk] = useState<string | null>(
    initialOk === "created" ? "组织已创建,正在跳转..." : null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(ERROR_COPY.MISSING_NAME);
      return;
    }
    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, plan }),
      });
      const data = (await res.json().catch(() => ({}))) as CreateOrgResponse;
      if (!res.ok || !data.ok || !data.organization) {
        const code = data.code ?? "DB_UNREACHABLE";
        setError(ERROR_COPY[code] ?? data.message ?? "暂时无法创建,请稍后重试。");
        return;
      }
      setOrgs((prev) => [data.organization!, ...prev]);
      setName("");
      setOk("组织已创建,正在跳转...");
      router.push(`/workbench/orgs/${data.organization.id}`);
      router.refresh();
    } catch {
      setError("网络异常,请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="org-list-heading">
        <h2 id="org-list-heading" className="text-sm font-semibold text-text-primary">
          你的组织
        </h2>
        {orgs.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-tertiary">还没有组织,先用右侧表单创建。</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/workbench/orgs/${org.id}`}
                  className="group flex items-center justify-between gap-3 rounded-control border border-border-soft bg-surface-1 px-4 py-3 transition hover:border-cobalt/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-cobalt/8 text-cobalt">
                      <Building2 size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {org.name}
                      </p>
                      <p className="truncate text-[11px] text-text-secondary">/{org.slug}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-border-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                    {PLAN_COPY[org.plan]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-labelledby="create-org-heading">
        <div className="rounded-control border border-border-soft bg-surface-1 p-4">
          <h2 id="create-org-heading" className="text-sm font-semibold text-text-primary">
            创建新组织
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            你将自动成为首位 owner。
          </p>
          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">组织名称</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如:启行顾问工作室"
                maxLength={80}
                className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">订阅方案</span>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as OrgSummary["plan"])}
                className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <option value="team">团队版 (默认)</option>
                <option value="agency">机构版</option>
                <option value="studio">工作室版</option>
              </select>
            </label>
            {error && (
              <div className="rounded-control border border-amber-300/40 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
                {error}
              </div>
            )}
            {ok && !error && (
              <div className="rounded-control border border-jade/30 bg-jade/10 px-3 py-2 text-[12px] text-jade">
                {ok}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-control items-center justify-center gap-1.5 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Plus size={14} aria-hidden="true" />
              {submitting ? "创建中…" : "创建组织"}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default OrgList;
