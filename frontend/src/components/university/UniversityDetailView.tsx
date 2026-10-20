"use client";

// UniversityDetailView — the visible shell for /university/[id]. Lifted
// out of `page.tsx` so that route file can stay a server component
// (because `output: export` requires `generateStaticParams`).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, GraduationCap, MapPin, Scale } from "lucide-react";
import { useDataSource } from "@/services/data-source-provider";
import { useStatusDictionary, useUniversityDetail } from "@/hooks/use-data-source";
import { useCompareStore } from "@/state/compare-store";
import { UniversityProfilePanel } from "@/components/university/UniversityProfilePanel";
import { UniversityFactSection } from "@/components/university/UniversityFactSection";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import { SchoolQuickRead } from "@/components/university/SchoolQuickRead";
import { AddToShortlist } from "@/components/shortlists/AddToShortlist";
import PageMotion from "@/components/shared/PageMotion";
import {
  DataLoadingState,
  DataEmptyState,
  PreviewErrorState,
  PreviewWarningBanner,
} from "@/components/shared/data-states";

export function UniversityDetailView({ id }: { id: string }) {
  const source = useDataSource();
  const detail = useUniversityDetail(source, id);
  const dict = useStatusDictionary(source);
  const router = useRouter();
  const compare = useCompareStore();
  const [compareAdded, setCompareAdded] = useState<string | null>(null);

  if (detail.state.status === "loading") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12" aria-busy="true">
        <DataLoadingState message="正在加载学校档案…" />
      </main>
    );
  }

  if (detail.state.status === "error") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <PreviewErrorState
          code={detail.state.code}
          onRetry={() => detail.reload()}
        />
        <Link
          href="/map"
          className="mt-6 inline-block rounded-lg bg-cobalt px-4 py-1.5 text-sm text-white"
        >
          返回地图
        </Link>
      </main>
    );
  }

  if (detail.state.status === "ready" && detail.state.data == null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <DataEmptyState
          title="未找到该学校"
          description={
            <>
              编号 <span className="font-mono">{id}</span> 当前不在数据集中。
            </>
          }
          action={
            <Link
              href="/map"
              className="rounded-md border border-line/60 bg-panel px-2.5 py-1 text-xs font-medium text-ink/70 hover:border-cobalt/40 hover:text-cobalt"
            >
              返回地图
            </Link>
          }
        />
      </main>
    );
  }

  if (detail.state.status !== "ready" || !detail.state.data) {
    return null;
  }

  const d = detail.state.data;
  const dictionary = dict.state.status === "ready" ? dict.state.data : undefined;

  return (
    <PageMotion>
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 lg:max-w-7xl">
      <nav className="mb-4 flex items-center justify-between gap-2 text-sm text-ink/60">
        <Link
          href="/map"
          className="inline-flex min-h-control-lg items-center gap-1.5 rounded-md px-2 hover:bg-ink/8"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>返回地图</span>
        </Link>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-control-lg items-center rounded-md px-2 text-[11px] text-ink/44 hover:bg-ink/8"
        >
          返回上一页
        </button>
      </nav>

      <EnterprisePageHeader
        eyebrow="University Detail"
        title={d.chineseName}
        description={
          <>
            <span lang="en">{d.name}</span>
            <br />
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" />
              {d.city}, {d.state}, {d.country}
            </span>
          </>
        }
        icon={GraduationCap}
        stats={[
          { label: "排名层", value: d.rankingBand ?? "未采集" },
          { label: "城市 / 州", value: `${d.city}, ${d.state}` },
          { label: "数据模式", value: d.previewOnly ? "Preview" : "Production" },
          { label: "对比位置", value: `${compare.ids.length + (compare.has(d.id) ? 0 : 1)}/${compare.maxItems}` },
        ]}
        sourceNote={d.previewOnly ? "当前展示字段来自约束预览集；生产事实层上线后自动切换为完整档案。" : "当前档案已连接生产数据源。"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/s/home"
            className="inline-flex min-h-control-lg items-center rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]"
          >
            打开专业数据工作台
          </Link>
          <Link
            href="/costs"
            className="inline-flex min-h-control-lg items-center rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]"
          >
            计算费用
          </Link>
          <AddToShortlist universityId={d.id} universityName={d.chineseName ?? d.name} />
          {(() => {
            const inCompare = compare.has(d.id);
            const isFull = !inCompare && compare.ids.length >= compare.maxItems;
            const handleAdd = () => {
              const ok = compare.add(d.id);
              if (ok) {
                setCompareAdded("added");
                setTimeout(() => setCompareAdded(null), 1800);
              } else {
                setCompareAdded("full");
                setTimeout(() => setCompareAdded(null), 1800);
              }
            };
            return (
              <button
                type="button"
                onClick={handleAdd}
                disabled={isFull}
                title={isFull ? `对比最多 ${compare.maxItems} 所学校` : inCompare ? "已加入对比" : "加入对比"}
                className="inline-flex min-h-control-lg items-center gap-1 rounded-none bg-[#bd5a3e] px-3 text-xs font-semibold text-white transition hover:bg-[#dd8568] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Scale size={13} aria-hidden="true" />
                {inCompare ? "已在对比" : isFull ? `对比已满 (${compare.maxItems})` : "加入对比"}
              </button>
            );
          })()}
          <Link
            href="/compare"
            className="inline-flex min-h-control-lg items-center rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]"
          >
            打开对比 ({compare.ids.length}/{compare.maxItems})
          </Link>
          {compareAdded === "added" ? <span className="text-[11px] text-jade">已加入</span> : null}
          {compareAdded === "full" ? <span className="text-[11px] text-persimmon">已达上限，先到对比页移除</span> : null}
          </div>
        }
      />

      <SchoolQuickRead detail={d} />
      <UniversityFactSection universityId={d.id} />
      <UniversityProfilePanel detail={d} statusDictionary={dictionary} />
    </main>
    </PageMotion>
  );
}
