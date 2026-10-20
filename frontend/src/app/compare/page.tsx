import type { Metadata } from "next";
import { Suspense } from "react";
import ComparisonMatrix from "@/components/compare/ComparisonMatrix";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "学校对比工作台 | PathOS",
  description:
    "最多比较 4 所学校的录取、成本、成果、专业、地点与截止日期；approved facts 优先，Preview 字段显式降级。",
};

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-page px-4 py-16">
          <p className="text-sm text-text-secondary">正在准备对比工作台…</p>
        </main>
      }
    >
      <ComparisonMatrix />
    </Suspense>
  );
}
