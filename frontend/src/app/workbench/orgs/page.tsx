// /workbench/orgs -- list every organization the caller is a member of.
//
// Server component. We render an empty-state and a meta-panel rather
// than a redirect so a brand-new visitor who just signed in still
// sees a coherent page (the AuthButton + NavBar already cover
// unauthenticated state via /login).
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { DatabaseNotConfiguredError } from "@/server/db";
import { listOrganizationsForUser } from "@/lib/orgs";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import OrgList from "./OrgList";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: { error?: string; ok?: string };
}

export default async function OrgsPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/workbench/orgs");
  }
  let orgs: Awaited<ReturnType<typeof listOrganizationsForUser>> = [];
  let dbError: string | null = null;
  try {
    orgs = await listOrganizationsForUser(user.id);
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      dbError = "数据库未配置,无法加载组织列表。请联系管理员。";
    } else {
      dbError = "暂时无法加载组织列表,请稍后重试。";
    }
    orgs = [];
  }
  return (
    <main className="min-h-screen bg-[#eef1f5]">
      <EnterprisePageHeader
        eyebrow="Organizations / PathOS"
        title="我的组织"
        description="创建顾问公司或工作室，邀请团队成员，并管理学生清单与报告协作。"
        icon={Building2}
        stats={[
          { label: "组织", value: orgs.length },
          { label: "角色", value: "owner / advisor" },
          { label: "协作", value: "邀请链接" },
          { label: "状态", value: dbError ? "数据库待配置" : "可用" },
        ]}
        sourceNote={dbError ?? "组织、成员和邀请均由服务端权限层校验，不信任前端状态。"}
        actions={<Link href="/s/home" className="inline-flex min-h-control items-center rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]">返回工作台</Link>}
      />
      <div className="mx-auto w-full max-w-page px-4 pb-16 sm:px-6">
      {dbError && (
        <div className="mt-6 rounded-control border border-amber-300/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
          {dbError}
        </div>
      )}
        <OrgList
          initialOrgs={orgs}
          initialError={searchParams?.error ?? null}
          initialOk={searchParams?.ok ?? null}
        />
      {orgs.length === 0 && !dbError && (
        <section className="mt-10 rounded-control border border-dashed border-border-soft bg-surface-1 p-8 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-control bg-cobalt/10 text-cobalt">
            <Building2 size={18} aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-text-primary">
            创建你的第一个组织
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            组织是一所学校一码,可以容纳多位顾问、共享报告、协同管理学生清单。
          </p>
        </section>
        )}
      </div>
    </main>
  );
}

