"use client";

// Client half of /workbench/shortlists/[id]. Renders the three
// reach/match/safety columns, owns the "add university" form, and
// performs optimistic bucket moves + removes.
//
// Why no drag-and-drop yet: phase 1.3 ships the data plumbing and the
// visible three-column layout first; drag is a UX upgrade we can
// layer on in a follow-up without changing the API surface. The
// bucket selector below is the same primitive drag would call.

import { useState } from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  Plus,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";

interface ShortlistInfo {
  id: string;
  ownerUserId: string;
  name: string;
  season: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ItemRow {
  id: string;
  shortlistId: string;
  universityId: string;
  bucket: "reach" | "match" | "safety";
  notes: string | null;
  createdAt: string;
  universityName: string;
  universityChineseName: string | null;
}

interface Groups {
  reach: ItemRow[];
  match: ItemRow[];
  safety: ItemRow[];
}

interface DeadlineSummary {
  generatedAt: string;
  timezoneNotice: string;
  coverage: {
    scheduled: number;
    missing: number;
    invalid: number;
  };
  items: Array<{
    title: string;
    dueAtUtc: string;
    sourceUrl: string;
    retrievedAt: string;
  }>;
  universitiesWithoutDeadlineFacts: string[];
}

interface ShortlistBoardProps {
  shortlist: ShortlistInfo;
  groups: Groups;
  deadlineSummary: DeadlineSummary | null;
  deadlineError: string | null;
}

interface AddResponse {
  ok?: boolean;
  item?: ItemRow;
  code?: string;
  message?: string;
}

const BUCKETS: ItemRow["bucket"][] = ["reach", "match", "safety"];

const BUCKET_COPY: Record<
  ItemRow["bucket"],
  { title: string; hint: string; accent: string }
> = {
  reach: {
    title: "冲刺",
    hint: "录取概率低于中位线,但回报大。",
    accent: "text-persimmon",
  },
  match: {
    title: "匹配",
    hint: "录取概率与中位线吻合,核心主力。",
    accent: "text-cobalt",
  },
  safety: {
    title: "保底",
    hint: "明显高于中位线,确保有学可上。",
    accent: "text-jade",
  },
};

const ERROR_COPY: Record<string, string> = {
  MISSING_UNIVERSITY: "请输入学校 id 或关键词。",
  INVALID_BUCKET: "档位必须是 reach / match / safety。",
  DUPLICATE_ITEM: "这所学校已经在清单里,可调整档位或删除后重加。",
  UNKNOWN_UNIVERSITY: "找不到该学校,请先在地图或对比页确认 id。",
  DB_UNREACHABLE: "数据库暂时不可用,请稍后重试。",
};

export function ShortlistBoard({
  shortlist,
  groups: initialGroups,
  deadlineSummary,
  deadlineError,
}: ShortlistBoardProps): JSX.Element {
  const [groups, setGroups] = useState<Groups>(initialGroups);

  // Add form state
  const [universityId, setUniversityId] = useState("");
  const [bucket, setBucket] = useState<ItemRow["bucket"]>("match");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function findItem(id: string): ItemRow | undefined {
    for (const b of BUCKETS) {
      const hit = groups[b].find((i) => i.id === id);
      if (hit) return hit;
    }
    return undefined;
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (adding) return;
    const id = universityId.trim();
    if (!id) {
      setAddError(ERROR_COPY.MISSING_UNIVERSITY);
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/shortlists/${shortlist.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ universityId: id, bucket }),
      });
      const data = (await res.json().catch(() => ({}))) as AddResponse;
      if (!res.ok || !data.ok || !data.item) {
        const code = data.code ?? "DB_UNREACHABLE";
        setAddError(
          ERROR_COPY[code] ?? data.message ?? "暂时无法添加,请稍后重试。",
        );
        return;
      }
      const newItem: ItemRow = data.item;
      setGroups((prev) => {
        const next: Groups = {
          reach: [...prev.reach],
          match: [...prev.match],
          safety: [...prev.safety],
        };
        next[newItem.bucket].push(newItem);
        return next;
      });
      setUniversityId("");
    } catch {
      setAddError("网络异常,请稍后再试。");
    } finally {
      setAdding(false);
    }
  }

  async function onMove(itemId: string, toBucket: ItemRow["bucket"]) {
    const item = findItem(itemId);
    if (!item || item.bucket === toBucket) return;
    // Optimistic move: pluck from current column, push into target.
    const previous = groups;
    setGroups((prev) => {
      const next: Groups = {
        reach: prev.reach.filter((i) => i.id !== itemId),
        match: prev.match.filter((i) => i.id !== itemId),
        safety: prev.safety.filter((i) => i.id !== itemId),
      };
      next[toBucket].push({ ...item, bucket: toBucket });
      return next;
    });
    try {
      const res = await fetch(
        `/api/shortlists/${shortlist.id}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: toBucket }),
        },
      );
      if (!res.ok) setGroups(previous);
    } catch {
      setGroups(previous);
    }
  }

  async function onRemove(itemId: string) {
    const previous = groups;
    setGroups((prev) => ({
      reach: prev.reach.filter((i) => i.id !== itemId),
      match: prev.match.filter((i) => i.id !== itemId),
      safety: prev.safety.filter((i) => i.id !== itemId),
    }));
    try {
      const res = await fetch(
        `/api/shortlists/${shortlist.id}/items/${itemId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) setGroups(previous);
    } catch {
      setGroups(previous);
    }
  }

  const totalCount =
    groups.reach.length + groups.match.length + groups.safety.length;

  return (
    <div className="mt-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
            {shortlist.season ?? "选校清单"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            {shortlist.name}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            共 {totalCount} 所学校 ·
            <span className="ml-2 text-persimmon">
              冲刺 {groups.reach.length}
            </span>{" "}
            ·
            <span className="ml-2 text-cobalt">匹配 {groups.match.length}</span>{" "}
            ·<span className="ml-2 text-jade">保底 {groups.safety.length}</span>
          </p>
        </div>
      </header>

      <section
        aria-labelledby="information-heading"
        className="mt-6 rounded-control border border-border-soft bg-surface-1 p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="information-heading"
              className="text-sm font-semibold text-text-primary"
            >
              清单信息闭环
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-text-secondary">
              {deadlineError ??
                deadlineSummary?.timezoneNotice ??
                "本面板只读取已审核事实层；缺失会显式标注。"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={`/deadlines?shortlistId=${encodeURIComponent(shortlist.id)}`}
              className="inline-flex h-control items-center gap-1.5 rounded-control border border-border-soft px-3 text-[12px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              <CalendarClock size={13} aria-hidden="true" />
              申请日历
            </Link>
            <Link
              href="/costs"
              className="inline-flex h-control items-center gap-1.5 rounded-control border border-border-soft px-3 text-[12px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              <Wallet size={13} aria-hidden="true" />
              成本中心
            </Link>
          </div>
        </div>

        {deadlineSummary ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-control bg-surface-2/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">
                  可排期截止
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                  {deadlineSummary.coverage.scheduled}
                </p>
              </div>
              <div className="rounded-control bg-surface-2/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">
                  显式缺失
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-persimmon">
                  {deadlineSummary.coverage.missing}
                </p>
              </div>
              <div className="rounded-control bg-surface-2/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">
                  无效事实
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                  {deadlineSummary.coverage.invalid}
                </p>
              </div>
              <div className="rounded-control bg-surface-2/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-text-muted">
                  未覆盖学校
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                  {deadlineSummary.universitiesWithoutDeadlineFacts.length}
                </p>
              </div>
            </div>

            {deadlineSummary.items.length > 0 ? (
              <ul className="mt-3 divide-y divide-border-soft rounded-control border border-border-soft">
                {deadlineSummary.items.map((item) => (
                  <li
                    key={`${item.title}-${item.dueAtUtc}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-text-primary">
                        {item.title}
                      </p>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[11px] text-text-secondary underline decoration-text-tertiary underline-offset-2 hover:text-cobalt"
                      >
                        已审核来源
                      </a>
                    </div>
                    <span className="shrink-0 rounded-full bg-cobalt/10 px-2 py-0.5 text-[11px] font-medium text-cobalt">
                      UTC {item.dueAtUtc.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-control border border-border-soft bg-surface-2/50 px-3 py-2 text-[12px] text-text-secondary">
                当前清单没有可排期的已审核截止日，不会显示推测日期。
              </p>
            )}
          </>
        ) : !deadlineError ? (
          <p className="mt-4 rounded-control border border-border-soft bg-surface-2/50 px-3 py-2 text-[12px] text-text-secondary">
            当前清单暂无截止日摘要。
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="add-heading"
        className="mt-6 rounded-control border border-border-soft bg-surface-1 p-4"
      >
        <h2
          id="add-heading"
          className="text-sm font-semibold text-text-primary"
        >
          添加学校到清单
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          粘贴学校 id(从地图或对比页 url 复制),选择档位即可加入。
        </p>
        <form
          onSubmit={onAdd}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          noValidate
        >
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[12px] font-medium text-text-secondary">
              学校 id
            </span>
            <div className="relative">
              <Search
                size={13}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="text"
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                placeholder="例如:harvard-university"
                className="h-control w-full rounded-control border border-border-soft bg-surface-1 pl-7 pr-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-text-secondary">
              档位
            </span>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as ItemRow["bucket"])}
              className="h-control rounded-control border border-border-soft bg-surface-1 px-3 text-[14px] text-text-primary focus-visible:border-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <option value="reach">冲刺</option>
              <option value="match">匹配</option>
              <option value="safety">保底</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex h-control items-center justify-center gap-1.5 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Plus size={14} aria-hidden="true" />
            {adding ? "添加中…" : "添加"}
          </button>
        </form>
        {addError && (
          <div className="mt-3 rounded-control border border-amber-300/40 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
            {addError}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {BUCKETS.map((b) => {
          const copy = BUCKET_COPY[b];
          const rows = groups[b];
          return (
            <div
              key={b}
              aria-labelledby={`bucket-${b}`}
              className="flex min-h-[12rem] flex-col rounded-control border border-border-soft bg-surface-1"
            >
              <header className="flex items-center justify-between border-b border-border-soft px-4 py-3">
                <div>
                  <h3
                    id={`bucket-${b}`}
                    className={`text-sm font-semibold ${copy.accent}`}
                  >
                    {copy.title} ({rows.length})
                  </h3>
                  <p className="mt-0.5 text-[11px] text-text-secondary">
                    {copy.hint}
                  </p>
                </div>
              </header>
              <ul className="flex-1 divide-y divide-border-soft">
                {rows.length === 0 ? (
                  <li className="px-4 py-6 text-center text-[12px] text-text-tertiary">
                    暂无学校
                  </li>
                ) : (
                  rows.map((it) => (
                    <li
                      key={it.id}
                      className="group flex items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <Link
                        href={`/university/${encodeURIComponent(it.universityId)}`}
                        className="min-w-0 flex-1"
                      >
                        <p className="truncate text-[13px] font-medium text-text-primary">
                          {it.universityChineseName ?? it.universityName}
                        </p>
                        <p
                          className="truncate text-[11px] text-text-secondary"
                          lang="en"
                        >
                          {it.universityName}
                        </p>
                      </Link>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                        <select
                          aria-label={`移动 ${it.universityChineseName ?? it.universityName} 到其他档位`}
                          value={it.bucket}
                          onChange={(e) =>
                            onMove(it.id, e.target.value as ItemRow["bucket"])
                          }
                          className="h-7 rounded-control border border-border-soft bg-surface-1 px-1.5 text-[11px] text-text-secondary focus-visible:border-cobalt focus-visible:outline-none"
                        >
                          <option value="reach">冲刺</option>
                          <option value="match">匹配</option>
                          <option value="safety">保底</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            onMove(
                              it.id,
                              b === "reach"
                                ? "match"
                                : b === "match"
                                  ? "safety"
                                  : "reach",
                            )
                          }
                          aria-label="档位切换"
                          className="grid h-7 w-7 place-items-center rounded-control border border-border-soft text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                        >
                          <ArrowRightLeft size={12} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(it.id)}
                          aria-label={`移除 ${it.universityChineseName ?? it.universityName}`}
                          className="grid h-7 w-7 place-items-center rounded-control border border-border-soft text-text-secondary transition hover:border-persimmon/40 hover:text-persimmon"
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </section>

      {totalCount === 0 && (
        <div className="mt-6 rounded-control border border-border-soft bg-surface-1 p-6 text-center text-[13px] text-text-secondary">
          <X
            size={16}
            aria-hidden="true"
            className="mx-auto mb-2 text-text-tertiary"
          />
          清单还是空的,用上方表单加入第一所学校。
        </div>
      )}
    </div>
  );
}

export default ShortlistBoard;
