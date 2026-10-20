"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Database,
  Bookmark,
  MapPin,
  Search as SearchIcon,
  University as UniversityIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import PageMotion from "@/components/shared/PageMotion";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import {
  DataEmptyState,
  DataLoadingState,
} from "@/components/shared/data-states";
import { MAJOR_PROFILES, type MajorDefinition } from "@/domain/information/major";
import { useUniversitySearch } from "@/hooks/use-data-source";
import { useDataSource } from "@/services/data-source-provider";

type Hit = {
  id: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  href?: string;
  score: number;
  badge?: string;
};

type ApiGroups = Record<"universities" | "majors" | "locations" | "facts" | "events", Hit[]>;
type ApiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; groups: ApiGroups; total: number; durationMs: number }
  | { kind: "unavailable"; code?: string; message: string };

type GroupKey = keyof ApiGroups;

const GROUPS: Array<{ key: GroupKey; label: string; icon: LucideIcon }> = [
  { key: "universities", label: "学校", icon: UniversityIcon },
  { key: "majors", label: "专业", icon: BookOpen },
  { key: "locations", label: "城市 / 州", icon: MapPin },
  { key: "facts", label: "已核验事实", icon: Database },
  { key: "events", label: "信息事件", icon: CalendarClock },
];

function mergeHits(primary: Hit[], fallback: Hit[] = []): Hit[] {
  const seen = new Set(primary.map((hit) => hit.id));
  return [...primary, ...fallback.filter((hit) => !seen.has(hit.id))];
}

function majorScore(major: MajorDefinition, keyword: string): number {
  const nameZh = major.nameZh.toLowerCase();
  const nameEn = major.nameEn.toLowerCase();
  if (nameZh === keyword || nameEn === keyword) return 100;
  if (nameZh.startsWith(keyword) || nameEn.startsWith(keyword)) return 94;
  if (nameZh.includes(keyword) || nameEn.includes(keyword)) return 88;
  if (major.aliases.some((alias) => alias.toLowerCase().includes(keyword))) return 82;
  if (major.summary.toLowerCase().includes(keyword)) return 70;
  return 0;
}

function previewMajorHits(query: string): Hit[] {
  const keyword = query.trim().toLowerCase();
  if (keyword.length < 2) return [];
  return MAJOR_PROFILES
    .map((major, index) => ({ major, index, score: majorScore(major, keyword) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8)
    .map(({ major, score }) => ({
      id: `major:${major.slug}`,
      title: major.nameZh,
      subtitle: major.nameEn,
      snippet: major.summary,
      href: `/majors/${major.slug}`,
      score,
      badge: "专业档案",
    }));
}

function previewUniversityHit(result: {
  university: {
    id: string;
    name: string;
    chineseName?: string | null;
    nameZh?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
}): Hit {
  const university = result.university;
  const place = [university.city, university.state, university.country]
    .filter(Boolean)
    .join(", ");
  return {
    id: university.id,
    title: university.chineseName || university.nameZh || university.name,
    subtitle: [university.name, place].filter(Boolean).join(" · "),
    href: `/university/${encodeURIComponent(university.id)}`,
    score: 50,
    badge: "Preview",
  };
}

export default function GlobalSearchView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [apiState, setApiState] = useState<ApiState>({ kind: "idle" });
  const [activeGroup, setActiveGroup] = useState<"all" | GroupKey>("all");
  const [savedQueries, setSavedQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const source = useDataSource();
  const previewSearch = useUniversitySearch(source, debounced, { limit: 20 });

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pathos:saved-searches");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setSavedQueries(parsed.filter((item): item is string => typeof item === "string").slice(0, 8));
      }
    } catch {
      setSavedQueries([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const keyword = debounced.trim();
    if (keyword.length < 2) {
      setApiState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    setApiState({ kind: "loading" });
    fetch(`/api/information/search?q=${encodeURIComponent(keyword)}&limit=8`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok !== true) {
          setApiState({
            kind: "unavailable",
            code: typeof body?.code === "string" ? body.code : undefined,
            message:
              typeof body?.message === "string"
                ? body.message
                : "信息层搜索暂不可用。",
          });
          return;
        }
        setApiState({
          kind: "ready",
          groups: body.groups,
          total: Number(body.total ?? 0),
          durationMs: Number(body.stats?.durationMs ?? 0),
        });
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setApiState({
          kind: "unavailable",
          message: "信息层搜索请求失败。",
        });
      });
    return () => controller.abort();
  }, [debounced]);

  const groups = useMemo<ApiGroups>(() => {
    const empty: ApiGroups = {
      universities: [],
      majors: [],
      locations: [],
      facts: [],
      events: [],
    };
    if (debounced.trim().length < 2) return empty;
    const result: ApiGroups =
      apiState.kind === "ready"
        ? {
            universities: apiState.groups.universities ?? [],
            majors: apiState.groups.majors ?? [],
            locations: apiState.groups.locations ?? [],
            facts: apiState.groups.facts ?? [],
            events: apiState.groups.events ?? [],
          }
        : empty;
    const previewUniversities =
      previewSearch.state.status === "ready"
        ? previewSearch.state.data.map(previewUniversityHit)
        : [];
    result.universities = mergeHits(result.universities, previewUniversities);
    result.majors = mergeHits(result.majors, previewMajorHits(debounced));
    return result;
  }, [apiState, debounced, previewSearch.state]);

  const total = useMemo(
    () => Object.values(groups).reduce((sum, items) => sum + items.length, 0),
    [groups],
  );
  const loading =
    debounced.trim().length >= 2 &&
    (apiState.kind === "idle" || apiState.kind === "loading" || previewSearch.state.status === "loading");
  const infoUnavailable = apiState.kind === "unavailable";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    router.replace(`/search${next ? `?q=${encodeURIComponent(next)}` : ""}`);
  };

  const saveCurrentSearch = () => {
    const keyword = query.trim();
    if (keyword.length < 2) return;
    setSavedQueries((current) => {
      const next = [keyword, ...current.filter((item) => item !== keyword)].slice(0, 8);
      window.localStorage.setItem("pathos:saved-searches", JSON.stringify(next));
      return next;
    });
  };

  const runSavedSearch = (keyword: string) => {
    setQuery(keyword);
    router.replace(`/search?q=${encodeURIComponent(keyword)}`);
  };

  const removeSavedSearch = (keyword: string) => {
    setSavedQueries((current) => {
      const next = current.filter((item) => item !== keyword);
      window.localStorage.setItem("pathos:saved-searches", JSON.stringify(next));
      return next;
    });
  };

  return (
    <PageMotion>
      <main className="mx-auto w-full max-w-page px-4 pb-16 pt-8 sm:px-6">
        <EnterprisePageHeader
          eyebrow="Global Search / PathOS"
          title="一个入口检索信息资产"
          description="学校、专业、城市 / 州、已审核事实与发布事件放在同一组结果里；信息层不可用时保留学校与专业 Preview 检索。"
          icon={Database}
          sourceNote="检索范围 · 学校 / 专业 / 地区 / approved facts / 信息事件"
        />

        <form role="search" onSubmit={submit} className="mt-5 flex items-center gap-2" data-reveal="true">
          <div className="relative flex-1">
            <SearchIcon
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：Princeton、计算机、Boston、deadline"
              aria-label="全局搜索"
              className="w-full rounded-control border border-border-soft bg-surface-1 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-cobalt/45 focus:ring-2 focus:ring-focus-ring"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-control items-center gap-1 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            搜索
          </button>
          <button
            type="button"
            onClick={saveCurrentSearch}
            disabled={query.trim().length < 2}
            className="inline-flex h-control items-center gap-1 rounded-none border border-[#11151f26] bg-white px-3 text-[13px] font-medium text-[#11151f]/75 transition hover:border-[#bd5a3e] hover:text-[#9b3d28] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Bookmark size={13} aria-hidden="true" />
            保存搜索
          </button>
        </form>

        {savedQueries.length > 0 ? (
          <section className="mt-3 flex flex-wrap items-center gap-2" aria-label="保存的搜索">
            <span className="text-[11px] font-semibold text-[#11151f]/50">最近保存</span>
            {savedQueries.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center overflow-hidden rounded-none border border-[#11151f1a] bg-white"
              >
                <button
                  type="button"
                  onClick={() => runSavedSearch(keyword)}
                  className="min-h-control px-2.5 text-[11px] text-[#11151f]/70 transition hover:text-[#9b3d28]"
                >
                  {keyword}
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedSearch(keyword)}
                  aria-label={`删除搜索 ${keyword}`}
                  className="grid min-h-control w-9 place-items-center border-l border-[#11151f1a] text-[#11151f]/40 transition hover:text-[#bd5a3e]"
                >
                  ×
                </button>
              </span>
            ))}
          </section>
        ) : null}

        {debounced.trim().length >= 2 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" data-reveal="true" aria-live="polite">
            <button
              type="button"
              onClick={() => setActiveGroup("all")}
              className={`h-control rounded-control border px-2.5 text-[11px] font-medium transition ${
                activeGroup === "all"
                  ? "border-cobalt/45 bg-cobalt/10 text-cobalt"
                  : "border-border-soft bg-surface-1 text-text-secondary hover:border-cobalt/35 hover:text-cobalt"
              }`}
            >
              全部 {total}
            </button>
            {GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setActiveGroup(group.key)}
                className={`inline-flex h-control items-center gap-1 rounded-control border px-2.5 text-[11px] font-medium transition ${
                  activeGroup === group.key
                    ? "border-cobalt/45 bg-cobalt/10 text-cobalt"
                    : "border-border-soft bg-surface-1 text-text-secondary hover:border-cobalt/35 hover:text-cobalt"
                }`}
              >
                <group.icon size={12} aria-hidden="true" />
                {group.label} {groups[group.key].length}
              </button>
            ))}
            {apiState.kind === "ready" ? (
              <span
                className={`ml-auto rounded-control border px-2 py-1 text-[10px] font-medium ${
                  apiState.durationMs < 500
                    ? "border-jade/30 bg-jade/10 text-jade"
                    : "border-persimmon/30 bg-persimmon/10 text-persimmon"
                }`}
              >
                信息层 {apiState.durationMs}ms
              </span>
            ) : null}
          </div>
        ) : null}

        {infoUnavailable ? (
          <p className="mt-3 rounded-control border border-persimmon/25 bg-persimmon/8 px-3 py-2 text-[12px] text-text-secondary">
            {apiState.message} 已自动保留 Preview 学校与本地专业检索。
          </p>
        ) : null}

        <section className="mt-6 space-y-5" aria-live="polite" data-section="true">
          {debounced.trim().length === 0 ? (
            <DataEmptyState
              title="输入关键词开始搜索"
              description="支持中英文，按 / 也能在任意页面打开搜索。"
            />
          ) : debounced.trim().length < 2 ? (
            <DataEmptyState title="再多输一点" description="至少 2 个字符才会触发搜索。" />
          ) : loading && total === 0 ? (
            <DataLoadingState message="正在检索学校、专业与信息层..." />
          ) : total === 0 ? (
            <DataEmptyState
              title="暂无匹配结果"
              description={
                infoUnavailable
                  ? `没有找到包含 “${debounced.trim()}” 的 Preview 学校或专业；信息层无结果统计本次未能写入。`
                  : `没有找到包含 “${debounced.trim()}” 的信息资产。这个无结果词已经进入补数据观察队列。`
              }
            />
          ) : (
            GROUPS
              .filter((group) => activeGroup === "all" || activeGroup === group.key)
              .map((group) => {
                const hits = groups[group.key];
                if (hits.length === 0) return null;
                return (
                  <section key={group.key} aria-labelledby={`search-group-${group.key}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-control bg-cobalt/8 text-cobalt">
                        <group.icon size={13} aria-hidden="true" />
                      </span>
                      <h2
                        id={`search-group-${group.key}`}
                        className="text-sm font-semibold text-text-primary"
                      >
                        {group.label}
                      </h2>
                      <span className="text-caption text-text-muted">{hits.length}</span>
                    </div>
                    <ul className="grid gap-2">
                      {hits.map((hit, index) => (
                        <li
                          key={hit.id}
                          data-reveal="true"
                          data-reveal-delay={index < 5 ? String(80 * (index + 1)) : undefined}
                        >
                          <Link
                            href={hit.href ?? "/search"}
                            className="group flex items-center justify-between gap-3 rounded-control border border-border-soft bg-surface-1 px-4 py-3 transition hover:border-cobalt/40 hover:bg-surface-muted"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-text-primary">
                                  {hit.title}
                                </p>
                                {hit.badge ? (
                                  <span className="rounded-full border border-border-soft bg-surface-muted/50 px-2 py-0.5 text-[10px] text-text-secondary">
                                    {hit.badge}
                                  </span>
                                ) : null}
                              </div>
                              {hit.subtitle ? (
                                <p className="mt-0.5 truncate text-xs text-text-secondary">{hit.subtitle}</p>
                              ) : null}
                              {hit.snippet ? (
                                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-muted">
                                  {hit.snippet}
                                </p>
                              ) : null}
                            </div>
                            <ArrowRight
                              size={15}
                              className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-cobalt"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
          )}
        </section>
      </main>
    </PageMotion>
  );
}
