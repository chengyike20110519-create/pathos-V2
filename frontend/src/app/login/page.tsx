// Magic-link sign-in page. Server component shells the client form
// and reads any `?error=` from the callback redirect.
import { Compass } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { isPreviewAuthEnabled, safePreviewDestination } from "@/lib/preview-auth";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams?: { error?: string; next?: string };
}

export default function LoginPage({ searchParams }: LoginPageProps): JSX.Element {
  if (isPreviewAuthEnabled()) {
    const target = safePreviewDestination(searchParams?.next ?? null);
    redirect(`/api/auth/preview-login?next=${encodeURIComponent(target)}`);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-6 rounded-control border border-border-soft bg-surface-1 p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Link
            href="/"
            aria-label="PathOS 首页"
            className="grid h-10 w-10 place-items-center rounded-control bg-ink text-paper dark:bg-paper dark:text-ink"
          >
            <Compass size={18} aria-hidden="true" />
          </Link>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-text-primary">
            登录 PathOS
          </h1>
          <p className="text-[13px] leading-relaxed text-text-secondary">
            无需密码，输入邮箱后我们会发送一条登录链接给你。
          </p>
        </div>
        <LoginForm initialError={searchParams?.error} />
        <div className="border-t border-border-soft pt-4 text-center text-[12px] text-text-tertiary">
          首次使用？登录即自动创建账号。
        </div>
      </div>
    </main>
  );
}
