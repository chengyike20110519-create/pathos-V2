"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Database,
  ExternalLink,
  FileStack,
  GitCompareArrows,
  LineChart,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import PageMotion from "@/components/shared/PageMotion";
import { SchoolPicker } from "@/components/calculator/SchoolPicker";
import { useDataSource } from "@/services/data-source-provider";
import { useNews, useUniversitySummaries } from "@/hooks/use-data-source";
import { useCompareStore } from "@/state/compare-store";
import type { NewsArticle, UniversitySummary } from "@/domain/dataset";

const STORAGE_KEY = "pathos:research-projects";
const MAX_PROJECT_SCHOOLS = 12;

type ResearchFocus = "program" | "metric" | "policy" | "cost";

interface EvidenceNote {
  id: string;
  text: string;
  sourceUrl?: string;
  sourceLabel?: string;
  createdAt: string;
}

interface ResearchProject {
  id: string;
  title: string;
  question: string;
  focus: ResearchFocus;
  schoolIds: string[];
  evidence: EvidenceNote[];
  createdAt: string;
  updatedAt: string;
}

const FOCUS_LABELS: Record<ResearchFocus, string> = {
  program: "专业与项目",
  metric: "指标趋势",
  policy: "政策与时间线",
  cost: "费用与资助",
};

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isFocus(value: unknown): value is ResearchFocus {
  return value === "program" || value === "metric" || value === "policy" || value === "cost";
}

function normalizeProject(raw: unknown): ResearchProject | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string") return null;
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.flatMap((item): EvidenceNote[] => {
        if (!item || typeof item !== "object") return [];
        const note = item as Record<string, unknown>;
        if (typeof note.id !== "string" || typeof note.text !== "string") return [];
        return [{
          id: note.id,
          text: note.text,
          sourceUrl: typeof note.sourceUrl === "string" ? note.sourceUrl : undefined,
          sourceLabel: typeof note.sourceLabel === "string" ? note.sourceLabel : undefined,
          createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date().toISOString(),
        }];
      })
    : [];
  return {
    id: record.id,
    title: record.title,
    question: typeof record.question === "string" ? record.question : "",
    focus: isFocus(record.focus) ? record.focus : "metric",
    schoolIds: Array.isArray(record.schoolIds)
      ? record.schoolIds.filter((id): id is string => typeof id === "string")
      : [],
    evidence,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

function readProjects(): ResearchProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeProject).filter((project): project is ResearchProject => Boolean(project));
  } catch {
    return [];
  }
}

function writeProjects(value: ResearchProject[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode or quota exhaustion must not break the research UI.
  }
}

function readStringArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, 12);
  } catch {
    return [];
  }
}

function displayName(school: UniversitySummary) {
  return school.nameZh || school.chineseName || school.name;
}

function newsMatches(article: NewsArticle, project: ResearchProject) {
  if (project.schoolIds.includes(article.universityId ?? "")) return true;
  const terms = [project.title, project.question]
    .join(" ")
    .split(/[\s，。；;]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3);
  const haystack = [article.title, article.titleEn, article.summary, article.whatChanged]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

interface ShortlistState {
  kind: "idle" | "loading" | "ready" | "unavailable";
  items: Array<{ id: string; name: string; itemCount?: number }>;
  message?: string;
}

export function ResearchDeskView() {
  const source = useDataSource();
  const summaries = useUniversitySummaries(source);
  const news = useNews(source);
  const compare = useCompareStore();
  const [hydrated, setHydrated] = useState(false);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [focus, setFocus] = useState<ResearchFocus>("program");
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<string[]>([]);
  const [shortlists, setShortlists] = useState<ShortlistState>({ kind: "idle", items: [] });

  useEffect(() => {
    const stored = readProjects();
    setProjects(stored);
    setActiveId(stored[0]?.id ?? null);
    setFollowedIds(readStringArray("pathos_followed_universities"));
    setSavedSearches(readStringArray("pathos:saved-searches"));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setShortlists({ kind: "loading", items: [] });
    fetch("/api/shortlists", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || body?.ok !== true) {
          setShortlists({
            kind: "unavailable",
            items: [],
            message: typeof body?.message === "string" ? body.message : "服务端研究集合暂不可用。",
          });
          return;
        }
        const items = Array.isArray(body?.shortlists)
          ? body.shortlists.map((item: { id?: unknown; name?: unknown; itemCount?: unknown }) => ({
              id: typeof item.id === "string" ? item.id : "",
              name: typeof item.name === "string" ? item.name : "未命名集合",
              itemCount: typeof item.itemCount === "number" ? item.itemCount : undefined,
            })).filter((item: { id: string }) => item.id)
          : [];
        setShortlists({ kind: "ready", items });
      })
      .catch(() => {
        if (!cancelled) {
          setShortlists({ kind: "unavailable", items: [], message: "研究集合请求失败。" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const persist = (next: ResearchProject[]) => {
    setProjects(next);
    writeProjects(next);
  };

  const activeProject = projects.find((project) => project.id === activeId) ?? null;
  const schools = useMemo(
    () => (summaries.state.status === "ready" ? summaries.state.data : []),
    [summaries.state],
  );
  const schoolMap = useMemo(() => new Map(schools.map((school) => [school.id, school])), [schools]);
  const allNews = useMemo(
    () => (news.state.status === "ready" ? news.state.data : []),
    [news.state],
  );

  const relatedNews = useMemo(() => {
    if (!activeProject) return [];
    return allNews.filter((article) => newsMatches(article, activeProject)).slice(0, 6);
  }, [activeProject, allNews]);

  const createProject = (event: FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const now = new Date().toISOString();
    const project: ResearchProject = {
      id: createId("research"),
      title: cleanTitle,
      question: question.trim(),
      focus,
      schoolIds: [],
      evidence: [],
      createdAt: now,
      updatedAt: now,
    };
    persist([project, ...projects]);
    setActiveId(project.id);
    setTitle("");
    setQuestion("");
    setFocus("program");
  };

  const updateProject = (id: string, changes: Partial<ResearchProject>) => {
    persist(projects.map((project) => project.id === id
      ? { ...project, ...changes, updatedAt: new Date().toISOString() }
      : project));
  };

  const deleteProject = (id: string) => {
    const next = projects.filter((project) => project.id !== id);
    persist(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const addEvidence = (note: Omit<EvidenceNote, "id" | "createdAt">) => {
    if (!activeProject || !note.text.trim()) return;
    updateProject(activeProject.id, {
      evidence: [
        { ...note, text: note.text.trim(), id: createId("evidence"), createdAt: new Date().toISOString() },
        ...activeProject.evidence,
      ],
    });
  };

  const totalSchools = new Set(projects.flatMap((project) => project.schoolIds)).size;
  const totalEvidence = projects.reduce((sum, project) => sum + project.evidence.length, 0);

  return (
    <PageMotion>
      <div className="min-h-screen bg-surface-base">
        <EnterprisePageHeader
          eyebrow="Research Desk / PathOS"
          title="我的研究台"
          description="把研究问题、学校集合、指标视图、政策事件和证据来源放在同一个可延续的研究过程里。"
          icon={FileStack}
          stats={[
            { label: "研究问题", value: projects.length },
            { label: "绑定学校", value: totalSchools },
            { label: "证据笔记", value: totalEvidence },
            { label: "存储", value: "本机暂存" },
          ]}
          sourceNote="V1 研究问题与证据保存在本机浏览器；服务端清单、关注学校和保存检索只读取，不冒充账号同步。"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/s/home"
                className="inline-flex min-h-control-lg items-center gap-1.5 rounded-control border border-[#eef1f526] px-3 text-caption font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]"
              >
                旧数据工作台
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          }
        />

        <main className="mx-auto grid w-full max-w-page gap-4 px-4 pb-14 pt-5 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <section className="rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
              <h2 className="text-section text-text-primary">新建研究问题</h2>
              <form onSubmit={createProject} className="mt-3 space-y-3">
                <label className="block">
                  <span className="text-label uppercase text-text-muted">问题标题</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={90}
                    placeholder="AI + 医疗方向有哪些本科机会？"
                    className="mt-1 min-h-control-lg w-full rounded-control border border-border-soft bg-surface-muted px-3 text-caption text-text-primary outline-none transition focus:border-cobalt/50"
                  />
                </label>
                <label className="block">
                  <span className="text-label uppercase text-text-muted">研究描述</span>
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="我想核对项目设置、官方公告、相关指标和同类学校变化。"
                    className="mt-1 w-full rounded-control border border-border-soft bg-surface-muted px-3 py-2 text-caption leading-5 text-text-primary outline-none transition focus:border-cobalt/50"
                  />
                </label>
                <label className="block">
                  <span className="text-label uppercase text-text-muted">研究类型</span>
                  <select
                    value={focus}
                    onChange={(event) => setFocus(event.target.value as ResearchFocus)}
                    className="mt-1 min-h-control-lg w-full rounded-control border border-border-soft bg-surface-muted px-3 text-caption text-text-primary outline-none transition focus:border-cobalt/50"
                  >
                    {Object.entries(FOCUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-control-lg w-full items-center justify-center gap-1.5 rounded-control bg-persimmon px-3 text-caption font-semibold text-white transition hover:bg-[#dd8568]"
                >
                  <Plus size={14} aria-hidden="true" />
                  建立研究问题
                </button>
              </form>
            </section>

            <section className="rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
              <h2 className="text-body font-semibold text-text-primary">研究队列</h2>
              {projects.length === 0 ? (
                <p className="mt-2 text-caption text-text-muted">还没有研究问题。先从一个小问题开始，再逐步收集学校与证据。</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <div
                        className={`flex items-start gap-2 rounded-control border p-2 transition ${
                          project.id === activeId ? "border-cobalt/45 bg-cobalt/8" : "border-border-soft bg-surface-muted/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveId(project.id)}
                          className="min-h-control-lg min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-caption font-semibold text-text-primary">{project.title}</p>
                          <p className="mt-0.5 text-[10px] text-text-muted">
                            {FOCUS_LABELS[project.focus]} · {project.schoolIds.length} 校 · {project.evidence.length} 证据
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProject(project.id)}
                          aria-label={`删除研究问题 ${project.title}`}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-text-muted transition hover:bg-surface-1 hover:text-persimmon"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {activeProject ? (
            <div className="space-y-4">
              <section className="rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
                  <div>
                    <label className="block">
                      <span className="text-label uppercase text-text-muted">当前研究问题</span>
                      <input
                        value={activeProject.title}
                        onChange={(event) => updateProject(activeProject.id, { title: event.target.value })}
                        className="mt-1 min-h-control-lg w-full rounded-control border border-border-soft bg-surface-muted px-3 text-body font-semibold text-text-primary outline-none focus:border-cobalt/50"
                      />
                    </label>
                    <label className="mt-3 block">
                      <span className="text-label uppercase text-text-muted">研究描述</span>
                      <textarea
                        value={activeProject.question}
                        onChange={(event) => updateProject(activeProject.id, { question: event.target.value })}
                        rows={3}
                        className="mt-1 w-full rounded-control border border-border-soft bg-surface-muted px-3 py-2 text-caption leading-5 text-text-primary outline-none focus:border-cobalt/50"
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="text-label uppercase text-text-muted">类型</span>
                      <select
                        value={activeProject.focus}
                        onChange={(event) => updateProject(activeProject.id, { focus: event.target.value as ResearchFocus })}
                        className="mt-1 min-h-control-lg w-full rounded-control border border-border-soft bg-surface-muted px-3 text-caption text-text-primary"
                      >
                        {Object.entries(FOCUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[10px] text-text-muted">更新 {formatDate(activeProject.updatedAt)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-section text-text-primary">学校集合</h2>
                    <p className="mt-1 text-caption text-text-secondary">学校是这个研究问题的证据样本，不是决策清单。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      disabled={activeProject.schoolIds.length >= MAX_PROJECT_SCHOOLS}
                      className="inline-flex min-h-control-lg items-center gap-1.5 rounded-control bg-ink px-3 text-caption font-semibold text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus size={14} aria-hidden="true" />
                      添加学校
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProject(activeProject.id, {
                        schoolIds: [...new Set([...activeProject.schoolIds, ...compare.ids])].slice(0, MAX_PROJECT_SCHOOLS),
                      })}
                      disabled={compare.ids.length === 0}
                      className="inline-flex min-h-control-lg items-center gap-1.5 rounded-control border border-border-soft px-3 text-caption font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt disabled:opacity-50"
                    >
                      <GitCompareArrows size={14} aria-hidden="true" />
                      导入当前对比
                    </button>
                  </div>
                </div>

                {activeProject.schoolIds.length === 0 ? (
                  <p className="mt-3 rounded-control border border-dashed border-border-soft bg-surface-muted/40 px-3 py-4 text-caption text-text-muted">
                    尚未绑定学校。可从地图、检索、趋势台或当前对比导入。
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {activeProject.schoolIds.map((id) => {
                      const school = schoolMap.get(id);
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 rounded-control border border-border-soft bg-surface-muted/50 px-3 py-2">
                          <Link href={`/university/${encodeURIComponent(id)}`} className="inline-flex min-h-control-lg min-w-0 flex-1 items-center truncate text-caption font-medium text-text-primary hover:text-cobalt">
                            {school ? displayName(school) : id}
                          </Link>
                          <button
                            type="button"
                            onClick={() => updateProject(activeProject.id, {
                              schoolIds: activeProject.schoolIds.filter((schoolId) => schoolId !== id),
                            })}
                            aria-label={`移除${school ? displayName(school) : id}`}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-text-muted transition hover:bg-surface-1 hover:text-persimmon"
                          >
                            <X size={13} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => compare.replaceIds(activeProject.schoolIds.slice(0, compare.maxItems))}
                    disabled={activeProject.schoolIds.length < 2}
                    className="inline-flex min-h-control-lg items-center gap-1.5 rounded-control border border-border-soft px-3 text-caption font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt disabled:opacity-50"
                  >
                    <GitCompareArrows size={14} aria-hidden="true" />
                    前四所进入对比
                  </button>
                  {activeProject.schoolIds.length > 0 ? (
                    <Link
                      href={`/trends?ids=${encodeURIComponent(activeProject.schoolIds.slice(0, 4).join(","))}`}
                      className="inline-flex min-h-control-lg items-center gap-1.5 rounded-control border border-border-soft px-3 text-caption font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                    >
                      <LineChart size={14} aria-hidden="true" />
                      打开趋势台
                    </Link>
                  ) : null}
                </div>
              </section>

              <section className="rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
                <h2 className="text-section text-text-primary">证据笔记</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addEvidence({ text: evidenceText, sourceUrl: evidenceUrl.trim() || undefined });
                    setEvidenceText("");
                    setEvidenceUrl("");
                  }}
                  className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_260px_auto]"
                >
                  <label className="block">
                    <span className="sr-only">证据内容</span>
                    <input
                      value={evidenceText}
                      onChange={(event) => setEvidenceText(event.target.value)}
                      required
                      placeholder="记录一个事实、变化或待核对问题"
                      className="min-h-control-lg w-full rounded-control border border-border-soft bg-surface-muted px-3 text-caption text-text-primary outline-none focus:border-cobalt/50"
                    />
                  </label>
                  <label className="block">
                    <span className="sr-only">来源链接</span>
                    <input
                      value={evidenceUrl}
                      onChange={(event) => setEvidenceUrl(event.target.value)}
                      type="url"
                      placeholder="https://..."
                      className="min-h-control-lg w-full rounded-control border border-border-soft bg-surface-muted px-3 text-caption text-text-primary outline-none focus:border-cobalt/50"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex min-h-control-lg items-center justify-center gap-1.5 rounded-control bg-cobalt px-3 text-caption font-semibold text-paper transition hover:bg-cobalt/90"
                  >
                    <Save size={14} aria-hidden="true" />
                    保存证据
                  </button>
                </form>

                {activeProject.evidence.length === 0 ? (
                  <p className="mt-3 text-caption text-text-muted">还没有证据。下方相关资讯可以一键转入证据笔记。</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {activeProject.evidence.map((note) => (
                      <li key={note.id} className="flex items-start justify-between gap-3 rounded-control border border-border-soft bg-surface-muted/45 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-caption leading-5 text-text-primary">{note.text}</p>
                          <p className="mt-1 text-[10px] text-text-muted">
                            {formatDate(note.createdAt)}
                            {note.sourceLabel ? ` · ${note.sourceLabel}` : null}
                          </p>
                          {note.sourceUrl ? (
                            <a
                              href={note.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex min-h-control-lg items-center gap-1 text-[11px] font-medium text-cobalt hover:underline"
                            >
                              打开来源
                              <ExternalLink size={11} aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateProject(activeProject.id, {
                            evidence: activeProject.evidence.filter((item) => item.id !== note.id),
                          })}
                          aria-label="删除证据"
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-text-muted transition hover:bg-surface-1 hover:text-persimmon"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-card border border-border-soft bg-surface-1 p-4" data-reveal="true">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-section text-text-primary">相关资讯候选</h2>
                    <p className="mt-1 text-caption text-text-secondary">按当前研究问题和学校集合筛选；转入证据后仍保留原文链接。</p>
                  </div>
                  <Link href="/news" className="inline-flex min-h-control-lg items-center gap-1 text-caption font-medium text-cobalt hover:underline">
                    浏览资讯
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </div>
                {news.state.status === "loading" ? (
                  <p className="mt-3 text-caption text-text-secondary">正在读取资讯…</p>
                ) : relatedNews.length === 0 ? (
                  <p className="mt-3 rounded-control border border-dashed border-border-soft bg-surface-muted/40 px-3 py-4 text-caption text-text-muted">
                    暂无匹配资讯。可以先绑定学校，或手动添加证据。
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-2 xl:grid-cols-2">
                    {relatedNews.map((article) => (
                      <li key={article.id} className="rounded-card border border-border-soft bg-surface-muted/45 p-3">
                        <p className="text-caption font-semibold text-text-primary">{article.title}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-secondary">
                          {article.summary ?? article.whatChanged ?? "资讯摘要待整理"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-control-lg items-center gap-1 text-[11px] font-medium text-cobalt hover:underline"
                          >
                            {article.source}
                            <ExternalLink size={11} aria-hidden="true" />
                          </a>
                          <button
                            type="button"
                            onClick={() => addEvidence({
                              text: article.title,
                              sourceUrl: article.url,
                              sourceLabel: article.source,
                            })}
                            className="inline-flex min-h-control-lg items-center gap-1 rounded-control border border-border-soft bg-surface-1 px-2 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                          >
                            <Plus size={11} aria-hidden="true" />
                            转入证据
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <section className="rounded-card border border-dashed border-border-soft bg-surface-1 p-8 text-center" data-reveal="true">
              <Database size={22} aria-hidden="true" className="mx-auto text-cobalt" />
              <h2 className="mt-3 text-section text-text-primary">从一个研究问题开始</h2>
              <p className="mx-auto mt-2 max-w-xl text-caption leading-6 text-text-secondary">
                例如“AI + 医疗方向有哪些本科机会？”或“2027 Fall 标化政策会怎么影响申请？”。随后逐步添加学校、事件、指标和来源，形成自己的研究链路。
              </p>
            </section>
          )}

          <section className="rounded-card border border-border-soft bg-surface-1 p-4 lg:col-span-2" data-reveal="true">
            <h2 className="text-section text-text-primary">已集合的研究资产</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <article className="rounded-card border border-border-soft bg-surface-muted/45 p-3">
                <h3 className="text-body font-semibold text-text-primary">当前对比</h3>
                <p className="mt-1 text-caption text-text-secondary">{compare.ids.length} 所学校</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {compare.ids.map((id) => (
                    <span key={id} className="max-w-full truncate rounded-control border border-border-soft bg-surface-1 px-2 py-1 text-[10px] text-text-secondary">
                      {schoolMap.get(id) ? displayName(schoolMap.get(id)!) : id}
                    </span>
                  ))}
                </div>
              </article>
              <article className="rounded-card border border-border-soft bg-surface-muted/45 p-3">
                <h3 className="text-body font-semibold text-text-primary">关注学校</h3>
                <p className="mt-1 text-caption text-text-secondary">{followedIds.length} 所学校</p>
                <Link href="/followed" className="mt-2 inline-flex min-h-control-lg items-center text-[11px] font-medium text-cobalt hover:underline">管理关注</Link>
              </article>
              <article className="rounded-card border border-border-soft bg-surface-muted/45 p-3">
                <h3 className="text-body font-semibold text-text-primary">保存检索</h3>
                {savedSearches.length === 0 ? (
                  <p className="mt-1 text-caption text-text-secondary">暂无保存检索</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {savedSearches.slice(0, 4).map((keyword) => (
                      <li key={keyword}>
                        <Link href={`/search?q=${encodeURIComponent(keyword)}`} className="inline-flex min-h-control-lg items-center gap-1 text-[11px] text-text-secondary hover:text-cobalt">
                          <Search size={11} aria-hidden="true" />
                          {keyword}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>

            <div className="mt-3 rounded-card border border-border-soft bg-surface-muted/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-body font-semibold text-text-primary">服务端研究集合</h3>
                <Link href="/workbench/shortlists" className="inline-flex min-h-control-lg items-center text-[11px] font-medium text-cobalt hover:underline">管理集合</Link>
              </div>
              {shortlists.kind === "loading" ? (
                <p className="mt-1 text-caption text-text-secondary">正在读取…</p>
              ) : shortlists.kind === "ready" ? (
                <p className="mt-1 text-caption text-text-secondary">{shortlists.items.length} 个集合</p>
              ) : (
                <p className="mt-1 flex items-center gap-1 text-caption text-persimmon">
                  <AlertCircle size={12} aria-hidden="true" />
                  {shortlists.message ?? "暂不可用"}
                </p>
              )}
            </div>
          </section>
        </main>

        <SchoolPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          candidates={schools}
          selectedIds={activeProject?.schoolIds ?? []}
          max={MAX_PROJECT_SCHOOLS}
          title="选择大学加入研究"
          onPick={(id) => {
            if (!activeProject) return;
            updateProject(activeProject.id, {
              schoolIds: [...activeProject.schoolIds, id].slice(0, MAX_PROJECT_SCHOOLS),
            });
            setPickerOpen(false);
          }}
          storageKey="pathos-research-picker"
        />
      </div>
    </PageMotion>
  );
}

export default ResearchDeskView;
