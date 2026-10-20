import type { Metadata } from "next";
import PageMotion from "@/components/shared/PageMotion";
import { InformationFeedView } from "@/components/information/InformationFeedView";
import {
  InformationSchemaNotReadyError,
  getInformationFeed,
  type InformationFeed,
} from "@/server/information/event-repository";
import { DatabaseNotConfiguredError } from "@/server/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "机会动态 | PathOS",
  description:
    "基于已审核事实的学校、项目与奖学金变化信息流，保留旧值、新值、影响、行动截止日和来源。",
};

function unavailableMessage(error: unknown): string {
  if (error instanceof DatabaseNotConfiguredError) return error.message;
  if (error instanceof InformationSchemaNotReadyError) return error.message;
  return "已审核事件层暂不可用。为避免误导，页面不会显示缓存或示例动态。";
}

export default async function OpportunitiesPage() {
  let feed: InformationFeed | undefined;
  let error: string | undefined;
  try {
    feed = await getInformationFeed({ limit: 100 });
  } catch (e) {
    console.error("[opportunities/page] information feed failed:", e);
    error = unavailableMessage(e);
  }

  return (
    <PageMotion>
      <main className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
        <header className="border-b border-border-soft pb-6" data-reveal="true">
          <p className="text-label font-semibold uppercase tracking-[0.14em] text-cobalt">
            INFORMATION FEED
          </p>
          <h1 className="mt-1 text-page text-text-primary" data-heading-stagger="true">
            机会动态
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
            只把完成审核并发布的学校、项目、专业和奖学金变化放入事件流。每条记录保留旧值、新值、影响说明、行动截止日和来源。
          </p>
        </header>

        <div className="mt-8">
          <InformationFeedView feed={feed} error={error} />
        </div>
      </main>
    </PageMotion>
  );
}
