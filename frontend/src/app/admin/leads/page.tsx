// /admin/leads -- operator CRM for the lead pipeline.
//
// Server component. Loads stats + the initial page of leads, then
// hands the interactive UI off to LeadList.tsx (client). Auth: caller
// must be a member of at least one organization as owner or advisor.
// We render an empty-state rather than redirect so an authenticated
// user who is not yet in any org still sees a coherent page with the
// CTA to create one.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { DatabaseNotConfiguredError } from "@/server/db";
import { getPool } from "@/server/db";
import { getLeadStats, listLeads, type Lead } from "@/lib/leads";
import LeadList from "./LeadList";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: { status?: string; plan?: string };
}

async function checkAdvisor(userId: string): Promise<boolean> {
  const r = await getPool().query<{ role: "owner" | "advisor" }>(
    `SELECT role FROM org_memberships WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return r.rows.length > 0;
}

export default async function AdminLeadsPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/admin/leads");
  }
  const isAdvisor = await checkAdvisor(user.id);
  if (!isAdvisor) {
    return (
      <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
            ADMIN / LEADS
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            销售线索 CRM
          </h1>
        </header>
        <section className="mt-10 rounded-control border border-dashed border-border-soft bg-surface-1 p-8 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-control bg-cobalt/10 text-cobalt">
            <Inbox size={18} aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-text-primary">
            还没有加入任何组织
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            CRM 仅对组织 owner / advisor 开放。请先创建或加入一个组织。
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link
              href="/workbench/orgs"
              className="inline-flex h-control items-center rounded-control bg-cobalt px-3 text-[13px] font-medium text-paper transition hover:bg-cobalt/90"
            >
              管理我的组织
            </Link>
            <Link
              href="/s/home"
              className="inline-flex h-control items-center rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              返回工作台
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const statusFilter = ["new", "contacted", "qualified", "converted", "lost", "closed"].includes(
    String(searchParams?.status ?? ""),
  )
    ? String(searchParams?.status)
    : undefined;
  const planFilter = ["lead_intake", "single_report", "advisor_annual"].includes(
    String(searchParams?.plan ?? ""),
  )
    ? String(searchParams?.plan)
    : undefined;

  let leads: Lead[] = [];
  let total = 0;
  let byStatus: Record<string, number> = {};
  let byPlan: Record<string, number> = {};
  let nextCursor: string | null = null;
  let dbError: string | null = null;

  try {
    const [list, stats] = await Promise.all([
      listLeads({
        status: statusFilter as never,
        plan: planFilter as never,
        limit: 50,
      }),
      getLeadStats(),
    ]);
    leads = list.leads;
    nextCursor = list.nextCursor;
    total = stats.total;
    byStatus = stats.byStatus as unknown as Record<string, number>;
    byPlan = stats.byPlan as unknown as Record<string, number>;
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      dbError = "数据库未配置,无法加载线索。请联系管理员。";
    } else {
      dbError = "暂时无法加载线索,请稍后重试。";
    }
  }

  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
            ADMIN / LEADS
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            销售线索 CRM
          </h1>
          <p className="mt-2 max-w-xl text-sm text-text-secondary">
            查看、跟进并更新来自网站与报告流的潜在客户线索。
          </p>
        </div>
        <Link
          href="/s/home"
          className="inline-flex h-control items-center gap-1 rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
        >
          返回工作台
        </Link>
      </header>

      {dbError && (
        <div className="mt-6 rounded-control border border-amber-300/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
          {dbError}
        </div>
      )}

      {!dbError && (
        <LeadList
          initialLeads={leads}
          initialNextCursor={nextCursor}
          initialStatus={statusFilter ?? null}
          initialPlan={planFilter ?? null}
          initialTotal={total}
          initialByStatus={byStatus}
          initialByPlan={byPlan}
        />
      )}
    </main>
  );
}
