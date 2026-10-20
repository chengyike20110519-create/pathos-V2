"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Scale, Search } from "lucide-react";

import {
  DataEmptyState,
  DataLoadingState,
  PreviewErrorState,
} from "@/components/shared/data-states";
import { V2PageHeader, V2Panel } from "@/components/v2/V2Primitives";
import { MAJOR_CATEGORIES, type MajorCategoryId } from "@/domain/information/major";
import { useCollegeGuides, useProgramCatalog } from "@/hooks/use-data-source";
import { useDataSource } from "@/services/data-source-provider";
import {
  aggregateMajorCatalog,
  majorCompareHref,
  type MajorProfile,
} from "@/server/information/aggregate-major";

type CategoryFilter = "all" | MajorCategoryId;

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "computing", label: MAJOR_CATEGORIES.computing },
  { id: "business", label: MAJOR_CATEGORIES.business },
  { id: "science", label: MAJOR_CATEGORIES.science },
  { id: "social-science", label: MAJOR_CATEGORIES["social-science"] },
  { id: "arts", label: MAJOR_CATEGORIES.arts },
  { id: "health", label: MAJOR_CATEGORIES.health },
  { id: "engineering", label: MAJOR_CATEGORIES.engineering },
];

function useReadySchools() {
  const source = useDataSource();
  const summaries = useProgramCatalog(source);
  const guides = useCollegeGuides(source);
  const schools = useMemo(
    () => (summaries.state.status === "ready" ? summaries.state.data : []),
    [summaries.state],
  );
  return { summaries, schools, guides };
}

function schoolNames(profile: MajorProfile, limit = 3): string[] {
  return profile.representativeSchools
    .slice(0, limit)
    .map((item) => item.university.nameZh || item.university.chineseName || item.university.name);
}

export default function MajorIndexView() {
  const { summaries, schools, guides } = useReadySchools();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const catalog = useMemo(
    () => {
      const guideRecords = guides.state.status === "ready" ? guides.state.data : [];
      return aggregateMajorCatalog({ universities: schools, guides: guideRecords });
    },
    [guides.state, schools],
  );
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return catalog.filter((profile) => {
      const matchesCategory = category === "all" || profile.definition.category === category;
      if (!matchesCategory) return false;
      if (!keyword) return true;
      return (
        profile.definition.nameZh.toLowerCase().includes(keyword) ||
        profile.definition.nameEn.toLowerCase().includes(keyword) ||
        profile.definition.summary.toLowerCase().includes(keyword)
      );
    });
  }, [catalog, category, query]);

  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8">
      <V2PageHeader
        eyebrow="专业档案"
        title="按专业理解美国本科方向"
        description="核心 12 个专业加数据支持的扩展方向，先划清学科边界，再聚合学校专业标签与 Guide 结构化字段。项目级申请要求、就业与薪资必须等待 approved facts，缺失不会被伪装成数字。"
        action={
          <Link
            href="/s/majors"
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
          >
            <BookOpen size={13} />
            查看旧专业聚合
          </Link>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-md">
          <span className="sr-only">搜索专业</span>
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索专业名称或说明"
            className="h-control w-full rounded-control border border-border-soft bg-surface-muted/30 pl-9 pr-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-cobalt/50"
          />
        </label>
        <div
          role="tablist"
          aria-label="专业类别"
          className="flex flex-wrap gap-2 rounded-control border border-border-soft bg-surface-1 p-1"
        >
          {CATEGORY_FILTERS.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(item.id)}
                className={active
                  ? "h-control rounded-control bg-cobalt px-2.5 text-[11px] font-medium text-paper"
                  : "h-control rounded-control px-2.5 text-[11px] font-medium text-text-secondary transition hover:bg-surface-muted hover:text-cobalt"}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {summaries.state.status === "loading" ? (
        <div className="py-10">
          <DataLoadingState message="正在读取学校专业标签..." />
        </div>
      ) : summaries.state.status === "error" ? (
        <div className="py-10">
          <PreviewErrorState
            code={summaries.state.code}
            onRetry={summaries.reload}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4">
          <DataEmptyState title="没有匹配的专业" description="请调整关键词或类别。" />
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((profile, index) => (
            <V2Panel
              key={profile.definition.slug}
              className="flex flex-col justify-between"
              revealDelay={index < 6 ? (index * 80) as 80 | 160 | 240 | 320 | 400 : 480}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-cobalt">
                      {MAJOR_CATEGORIES[profile.definition.category]}
                    </p>
                    <h2 className="mt-1 text-sm font-semibold text-text-primary">
                      {profile.definition.nameZh}
                    </h2>
                    <p className="text-[10px] text-text-muted">{profile.definition.nameEn}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                    {profile.schools.length} 所
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-text-secondary">{profile.definition.summary}</p>
                <p className="mt-3 text-[11px] leading-5 text-text-muted">
                  <span className="font-medium text-text-secondary">边界：</span>
                  {profile.definition.boundary}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {schoolNames(profile).length > 0 ? (
                    schoolNames(profile).map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-border-soft bg-surface-muted/40 px-2 py-0.5 text-[10px] text-text-secondary"
                      >
                        {name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] italic text-text-muted">代表学校待关联</span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-soft/70 pt-3">
                <Link
                  href={"/majors/" + profile.definition.slug}
                  className="inline-flex h-control items-center gap-1 rounded-control bg-cobalt px-2.5 text-[11px] font-medium text-paper transition hover:bg-cobalt/90"
                >
                  专业档案
                  <ArrowUpRight size={12} />
                </Link>
                <Link
                  href={majorCompareHref(profile)}
                  className="inline-flex h-control items-center gap-1 rounded-control border border-border-soft px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                >
                  <Scale size={12} />
                  对比学校
                </Link>
                <span className="ml-auto text-[10px] text-text-muted">
                  {profile.missingFieldCount} 项待核验
                </span>
              </div>
            </V2Panel>
          ))}
        </div>
      )}
    </main>
  );
}
