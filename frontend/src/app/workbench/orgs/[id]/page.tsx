// /workbench/orgs/[id] -- the per-org dashboard.
//
// Server component. Fetches the org, the current role, members, and
// the pending invitation list in one round trip. The interactive
// "invite" / "revoke" affordances live in the client component
// alongside this file.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { DatabaseNotConfiguredError } from "@/server/db";
import {
  getOrganization,
  membershipRole,
  listOrgMembers,
} from "@/lib/orgs";
import { listInvitationsForOrg } from "@/lib/invitations";
import OrgDetail from "./OrgDetail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
  searchParams?: { error?: string; ok?: string };
}

export default async function OrgDetailPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/workbench/orgs/${encodeURIComponent(params.id)}`);
  }
  if (!params.id || params.id.length > 64) notFound();

  let org;
  let role;
  let members: Awaited<ReturnType<typeof listOrgMembers>> = [];
  let invitations: Awaited<ReturnType<typeof listInvitationsForOrg>> = [];
  let dbError: string | null = null;
  try {
    org = await getOrganization(params.id);
    if (!org) notFound();
    role = await membershipRole(params.id, user.id);
    if (!role) {
      // Caller is signed in but not a member. Show a 404 rather than
      // a 403 so the existence of org ids is not leaked.
      notFound();
    }
    const [m, inv] = await Promise.all([
      listOrgMembers(params.id),
      listInvitationsForOrg(params.id),
    ]);
    members = m;
    invitations = inv;
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      dbError = "数据库未配置,无法加载组织详情。";
    } else {
      dbError = "暂时无法加载组织详情,请稍后重试。";
    }
  }
  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
      <Link
        href="/workbench/orgs"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary hover:text-cobalt"
      >
        ← 返回组织列表
      </Link>
      {dbError ? (
        <div className="mt-6 rounded-control border border-amber-300/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
          {dbError}
        </div>
      ) : org && role ? (
        <OrgDetail
          organization={org}
          role={role}
          members={members}
          invitations={invitations}
          initialError={searchParams?.error ?? null}
          initialOk={searchParams?.ok ?? null}
        />
      ) : null}
    </main>
  );
}
