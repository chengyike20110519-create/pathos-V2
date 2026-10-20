// /workbench/shortlists -- list every shortlist owned by the caller.
//
// Server component. The interactive create form lives in
// ShortlistList.tsx alongside this file.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { DatabaseNotConfiguredError } from "@/server/db";
import { listShortlistsForUser } from "@/lib/shortlists";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import ShortlistList from "./ShortlistList";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: { error?: string; ok?: string };
}

export default async function ShortlistsPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/workbench/shortlists");
  }
  let lists: Awaited<ReturnType<typeof listShortlistsForUser>> = [];
  let dbError: string | null = null;
  try {
    lists = await listShortlistsForUser(user.id);
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      dbError = "数据库未配置,无法加载选校清单。";
    } else {
      dbError = "暂时无法加载选校清单,请稍后重试。";
    }
    lists = [];
  }
  return (
    <main className="min-h-screen bg-[#eef1f5]">
      <EnterprisePageHeader
        eyebrow="Shortlists / PathOS"
        title="我的选校清单"
        description="按冲刺 / 匹配 / 保底三档分组管理目标学校，并连接截止日、预算和报告。"
        icon={ListChecks}
        stats={[
          { label: "清单", value: lists.length },
          { label: "分组", value: "3 档" },
          { label: "上限", value: "20 所 / 清单" },
          { label: "状态", value: dbError ? "数据库待配置" : "可用" },
        ]}
        sourceNote={dbError ?? "清单归属当前用户；顾问协作和组织权限由服务端校验。"}
        actions={<Link href="/s/home" className="inline-flex min-h-control items-center rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]">返回工作台</Link>}
      />
      <div className="mx-auto w-full max-w-page px-4 pb-16 sm:px-6">
      {dbError && (
        <div className="mt-6 rounded-control border border-amber-300/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
          {dbError}
        </div>
      )}
        <ShortlistList
          initialLists={lists}
          initialError={searchParams?.error ?? null}
          initialOk={searchParams?.ok ?? null}
        />
      {lists.length === 0 && !dbError && (
        <section className="mt-10 rounded-control border border-dashed border-border-soft bg-surface-1 p-8 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-control bg-cobalt/10 text-cobalt">
            <ListChecks size={18} aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-text-primary">还没有选校清单</h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            建议按申请季创建一份(例如 <span className="font-medium text-text-primary">Fall 2027 申请季</span>)。
          </p>
        </section>
        )}
      </div>
    </main>
  );
}
