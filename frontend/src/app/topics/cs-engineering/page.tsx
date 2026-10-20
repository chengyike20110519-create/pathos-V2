"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  MapPin,
} from "lucide-react";
import { useDataSource } from "@/services/data-source-provider";
import { useUniversitySummaries } from "@/hooks/use-data-source";
import { DataEmptyState, DataLoadingState } from "@/components/shared/data-states";
import PageMotion from "@/components/shared/PageMotion";
import type { UniversitySummary } from "@/domain/dataset";

type SortKey = "rank" | "acceptance" | "cost" | "enrollment";
type Track = "both" | "cs" | "eng";

// Keywords are matched case-insensitively against each school's
// topPrograms list. The list intentionally stays short and
// unambiguous so we do not accidentally re-create the IECG
// fuzzy-match problem. Real teaching copy is rendered on the page
// from these flags.
const CS_KEYWORDS = [
  "computer science",
  "computing",
  "informatics",
  "software",
  "data science",
  "artificial intelligence",
  "machine learning",
  "cybersecurity",
  "computer engineering",
];

const ENG_KEYWORDS = [
  "engineering",
  "mechanical engineering",
  "electrical engineering",
  "civil engineering",
  "chemical engineering",
  "aerospace",
  "biomedical engineering",
  "industrial engineering",
  "materials engineering",
];

function classify(programs: readonly string[] | undefined): { cs: boolean; eng: boolean } {
  const text = (programs ?? []).join(" ").toLowerCase();
  const cs = CS_KEYWORDS.some((k) => text.includes(k));
  const eng = ENG_KEYWORDS.some((k) => text.includes(k));
  return { cs, eng };
}

function formatRate(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

function rankingRank(school: UniversitySummary): number | null {
  const r = school.rankingSummary?.nationalRank;
  if (typeof r === "number" && r > 0) return r;
  return null;
}

const TRACK_LABELS: Record<Track, string> = {
  both: "CS 或工程",
  cs: "仅 CS",
  eng: "仅工程",
};

const TRACK_DESCRIPTIONS: Record<Track, string> = {
  both: "列出同时或单独提供计算机科学 / 工程本科专业的学校。",
  cs: "列出明确提供计算机科学 / 数据科学 / 软件 / AI 相关本科专业的学校。",
  eng: "列出明确提供工程类本科专业（机械 / 电气 / 土木 / 化学 / 航空航天 / 生物医学 / 工业 / 材料）的学校。",
};

export default function CsEngineeringDashboardPage() {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);
  const schools = useMemo(
    () => (summaries.state.status === "ready" ? summaries.state.data : []),
    [summaries],
  );

  const [track, setTrack] = useState<Track>("both");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    const rows = schools
      .map((school) => ({ school, tags: classify(school.topPrograms) }))
      .filter(({ tags }) =>
        (track === "cs" && tags.cs) ||
        (track === "eng" && tags.eng) ||
        (track === "both" && (tags.cs || tags.eng)),
      );

    const compare = (a: UniversitySummary, b: UniversitySummary): number => {
      switch (sortKey) {
        case "rank": {
          const ra = rankingRank(a);
          const rb = rankingRank(b);
          if (ra === null && rb === null) return 0;
          if (ra === null) return 1;
          if (rb === null) return -1;
          return ra - rb;
        }
        case "acceptance": {
          // lower acceptance = more selective, so we sort ascending
          // when "asc" is true (default), placing most selective at top.
          const aa = typeof a.acceptanceRate === "number" ? a.acceptanceRate : Number.POSITIVE_INFINITY;
          const bb = typeof b.acceptanceRate === "number" ? b.acceptanceRate : Number.POSITIVE_INFINITY;
          return aa - bb;
        }
        case "cost": {
          const ca = a.costSummary?.minimumUsd ?? Number.POSITIVE_INFINITY;
          const cb = b.costSummary?.minimumUsd ?? Number.POSITIVE_INFINITY;
          return ca - cb;
        }
        case "enrollment": {
          const ea = a.enrollmentSummary?.undergraduate ?? 0;
          const eb = b.enrollmentSummary?.undergraduate ?? 0;
          return eb - ea;
        }
      }
    };

    rows.sort((a, b) => (sortAsc ? compare(a.school, b.school) : -compare(a.school, b.school)));
    return rows;
  }, [schools, track, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <PageMotion>
      <main className="min-h-screen bg-surface-base">
      <header data-reveal="true" className="border-b border-border-soft bg-surface-1/80">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-4 px-4 py-5 sm:px-6">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-cobalt text-paper">
            <Cpu size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-label uppercase tracking-[0.14em] text-cobalt">TOPIC DASHBOARD</p>
            <h1 data-heading-stagger="true" className="text-page text-text-primary">CS 与工程强校对比</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">
              老师讲课可以直接投影的横向对比视图：按 CS / 工程方向、排名、录取率、学费、本科人数整理学校。
            </p>
          </div>
          <Link
            href="/guides"
            className="inline-flex items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-3 py-2 text-xs font-semibold text-text-secondary hover:border-cobalt/40 hover:text-cobalt"
          >
            单校深入解读 <ArrowUpRight size={14} />
          </Link>
        </div>
      </header>

      <div data-reveal="true" data-reveal-delay="80" className="mx-auto max-w-page px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs text-text-tertiary">方向筛选</span>
          {(["both", "cs", "eng"] as Track[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setTrack(opt)}
              className={`rounded-control border px-3 py-1.5 text-xs font-semibold transition ${
                track === opt
                  ? "border-cobalt bg-cobalt text-paper"
                  : "border-border-soft bg-surface-1 text-text-secondary hover:border-cobalt/40"
              }`}
            >
              {TRACK_LABELS[opt]}
            </button>
          ))}
          <span className="ml-auto text-xs text-text-tertiary">命中 {filtered.length} 所学校</span>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-text-secondary">{TRACK_DESCRIPTIONS[track]}</p>

        {summaries.state.status === "loading" && <DataLoadingState message="正在加载院校…" />}
        {summaries.state.status === "ready" && filtered.length === 0 && (
          <DataEmptyState
            title="没有找到符合条件的学校"
            description="试试切换方向筛选，或回到 /guides 查看完整列表。"
          />
        )}

        {summaries.state.status === "ready" && filtered.length > 0 && (
          <div className="overflow-x-auto border border-border-soft bg-surface-1">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface-muted/40 text-[10px] uppercase tracking-wider text-text-tertiary">
                  <th className="px-4 py-3 text-left">
                    <SortHeader label="学校" onClick={() => toggleSort("rank")} active={sortKey === "rank"} asc={sortAsc} />
                  </th>
                  <th className="w-20 px-4 py-3 text-center">
                    <SortHeader label="排名" onClick={() => toggleSort("rank")} active={sortKey === "rank"} asc={sortAsc} />
                  </th>
                  <th className="w-24 px-4 py-3 text-center">
                    <SortHeader label="录取率" onClick={() => toggleSort("acceptance")} active={sortKey === "acceptance"} asc={sortAsc} />
                  </th>
                  <th className="w-28 px-4 py-3 text-center">
                    <SortHeader label="学费/年" onClick={() => toggleSort("cost")} active={sortKey === "cost"} asc={sortAsc} />
                  </th>
                  <th className="w-24 px-4 py-3 text-center">
                    <SortHeader label="本科人数" onClick={() => toggleSort("enrollment")} active={sortKey === "enrollment"} asc={sortAsc} />
                  </th>
                  <th className="w-24 px-4 py-3 text-center">方向</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ school, tags }) => (
                  <tr key={school.id} className="border-t border-border-soft transition hover:bg-surface-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/university/${encodeURIComponent(school.id)}`} className="block">
                        <div className="text-sm font-semibold text-text-primary">{school.nameZh}</div>
                        <div className="mt-0.5 text-[11px] text-text-tertiary">{school.name}</div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-text-tertiary">
                          <MapPin size={9} />
                          <span>
                            {school.city}, {school.state}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-semibold tabular-nums text-text-primary">
                      {rankingRank(school) ? `#${rankingRank(school)}` : (
                        <span className="text-text-tertiary" title="该校不在当前 US News 综合排名口径内">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm tabular-nums text-text-secondary">
                      {formatRate(school.acceptanceRate)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm tabular-nums text-text-secondary">
                      {formatUsd(school.costSummary?.minimumUsd)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm tabular-nums text-text-secondary">
                      {school.enrollmentSummary?.undergraduate ? school.enrollmentSummary.undergraduate.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-1">
                        {tags.cs && (
                          <span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-[10px] font-semibold text-cobalt">CS</span>
                        )}
                        {tags.eng && (
                          <span className="rounded-full bg-persimmon/10 px-2 py-0.5 text-[10px] font-semibold text-persimmon">ENG</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-text-tertiary">
          数据来源：PathOS Preview Bundle，datasetVersion 取自当前 fixture。排名 / 录取率 / 学费的「—」表示该校在该字段上暂未提供可信数值；缺失字段在打分场景中会被剔除而不是被替换为默认值。
        </p>
      </div>
    </main>
    </PageMotion>
  );
}

function SortHeader({
  label,
  onClick,
  active,
  asc,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  asc: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 transition hover:text-text-secondary ${active ? "text-cobalt" : "text-text-tertiary"}`}
    >
      <span>{label}</span>
      {active && (asc ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  );
}
