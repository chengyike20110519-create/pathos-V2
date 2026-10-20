"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen } from "lucide-react";
import { useProgramCatalog, useUniversityDetail } from "@/hooks/use-data-source";
import { useDataSource } from "@/services/data-source-provider";
import { normalizeProgramName, programDefinition } from "@/lib/university-programs";
import { fipsFromAbbr } from "@/config/states.config";

export default function ProgramExplorer() {
  const params = useSearchParams();
  const name = params.get("name")?.slice(0, 240) ?? "";
  const universityId = params.get("universityId");
  const source = useDataSource();
  const catalog = useProgramCatalog(source);
  const school = useUniversityDetail(source, universityId);
  const detail = school.state.status === "ready" ? school.state.data : null;
  const definition = programDefinition(name);
  const spotlight = detail?.programSpotlights?.find((program) => normalizeProgramName(program.name) === normalizeProgramName(name));
  const urls = detail?.programs.find((program) => normalizeProgramName(program.name) === normalizeProgramName(name))?.sourceUrls ?? [];
  const officialUrl = spotlight?.sourceUrl ?? urls[0];
  // Exact directory names, not fuzzy name similarity or institutional rank.
  const related = catalog.state.status === "ready" ? catalog.state.data.filter((university) =>
    university.topPrograms?.some((program) => normalizeProgramName(program) === normalizeProgramName(name))) : [];
  const stateFips = detail?.state ? fipsFromAbbr(detail.state) : undefined;
  const back = `/map?${new URLSearchParams({ ...(stateFips ? { state: stateFips } : {}), ...(name ? { program: name } : {}) })}`;

  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-8 text-ink">
    <Link href={back} className="inline-flex items-center gap-1 text-sm text-cobalt hover:underline"><ArrowLeft size={14} />返回地图</Link>
    <header><p className="text-xs text-ink/45">专业探索 · 本科项目与目录</p><h1 className="mt-2 text-2xl font-semibold">{spotlight?.nameZh ?? definition?.nameZh ?? (name || "请选择专业")}</h1><p className="mt-1 text-sm text-ink/55">{name}</p></header>
    <section className="rounded-xl border border-line/60 bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold"><BookOpen size={17} />专业介绍</h2>
      <p className="mt-3 text-sm leading-7 text-ink/75">{(spotlight?.kind === "distinctive" ? spotlight.reason : definition?.summary) ?? "暂未收录经审核的专业介绍；不根据专业名称推测课程或就业结果。请查看学校官方目录。"}</p>
      {definition && <p className="mt-2 text-xs leading-6 text-ink/55">{definition.boundary}</p>}
      {spotlight?.kind === "strength" && <div className="mt-4 rounded-lg border border-cobalt/20 bg-cobalt/5 p-3 text-xs leading-6 text-ink/75"><h3 className="font-semibold text-cobalt">本校本科专业排名依据</h3><p>{spotlight.rankingPublisher} · {spotlight.rankingYear} 版 · {spotlight.tied ? "并列" : ""}第 {spotlight.rank} 名</p><p>{spotlight.reason}</p><p className="mt-1 text-[10px] text-ink/50">排名是一项比较依据，不代表录取或就业保证。</p></div>}
      {school.state.status === "loading" && <p role="status" className="mt-3 text-xs text-ink/50">正在读取该校官方来源…</p>}
      {school.state.status === "error" && <button onClick={school.reload} className="mt-3 text-xs text-cobalt">学校来源加载失败，点击重试</button>}
      {officialUrl && <a href={officialUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-cobalt hover:underline">{detail?.nameZh || detail?.name} · {spotlight?.kind === "strength" ? "排名披露来源" : "项目／目录来源"}<ArrowUpRight size={13} /></a>}
      {definition && <Link href={`/majors/${definition.slug}`} className="mt-3 block text-xs text-cobalt hover:underline">查看通用学科档案与相近方向 →</Link>}
    </section>
    <section>
      <h2 className="text-lg font-semibold">还可以了解哪些学校</h2>
      <p className="mt-1 text-xs leading-6 text-ink/55">以下学校的已收录目录中有同名项目，按英文校名排序。这是“开设关系”，不是专业实力榜；同名项目的课程、学位可能不同。</p>
      {catalog.state.status === "loading" || catalog.state.status === "idle" ? <p role="status" className="py-6 text-sm text-ink/55">正在加载专业与学校关联…</p> : catalog.state.status === "error" ?
        <button onClick={catalog.reload} className="my-4 rounded-lg border border-line px-4 py-2 text-sm">关联学校暂未加载，重试</button> : <>
          <p className="my-3 text-xs text-ink/50">当前数据库已关联 {related.length} 所，不代表全美完整名单。</p>
          <ul className="grid gap-3 sm:grid-cols-2">{related.map((university) => <li key={university.id}>
            <Link href={`/university/${encodeURIComponent(university.id)}`} className="block rounded-xl border border-line/60 bg-panel p-4 transition hover:border-cobalt/50">
              <span className="text-sm font-semibold">{university.nameZh || university.name}{university.id === universityId ? " · 当前学校" : ""}</span>
              <span className="mt-1 block text-xs text-ink/50">{university.name}</span><span className="mt-2 block text-xs text-cobalt">查看学校与项目来源 →</span>
            </Link></li>)}</ul>
          {related.length === 0 && <p className="py-6 text-sm text-ink/55">暂无同名项目关联；不把近似名称当成同一专业。</p>}
        </>}
    </section>
  </main>;
}
