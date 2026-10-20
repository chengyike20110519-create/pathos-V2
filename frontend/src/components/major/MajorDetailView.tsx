"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, ArrowUpRight, GitCompareArrows, GraduationCap, Scale } from "lucide-react";

import {
  DataEmptyState,
  DataLoadingState,
  PreviewErrorState,
} from "@/components/shared/data-states";
import { V2Missing, V2PageHeader, V2Panel } from "@/components/v2/V2Primitives";
import { MAJOR_CATEGORIES } from "@/domain/information/major";
import { useCollegeGuides, useProgramCatalog } from "@/hooks/use-data-source";
import { useDataSource } from "@/services/data-source-provider";
import {
  aggregateMajorProfile,
  majorCompareHref,
  type MajorFieldValue,
} from "@/server/information/aggregate-major";

function FieldRows({ fields }: { fields: MajorFieldValue[] }) {
  return (
    <dl className="space-y-0 divide-y divide-border-soft/70">
      {fields.map((field) => (
        <div
          key={field.id}
          className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <dt className="text-[11px] font-medium text-text-muted">{field.label}</dt>
          <dd className="sm:text-right">
            {field.status === "approved_fact" ? (
              <span className="text-xs font-medium text-text-primary">
                {field.value}
                {field.sourceUrl ? (
                  <a
                    href={field.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 text-[10px] font-normal text-cobalt hover:underline"
                  >
                    来源
                  </a>
                ) : null}
              </span>
            ) : (
              <span className="text-xs italic text-text-muted">{field.value}</span>
            )}
            <span className="mt-0.5 block text-[10px] text-text-muted">
              {field.status === "approved_fact"
                ? field.academicYear ?? "学年待核验"
                : "尚未采集或尚未完成审核"}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SourceLabel({ source }: { source: string }) {
  const labels: Record<string, string> = {
    top_programs: "学校专业标签",
    guide_structured_programs: "Guide 结构化字段",
    approved_fact: "Approved fact",
  };
  return (
    <span className="rounded-full border border-border-soft bg-surface-muted/40 px-2 py-0.5 text-[10px] text-text-secondary">
      {labels[source] ?? source}
    </span>
  );
}

export default function MajorDetailView({ slug }: { slug: string }) {
  const source = useDataSource();
  const summaries = useProgramCatalog(source);
  const guides = useCollegeGuides(source);
  const schools = useMemo(
    () => (summaries.state.status === "ready" ? summaries.state.data : []),
    [summaries.state],
  );
  const profile = useMemo(
    () => {
      const guideRecords = guides.state.status === "ready" ? guides.state.data : [];
      return aggregateMajorProfile(slug, { universities: schools, guides: guideRecords });
    },
    [guides.state, schools, slug],
  );

  return (
    <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8">
      <V2PageHeader
        eyebrow="专业详情"
        title={profile?.definition.nameZh ?? "专业详情"}
        description={
          profile
            ? profile.definition.summary
            : "这个专业不在当前专业档案集中。"
        }
        action={
          profile ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/majors"
                className="inline-flex items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
              >
                <ArrowLeft size={13} />
                返回专业档案
              </Link>
              <Link
                href={majorCompareHref(profile)}
                className="inline-flex items-center gap-1.5 rounded-control bg-cobalt px-3 py-1.5 text-xs font-medium text-paper transition hover:bg-cobalt/90"
              >
                <Scale size={13} />
                对比代表学校
              </Link>
            </div>
          ) : undefined
        }
      />

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
      ) : !profile ? (
        <DataEmptyState
          title="未找到该专业"
          description="请从专业档案索引进入核心专业与扩展专业。"
          action={
            <Link
              href="/majors"
              className="rounded-control border border-border-soft bg-surface-1 px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              查看专业档案
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <V2Panel className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                  {MAJOR_CATEGORIES[profile.definition.category]}
                </span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                  {profile.schools.length} 所已关联
                </span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                  {profile.totalApprovedFacts} 条 approved fact
                </span>
              </div>
              <h2 className="mt-3 text-sm font-semibold text-text-primary">专业边界</h2>
              <p className="mt-2 text-xs leading-6 text-text-secondary">{profile.definition.boundary}</p>
              <p className="mt-3 text-[11px] leading-5 text-text-muted">
                学校列表来自后台已收录专业目录。以下展示前 8 所，排序依据学校全美排名，不是该专业实力排名；没有专业级证据的学校不标为“优势”。
              </p>
            </V2Panel>
            <V2Panel revealDelay={160}>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <GitCompareArrows size={14} className="text-cobalt" />
                相近专业差异
              </h2>
              <div className="mt-3 space-y-3">
                {profile.definition.adjacent.map((adjacent) => (
                  <div key={adjacent.slug} className="rounded-control border border-border-soft bg-surface-muted/30 p-3">
                    <Link
                      href={"/majors/" + adjacent.slug}
                      className="text-xs font-semibold text-cobalt hover:underline"
                    >
                      {adjacent.nameZh}
                    </Link>
                    <p className="mt-1 text-[11px] leading-5 text-text-secondary">
                      {adjacent.difference}
                    </p>
                  </div>
                ))}
              </div>
            </V2Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <V2Panel>
              <h2 className="text-sm font-semibold text-text-primary">申请要求</h2>
              <p className="mt-1 text-[11px] text-text-muted">
                项目级要求必须来自 approved facts；当前没有事实时保持待核验。
              </p>
              <div className="mt-2">
                <FieldRows fields={profile.applicationRequirements} />
              </div>
            </V2Panel>
            <V2Panel revealDelay={160}>
              <h2 className="text-sm font-semibold text-text-primary">就业与深造</h2>
              <p className="mt-1 text-[11px] text-text-muted">
                不使用行业印象或第三方汇总填充；无来源数据一律缺失。
              </p>
              <div className="mt-2">
                <FieldRows fields={profile.outcomes} />
              </div>
            </V2Panel>
          </div>

          <V2Panel>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <GraduationCap size={14} className="text-cobalt" />
                  已关联学校
                </h2>
                <p className="mt-1 text-[11px] text-text-muted">
                  共 {profile.schools.length} 所；展示前 {profile.representativeSchools.length} 所。
                </p>
              </div>
              <Link
                href={majorCompareHref(profile)}
                className="inline-flex h-control items-center gap-1 rounded-control border border-border-soft px-2.5 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
              >
                <Scale size={12} />
                打开对比
              </Link>
            </div>

            {profile.representativeSchools.length === 0 ? (
              <div className="mt-4">
                <DataEmptyState title="暂无已关联学校" description="当前数据源没有匹配该专业的学校标签或事实。" />
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {profile.representativeSchools.map((item) => (
                  <Link
                    key={item.universityId}
                    href={"/university/" + item.universityId}
                    className="block rounded-control border border-border-soft bg-surface-muted/25 p-3 transition hover:border-cobalt/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {item.university.nameZh || item.university.chineseName || item.university.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-text-muted">
                          {item.university.city ?? "城市暂无"}，{item.university.state ?? "州 / 地区暂无"}
                        </p>
                      </div>
                      <ArrowUpRight size={14} className="mt-1 shrink-0 text-text-muted" />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2">
                      <div>
                        <dt className="text-[10px] text-text-muted">全美排名</dt>
                        <dd className="text-xs font-medium text-text-primary">
                          {item.university.rankingSummary?.nationalRank ?? <V2Missing />}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-text-muted">费用参考</dt>
                        <dd className="text-xs font-medium text-text-primary">
                          {item.university.costSummary?.displayLabel ?? <V2Missing />}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] text-text-muted">匹配项目</dt>
                        <dd className="truncate text-xs font-medium text-text-primary" title={item.matchedProgramNames.join("、")}>
                          {item.matchedProgramNames[0] ?? <V2Missing />}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.sources.map((associationSource) => (
                        <SourceLabel key={associationSource} source={associationSource} />
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </V2Panel>
        </div>
      )}
    </main>
  );
}
