"use client";

// Client half of /workbench/shortlists. Creates a new shortlist on
// submit and routes the caller to the detail view once it is in the
// database. The list itself is rendered server-side so we get the
// first paint for free.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListChecks, Plus } from "lucide-react";

interface ShortlistSummary {
  id: string;
  ownerUserId: string;
  name: string;
  season: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateResponse {
  ok?: boolean;
  shortlist?: ShortlistSummary;
  code?: string;
  message?: string;
}

interface ShortlistListProps {
  initialLists: ShortlistSummary[];
  initialError?: string | null;
  initialOk?: string | null;
}

const ERROR_COPY: Record<string, string> = {
  MISSING_NAME: "请填写清单名称。",
  DB_UNREACHABLE: "数据库暂时不可用,请稍后重试。",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function ShortlistList({ initialLists, initialError, initialOk }: ShortlistListProps): JSX.Element {
  const router = useRouter();
  const [lists, setLists] = useState<ShortlistSummary[]>(initialLists);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? ERROR_COPY[initialError] ?? initialError : null,
  );
  const [ok, setOk] = useState<string | null>(
    initialOk === "created" ? "清单已创建,正在跳转..." : null,
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
      const res = await fetch("/api/shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, season: season.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as CreateResponse;
      if (!res.ok || !data.ok || !data.shortlist) {
        const code = data.code ?? "DB_UNREACHABLE";
        setError(ERROR_COPY[code] ?? data.message ?? "暂时无法创建,请稍后重试。");
        return;
      }
      setLists((prev) => [data.shortlist!, ...prev]);
      setName("");
      setSeason("");
      setOk("清单已创建,正在跳转...");
      router.push(`/workbench/shortlists/${data.shortlist.id}`);
      router.refresh();
    } catch {
      setError("网络异常,请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="list-heading">
        <h2 id="list-heading" className="text-sm font-semibold text-text-primary">
          你的清单 ({lists.length})
        </h2>
        {lists.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-tertiary">还没有清单,先用右侧表单创建。</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {lists.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/workbench/shortlists/${s.id}`}
                  className="group flex items-center justify-between gap-3 rounded-control border border-border-soft bg-surface-1 px-4 py-3 transition hover:border-cobalt/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-cobalt/8 text-cobalt">
                      <ListChecks size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{s.name}</p>
                      <p className="truncate text-[11px] text-text-secondary">
                        {s.season ? `${s.season} · ` : ""}更新于 {formatDate(s.updatedAt)}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-labelledby="create-heading">
        <div className="rounded-control border border-border-soft bg-surface-1 p-4">
          <h2 id="create-heading" className="text-sm font-semibold text-text-primary">
            创建新清单
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            建议按申请季划分;每份清单最多 20 所学校。
          </p>
          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">清单名称</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如:Fall 2027 主申清单"
                maxLength={80}
                className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-text-secondary">申请季 (可选)</span>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="Fall 2027"
                maxLength={32}
                className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
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
              {submitting ? "创建中…" : "创建清单"}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default ShortlistList;
