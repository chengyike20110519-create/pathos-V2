// /workbench/shortlists/[id] -- the per-list dashboard.
//
// Server component. Fetches the list and the items grouped by bucket
// in one round trip, then hands off to ShortlistBoard for the
// drag-friendly three-column view.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { DatabaseNotConfiguredError } from "@/server/db";
import {
  getShortlist,
  getShortlistGrouped,
  type ShortlistGrouped,
} from "@/lib/shortlists";
import { aggregateShortlistDeadlines } from "@/server/information/aggregate-deadline";
import ShortlistBoard from "./ShortlistBoard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

interface DeadlineSummary {
  generatedAt: string;
  timezoneNotice: string;
  coverage: {
    scheduled: number;
    missing: number;
    invalid: number;
  };
  items: Array<{
    title: string;
    dueAtUtc: string;
    sourceUrl: string;
    retrievedAt: string;
  }>;
  universitiesWithoutDeadlineFacts: string[];
}

export default async function ShortlistDetailPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/login?next=/workbench/shortlists/${encodeURIComponent(params.id)}`,
    );
  }
  if (!params.id || params.id.length > 64) notFound();

  let list;
  let groups: ShortlistGrouped = { reach: [], match: [], safety: [] };
  let dbError: string | null = null;
  let deadlineSummary: DeadlineSummary | null = null;
  let deadlineError: string | null = null;
  let listNotFound = false;
  try {
    list = await getShortlist(params.id);
    if (!list || list.ownerUserId !== user.id) listNotFound = true;
    if (!listNotFound) groups = await getShortlistGrouped(params.id);
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      dbError = "数据库未配置,无法加载选校清单。";
    } else {
      dbError = "暂时无法加载选校清单,请稍后重试。";
    }
    list = null;
    groups = { reach: [], match: [], safety: [] };
  }
  if (listNotFound) notFound();

  if (list) {
    try {
      const calendar = await aggregateShortlistDeadlines({
        shortlistId: params.id,
        userId: user.id,
      });
      if (calendar) {
        deadlineSummary = {
          generatedAt: calendar.generatedAt,
          timezoneNotice: calendar.timezoneNotice,
          coverage: {
            scheduled: calendar.coverage.scheduled,
            missing: calendar.coverage.missing,
            invalid: calendar.coverage.invalid,
          },
          items: [...calendar.groups.urgent, ...calendar.groups.upcoming]
            .slice(0, 6)
            .map((item) => ({
              title: item.deadline.title,
              dueAtUtc: item.deadline.dueAtUtc,
              sourceUrl: item.deadline.sourceUrl,
              retrievedAt: item.deadline.retrievedAt,
            })),
          universitiesWithoutDeadlineFacts:
            calendar.universitiesWithoutDeadlineFacts,
        };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deadlineError =
        message.includes("facts") && message.includes("does not exist")
          ? "信息平台迁移尚未执行，清单暂无法关联申请截止日。"
          : "已审核截止日事实层暂不可用，清单仍可正常编辑。";
    }
  }
  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
      <Link
        href="/workbench/shortlists"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary hover:text-cobalt"
      >
        ← 返回选校清单
      </Link>
      {dbError ? (
        <div className="mt-6 rounded-control border border-amber-300/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
          {dbError}
        </div>
      ) : list ? (
        <ShortlistBoard
          shortlist={list}
          groups={groups}
          deadlineSummary={deadlineSummary}
          deadlineError={deadlineError}
        />
      ) : null}
    </main>
  );
}
