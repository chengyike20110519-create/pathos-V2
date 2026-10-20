import type { Metadata } from "next";
import { Suspense } from "react";
import { TrendLabView } from "@/components/trends/TrendLabView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "趋势台",
  description:
    "比较多所美国大学的录取率、学费、SAT 与 GPA 多年序列；保留来源与缺失语义，不插值、不预测。",
};

export default function TrendsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-page px-4 py-16">
          <p className="text-sm text-text-secondary">正在准备趋势台…</p>
        </main>
      }
    >
      <TrendLabView />
    </Suspense>
  );
}
