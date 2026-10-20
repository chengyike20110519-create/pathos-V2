"use client";

// Client half of /admin/leads. Renders:
//   - stat tiles (total + per-status + per-plan)
//   - filter chips for status and plan
//   - a table of leads with click-to-edit on a side drawer
//
// Mutations (status / notes) are optimistic: we update local state
// immediately, then reconcile with the server response. A failed patch
// reverts and surfaces the error banner.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Filter,
  Loader2,
  X,
} from "lucide-react";

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost" | "closed";
export type LeadPlan = "lead_intake" | "single_report" | "advisor_annual";

export interface Lead {
  id: string;
  plan: string;
  contactName: string | null;
  phone: string | null;
  wechat: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  source: string | null;
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "新线索",
  contacted: "已联系",
  qualified: "意向确认",
  converted: "已成交",
  lost: "已流失",
  closed: "已归档",
};

const PLAN_LABEL: Record<LeadPlan, string> = {
  lead_intake: "通用咨询",
  single_report: "单次报告",
  advisor_annual: "年度顾问",
};

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "bg-cobalt/10 text-cobalt",
  contacted: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  qualified: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  converted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  lost: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  closed: "bg-ink/10 text-text-secondary",
};

const STATUS_ORDER: readonly LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
  "closed",
] as const;

const PLAN_ORDER: readonly LeadPlan[] = [
  "lead_intake",
  "single_report",
  "advisor_annual",
] as const;

interface LeadListProps {
  initialLeads: Lead[];
  initialNextCursor: string | null;
  initialStatus: string | null;
  initialPlan: string | null;
  initialTotal: number;
  initialByStatus: Record<string, number>;
  initialByPlan: Record<string, number>;
}

export default function LeadList(props: LeadListProps): JSX.Element {
  const [leads, setLeads] = useState<Lead[]>(props.initialLeads);
  const [nextCursor, setNextCursor] = useState<string | null>(props.initialNextCursor);
  const [statusFilter, setStatusFilter] = useState<string | null>(props.initialStatus);
  const [planFilter, setPlanFilter] = useState<string | null>(props.initialPlan);
  const [byStatus, setByStatus] = useState(props.initialByStatus);
  const [byPlan, setByPlan] = useState(props.initialByPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const reload = useCallback(
    async (status: string | null, plan: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (plan) params.set("plan", plan);
        params.set("limit", "50");
        const res = await fetch(`/api/admin/leads?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as
          | { ok: true; leads: Lead[]; nextCursor: string | null }
          | { ok: false; code?: string; message?: string };
        if (!("ok" in json) || !json.ok) {
          setError(("message" in json && json.message) || "加载失败,请稍后重试。");
          return;
        }
        setLeads(json.leads);
        setNextCursor(json.nextCursor);
      } catch (e) {
        setError("网络异常,请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      if (
        statusFilter !== props.initialStatus ||
        planFilter !== props.initialPlan
      ) {
        reload(statusFilter, planFilter);
      }
    }, 0);
    return () => clearTimeout(handler);
  }, [statusFilter, planFilter, props.initialStatus, props.initialPlan, reload]);

  async function loadMore(): Promise<void> {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (planFilter) params.set("plan", planFilter);
      params.set("limit", "50");
      params.set("cursor", nextCursor);
      const res = await fetch(`/api/admin/leads?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { ok: true; leads: Lead[]; nextCursor: string | null }
        | { ok: false; code?: string; message?: string };
      if (!("ok" in json) || !json.ok) {
        setError(("message" in json && json.message) || "加载失败,请稍后重试。");
        return;
      }
      setLeads((prev) => [...prev, ...json.leads]);
      setNextCursor(json.nextCursor);
    } catch (e) {
      setError("网络异常,请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function refreshStats(): Promise<void> {
    try {
      const res = await fetch("/api/admin/leads/stats", { cache: "no-store" });
      const json = (await res.json()) as
        | { ok: true; total: number; byStatus: Record<string, number>; byPlan: Record<string, number> }
        | { ok: false };
      if ("ok" in json && json.ok) {
        setByStatus(json.byStatus);
        setByPlan(json.byPlan);
      }
    } catch {
      // Stats are decorative; a failed refresh should not surface.
    }
  }

  const totals = useMemo(() => {
    return Object.values(byStatus).reduce((a, b) => a + b, 0);
  }, [byStatus]);

  return (
    <div className="mt-8 space-y-6">
      {/* Stats tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="全部" value={totals} active={!statusFilter} onClick={() => setStatusFilter(null)} />
        {STATUS_ORDER.map((s) => (
          <StatTile
            key={s}
            label={STATUS_LABEL[s]}
            value={byStatus[s] ?? 0}
            active={statusFilter === s}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            tone={s}
          />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLAN_ORDER.map((p) => (
          <PlanTile
            key={p}
            label={PLAN_LABEL[p]}
            value={byPlan[p] ?? 0}
            active={planFilter === p}
            onClick={() => setPlanFilter(planFilter === p ? null : p)}
          />
        ))}
      </section>

      {/* Filter chips */}
      <section className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <Filter size={12} aria-hidden="true" />
          筛选:
        </span>
        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="inline-flex h-control items-center gap-1 rounded-control border border-border-soft bg-surface-1 px-2 text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            状态 · {STATUS_LABEL[statusFilter as LeadStatus]}
            <X size={12} aria-hidden="true" />
          </button>
        )}
        {planFilter && (
          <button
            type="button"
            onClick={() => setPlanFilter(null)}
            className="inline-flex h-control items-center gap-1 rounded-control border border-border-soft bg-surface-1 px-2 text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            计划 · {PLAN_LABEL[planFilter as LeadPlan]}
            <X size={12} aria-hidden="true" />
          </button>
        )}
        {!statusFilter && !planFilter && <span className="text-text-secondary/70">无</span>}
      </section>

      {error && (
        <div className="rounded-control border border-rose-300/40 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Table */}
      <section className="overflow-hidden rounded-control border border-border-soft bg-surface-1">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-border-soft bg-surface-muted text-[11px] uppercase tracking-[0.1em] text-text-secondary">
            <tr>
              <th className="px-4 py-2 font-medium">时间</th>
              <th className="px-4 py-2 font-medium">联系方式</th>
              <th className="px-4 py-2 font-medium">计划</th>
              <th className="px-4 py-2 font-medium">来源</th>
              <th className="px-4 py-2 font-medium">状态</th>
              <th className="px-4 py-2 font-medium">备注</th>
              <th className="w-12 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {leads.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-text-secondary">
                  当前筛选下还没有线索。
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="cursor-pointer transition hover:bg-surface-muted/60"
                onClick={() => setEditing(lead)}
              >
                <td className="whitespace-nowrap px-4 py-2 text-text-secondary">
                  {formatDateTime(lead.createdAt)}
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium text-text-primary">
                    {lead.contactName ?? "(未填)"}
                  </div>
                  <div className="text-[11px] text-text-secondary">
                    {[lead.phone, lead.wechat, lead.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </td>
                <td className="px-4 py-2 text-text-secondary">
                  {PLAN_LABEL[lead.plan as LeadPlan] ?? lead.plan}
                </td>
                <td className="px-4 py-2 text-text-secondary">{lead.source ?? "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      "inline-flex items-center rounded-control px-2 py-0.5 text-[11px] font-medium " +
                      (STATUS_COLOR[lead.status as LeadStatus] ?? "bg-ink/10 text-text-secondary")
                    }
                  >
                    {STATUS_LABEL[lead.status as LeadStatus] ?? lead.status}
                  </span>
                </td>
                <td className="max-w-[280px] truncate px-4 py-2 text-text-secondary">
                  {lead.notes ?? ""}
                </td>
                <td className="px-4 py-2 text-right">
                  <ArrowRight size={14} className="text-text-secondary" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {nextCursor && (
          <div className="border-t border-border-soft px-4 py-3 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="inline-flex h-control items-center gap-1 rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
              加载更多
            </button>
          </div>
        )}
      </section>

      {savedFlash && (
        <div className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-control border border-emerald-300/40 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 shadow-sm dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-200">
          <CheckCircle2 size={14} aria-hidden="true" />
          {savedFlash}
        </div>
      )}

      {editing && (
        <EditDrawer
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated, message) => {
            setEditing(null);
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setSavedFlash(message);
            setTimeout(() => setSavedFlash(null), 2400);
            void refreshStats();
          }}
        />
      )}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone?: LeadStatus;
}

function StatTile({ label, value, active, onClick, tone }: StatTileProps): JSX.Element {
  const colorTone: Record<LeadStatus, string> = STATUS_COLOR;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-control border bg-surface-1 px-3 py-3 text-left transition " +
        (active
          ? "border-cobalt/50 ring-2 ring-cobalt/15"
          : "border-border-soft hover:border-cobalt/40")
      }
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-text-secondary">
        {tone && (
          <span
            className={"inline-block h-2 w-2 rounded-full " + (colorTone[tone] ?? "").split(" ")[0]}
          />
        )}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-text-primary">{value}</div>
    </button>
  );
}

interface PlanTileProps {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}

function PlanTile({ label, value, active, onClick }: PlanTileProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-between rounded-control border bg-surface-1 px-3 py-3 text-left transition " +
        (active
          ? "border-cobalt/50 ring-2 ring-cobalt/15"
          : "border-border-soft hover:border-cobalt/40")
      }
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary">计划</div>
        <div className="mt-1 text-sm font-medium text-text-primary">{label}</div>
      </div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </button>
  );
}

interface EditDrawerProps {
  lead: Lead;
  onClose: () => void;
  onSaved: (lead: Lead, message: string) => void;
}

function EditDrawer({ lead, onClose, onSaved }: EditDrawerProps): JSX.Element {
  const [status, setStatus] = useState<LeadStatus>((lead.status as LeadStatus) ?? "new");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/leads/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const json = (await res.json()) as
        | { ok: true; lead: Lead }
        | { ok: false; code?: string; message?: string };
      if (!("ok" in json) || !json.ok) {
        setError(("message" in json && json.message) || "保存失败,请稍后重试。");
        return;
      }
      onSaved(json.lead, "已保存");
    } catch (e) {
      setError("网络异常,请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border-soft bg-surface-1 shadow-xl">
        <header className="flex items-center justify-between border-b border-border-soft px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
              LEAD
            </p>
            <h2 className="mt-1 text-base font-semibold text-text-primary">
              {lead.contactName ?? "未填写姓名"}
            </h2>
            <p className="mt-0.5 text-[12px] text-text-secondary">{lead.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-control text-text-secondary hover:bg-surface-muted"
            aria-label="关闭"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-[13px]">
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary">
              联系方式
            </h3>
            <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-text-secondary">电话</dt>
              <dd className="text-text-primary">{lead.phone ?? "—"}</dd>
              <dt className="text-text-secondary">微信</dt>
              <dd className="text-text-primary">{lead.wechat ?? "—"}</dd>
              <dt className="text-text-secondary">邮箱</dt>
              <dd className="break-all text-text-primary">{lead.email ?? "—"}</dd>
              <dt className="text-text-secondary">公司</dt>
              <dd className="text-text-primary">{lead.company ?? "—"}</dd>
              <dt className="text-text-secondary">来源</dt>
              <dd className="text-text-primary">{lead.source ?? "—"}</dd>
              <dt className="text-text-secondary">时间</dt>
              <dd className="text-text-primary">{formatDateTime(lead.createdAt)}</dd>
            </dl>
          </section>

          <section className="mt-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary">
              状态
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={
                    "inline-flex h-control items-center rounded-control px-2.5 text-[12px] font-medium transition " +
                    (status === s
                      ? "bg-ink text-paper"
                      : "border border-border-soft bg-surface-1 text-text-secondary hover:border-cobalt/40 hover:text-cobalt")
                  }
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-secondary">
              备注
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              maxLength={2000}
              className="w-full resize-none rounded-control border border-border-soft bg-surface-1 px-3 py-2 text-[13px] text-text-primary outline-none transition focus:border-cobalt/60 focus:ring-2 focus:ring-cobalt/15"
              placeholder="如:已微信联系,周六前回复方案。"
            />
            <p className="mt-1 text-[11px] text-text-secondary">
              {notes.length} / 2000
            </p>
          </section>

          {error && (
            <div className="mt-4 rounded-control border border-rose-300/40 bg-rose-50 px-3 py-2 text-[12px] text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border-soft bg-surface-1 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-control items-center rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-control items-center gap-1 rounded-control bg-cobalt px-3 text-[13px] font-medium text-paper transition hover:bg-cobalt/90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <ArrowDownUp size={12} />}
            保存
          </button>
        </footer>
      </aside>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
