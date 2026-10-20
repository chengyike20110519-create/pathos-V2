// /invite/[token] -- landing page for an invitation link.
//
// Server component. Three cases:
//   1. Caller is logged in: hand off to InviteAccept, which will
//      POST /api/invitations/[token] and redirect to the org page.
//   2. Caller is not logged in: show a sign-in CTA that preserves
//      `?next=/invite/<token>` so the magic-link callback lands them
//      back here after auth.
//   3. Token is invalid or unknown: 404.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Compass } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { DatabaseNotConfiguredError } from "@/server/db";
import { getInvitationViewByToken } from "@/lib/invitations";
import InviteAccept from "./InviteAccept";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { token: string };
}

const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

export default async function InvitePage({ params }: PageProps): Promise<JSX.Element> {
  const token = params.token ?? "";
  if (!token || token.length < 32 || token.length > 64 || !TOKEN_RE.test(token)) {
    notFound();
  }

  let view;
  let dbError: string | null = null;
  try {
    view = await getInvitationViewByToken(token);
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      dbError = "数据库未配置,无法验证邀请链接。";
    } else {
      dbError = "暂时无法验证邀请链接,请稍后重试。";
    }
    view = null;
  }
  if (dbError) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <div className="rounded-control border border-amber-300/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
          {dbError}
        </div>
      </main>
    );
  }
  if (!view) notFound();

  const expired = new Date(view.expiresAt).getTime() <= Date.now();
  const alreadyAccepted = view.acceptedAt !== null;

  const user = await getCurrentUser();
  if (!user) {
    const next = `/invite/${encodeURIComponent(token)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // Logged-in but the invitation was already consumed or is past
  // its window. Tell the user honestly instead of pretending.
  if (alreadyAccepted) {
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
            该邀请已被接受
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            这条 {view.orgName} 的邀请链接已经在 {new Date(view.acceptedAt!).toLocaleString("zh-CN")} 被使用过,无法再次接受。
          </p>
          <Link
            href="/workbench/orgs"
            className="mt-5 inline-flex h-control items-center justify-center gap-1.5 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90"
          >
            前往我的组织
          </Link>
        </div>
      </main>
    );
  }
  if (expired) {
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
            邀请已过期
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            这条 {view.orgName} 的邀请链接已经在 {new Date(view.expiresAt).toLocaleString("zh-CN")} 过期。请联系邀请人重新发送。
          </p>
        </div>
      </main>
    );
  }

  return (
    <InviteAccept
      token={token}
      orgName={view.orgName}
      orgSlug={view.orgSlug}
      role={view.role}
      expiresAt={view.expiresAt}
      currentEmail={user.email}
    />
  );
}
