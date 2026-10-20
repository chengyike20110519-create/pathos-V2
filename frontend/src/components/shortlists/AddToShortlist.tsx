"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ListPlus, Loader2, X } from "lucide-react";

type Shortlist = { id: string; name: string; season: string | null };
type ListsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; lists: Shortlist[] }
  | { kind: "error"; code?: string; message: string };
type Bucket = "reach" | "match" | "safety";

const BUCKETS = [
  { id: "reach", label: "冲刺", hint: "录取概率较低" },
  { id: "match", label: "匹配", hint: "与背景相近" },
  { id: "safety", label: "保底", hint: "相对更稳" },
] as const;

function errorPresentation(code?: string): string {
  if (code === "UNAUTHENTICATED") return "请先登录，再加入自己的选校清单。";
  if (code === "DATABASE_NOT_CONFIGURED") return "数据库未配置，清单暂不能写入。";
  if (code === "DUPLICATE_ITEM") return "这所学校已经在当前清单中。";
  if (code === "UNKNOWN_UNIVERSITY") return "当前 Preview 学校尚未导入生产 universities 表。";
  if (code === "NOT_FOUND") return "清单不存在或不属于当前用户。";
  return "清单服务暂不可用，请稍后重试。";
}

async function errorCode(response: Response, body: unknown): Promise<string | undefined> {
  if (typeof (body as { code?: unknown })?.code === "string") {
    return (body as { code: string }).code;
  }
  const retry = await response.json().catch(() => ({}));
  return typeof (retry as { code?: unknown })?.code === "string"
    ? (retry as { code: string }).code
    : undefined;
}

export function AddToShortlist({
  universityId,
  universityName,
  className,
}: {
  universityId: string;
  universityName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [listsState, setListsState] = useState<ListsState>({ kind: "idle" });
  const [shortlistId, setShortlistId] = useState("");
  const [bucket, setBucket] = useState<Bucket>("match");
  const [newListName, setNewListName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadLists = useCallback(async () => {
    setListsState({ kind: "loading" });
    try {
      const response = await fetch("/api/shortlists", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok !== true) {
        const code = await errorCode(response, body);
        setListsState({ kind: "error", code, message: errorPresentation(code) });
        return;
      }
      const lists = Array.isArray(body?.shortlists) ? body.shortlists : [];
      setListsState({ kind: "ready", lists });
      setShortlistId((current) => current || lists[0]?.id || "");
    } catch {
      setListsState({ kind: "error", message: errorPresentation() });
    }
  }, []);

  useEffect(() => {
    if (open && listsState.kind === "idle") void loadLists();
  }, [open, listsState.kind, loadLists]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      let targetId = shortlistId;
      if (!targetId) {
        const name = newListName.trim();
        if (!name) {
          setFeedback({ kind: "error", text: "请选择已有清单，或输入新清单名称。" });
          return;
        }
        const created = await fetch("/api/shortlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, season: "Fall 2027" }),
        });
        const createdBody = await created.json().catch(() => ({}));
        if (!created.ok || createdBody?.ok !== true || !createdBody?.shortlist?.id) {
          const code = await errorCode(created, createdBody);
          setFeedback({ kind: "error", text: errorPresentation(code) });
          return;
        }
        targetId = createdBody.shortlist.id;
        setShortlistId(targetId);
        setListsState((current) =>
          current.kind === "ready"
            ? { kind: "ready", lists: [...current.lists, createdBody.shortlist] }
            : current,
        );
      }
      const response = await fetch(`/api/shortlists/${encodeURIComponent(targetId)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ universityId, bucket }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok !== true) {
        const code = await errorCode(response, body);
        setFeedback({ kind: "error", text: errorPresentation(code) });
        return;
      }
      setFeedback({ kind: "ok", text: `已把 ${universityName} 加入清单。` });
    } catch {
      setFeedback({ kind: "error", text: errorPresentation() });
    } finally {
      setSubmitting(false);
    }
  };
  const lists = listsState.kind === "ready" ? listsState.lists : [];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFeedback(null);
          setOpen(true);
        }}
        className={
          className ??
          "inline-flex min-h-control items-center gap-1 rounded-none border border-[#eef1f526] px-3 text-xs font-medium text-[#eef1f5] transition hover:border-[#dd8568] hover:text-[#dd8568]"
        }
      >
        <ListPlus size={13} aria-hidden="true" />
        加入清单
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-[#11151f]/70 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label={`把 ${universityName} 加入选校清单`}
          onClick={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <section className="w-full max-w-lg border border-[#11151f1a] bg-white text-[#11151f] shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-[#11151f1a] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b3d28]">Shortlist</p>
                <h2 className="mt-1 text-lg font-semibold">加入选校清单</h2>
                <p className="mt-1 text-xs text-[#11151f]/65">{universityName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭加入清单"
                className="grid h-11 w-11 place-items-center text-[#11151f]/50 transition hover:text-[#bd5a3e]"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>

            <div className="space-y-4 px-5 py-5">
              {listsState.kind === "loading" ? (
                <p className="flex items-center gap-2 text-sm text-[#11151f]/65">
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  正在读取清单...
                </p>
              ) : listsState.kind === "error" ? (
                <div className="border border-[#bd5a3e45] bg-[#fff8f5] px-4 py-3 text-sm text-[#9b3d28]">
                  <p>{listsState.message}</p>
                  {listsState.code === "UNAUTHENTICATED" ? (
                    <Link
                      href={`/login?next=${encodeURIComponent(`/university/${universityId}`)}`}
                      className="mt-3 inline-flex min-h-control-lg items-center border border-[#11151f26] px-3 text-xs font-semibold text-[#11151f]/75 transition hover:border-[#bd5a3e] hover:text-[#9b3d28]"
                    >
                      去登录
                    </Link>
                  ) : null}
                </div>
              ) : (
                <>
                  {lists.length > 0 ? (
                    <label className="block">
                      <span className="text-xs font-semibold text-[#11151f]/70">选择清单</span>
                      <select
                        value={shortlistId}
                        onChange={(event) => setShortlistId(event.target.value)}
                        className="mt-1 h-control w-full border border-[#11151f26] bg-white px-3 text-sm text-[#11151f]"
                      >
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}{list.season ? ` · ${list.season}` : ""}
                          </option>
                        ))}
                        <option value="">创建新清单</option>
                      </select>
                    </label>
                  ) : null}

                  {lists.length === 0 || !shortlistId ? (
                    <label className="block">
                      <span className="text-xs font-semibold text-[#11151f]/70">新清单名称</span>
                      <input
                        value={newListName}
                        onChange={(event) => setNewListName(event.target.value)}
                        placeholder="例如：Fall 2027 主申清单"
                        maxLength={80}
                        className="mt-1 h-control w-full border border-[#11151f26] bg-white px-3 text-sm text-[#11151f] outline-none focus:border-[#bd5a3e]"
                      />
                    </label>
                  ) : null}

                  <fieldset>
                    <legend className="text-xs font-semibold text-[#11151f]/70">申请分组</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {BUCKETS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setBucket(item.id)}
                          aria-pressed={bucket === item.id}
                          className={
                            "min-h-control border px-3 text-left text-xs transition " +
                            (bucket === item.id
                              ? "border-[#bd5a3e] bg-[#fff8f5] text-[#9b3d28]"
                              : "border-[#11151f26] text-[#11151f]/70 hover:border-[#bd5a3e]")
                          }
                        >
                          <span className="block font-semibold">{item.label}</span>
                          <span className="block text-[10px] opacity-75">{item.hint}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}

              {feedback ? (
                <p
                  role="status"
                  className={
                    "border px-3 py-2 text-xs " +
                    (feedback.kind === "ok"
                      ? "border-jade/30 bg-jade/10 text-jade"
                      : "border-[#bd5a3e45] bg-[#fff8f5] text-[#9b3d28]")
                  }
                >
                  {feedback.text}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#11151f1a] px-5 py-4">
              <Link href="/workbench/shortlists" className="text-xs font-medium text-[#9b3d28] hover:underline">
                管理全部清单
              </Link>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || listsState.kind === "loading" || listsState.kind === "error"}
                className="inline-flex min-h-control-lg items-center gap-1 bg-[#bd5a3e] px-4 text-xs font-semibold text-white transition hover:bg-[#dd8568] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ListPlus size={13} aria-hidden="true" />}
                {submitting ? "保存中..." : "保存到清单"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default AddToShortlist;
