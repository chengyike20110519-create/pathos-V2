"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Database, Loader2, ShieldCheck } from "lucide-react";
import type { Fact } from "@/domain/information/fact";
import {
  schoolFactLabel,
  type SchoolFactProfile,
} from "@/domain/information/school-profile";
import { SourcePopover } from "@/components/shared/SourcePopover";

interface ApiErrorBody {
  ok?: boolean;
  code?: string;
  message?: string;
}

type SectionState =
  | { kind: "loading" }
  | { kind: "ready"; profile: SchoolFactProfile }
  | { kind: "unavailable"; message: string; code?: string }
  | { kind: "error"; message: string };

const MISSING_LABELS: Record<NonNullable<Fact["nullReason"]>, string> = {
  not_reported: "官方未报告",
  not_applicable: "不适用",
  source_blocked: "来源访问受限",
  source_unavailable: "来源暂不可用",
  source_review_not_completed: "来源审核未完成",
  requires_manual_review: "需人工复核",
};

const SCOPE_LABELS: Record<NonNullable<Fact["applicantScope"]>, string> = {
  all: "全部申请人",
  international: "国际生",
  undergraduate: "本科生",
  graduate: "研究生",
};

function formatFactValue(fact: Fact): string {
  if (fact.nullReason) return MISSING_LABELS[fact.nullReason] ?? "缺失";
  if (fact.valueRange) {
    return `${fact.valueRange.min}${fact.unit ? ` ${fact.unit}` : ""} - ${fact.valueRange.max}${fact.unit ? ` ${fact.unit}` : ""}`;
  }
  if (fact.valueList?.length) return fact.valueList.join(" / ");
  if (fact.valueBoolean != null) return fact.valueBoolean ? "是" : "否";
  if (fact.valueNumber != null) {
    if (fact.valueType === "percent") return `${fact.valueNumber.toFixed(fact.valueNumber < 10 ? 1 : 0)}%`;
    if (fact.valueType === "currency") {
      return `${fact.currency === "CNY" ? "¥" : "$"}${fact.valueNumber.toLocaleString("zh-CN")}`;
    }
    return fact.valueNumber.toLocaleString("zh-CN");
  }
  if (fact.valueText) {
    if (fact.valueType === "date") {
      const date = new Date(fact.valueText);
      return Number.isNaN(date.getTime()) ? fact.valueText : date.toISOString().slice(0, 10);
    }
    return fact.valueText;
  }
  return "缺失";
}

function FactRow({ fact }: { fact: Fact }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border-soft py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-text-primary">{schoolFactLabel(fact.fieldKey)}</p>
        <p className="mt-0.5 text-[10px] text-text-muted">
          {[fact.academicYear, fact.applicantScope ? SCOPE_LABELS[fact.applicantScope] : null]
            .filter(Boolean)
            .join(" · ") || "未标注范围"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-[13px] font-semibold tabular-nums ${
            fact.nullReason ? "text-text-muted" : "text-text-primary"
          }`}
        >
          {formatFactValue(fact)}
        </span>
        <SourcePopover fact={fact} />
      </div>
    </li>
  );
}

export function UniversityFactSection({ universityId }: { universityId: string }) {
  const [state, setState] = useState<SectionState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    const url = `/api/information/facts?entityType=university&entityId=${encodeURIComponent(universityId)}`;
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
            setState({
              kind: "unavailable",
              code: body.code,
              message:
                response.status >= 500
                  ? "已审核事实层暂不可用，稍后会随数据库配置恢复。"
                  : body.message ?? `事实层请求失败 (${response.status})`,
            });
          return;
        }
        const body = (await response.json()) as { ok?: boolean; profile?: SchoolFactProfile };
        if (!body.ok || !body.profile) {
          setState({ kind: "error", message: "事实层返回格式无效" });
          return;
        }
        setState({ kind: "ready", profile: body.profile });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "事实层网络请求失败",
        });
      });
    return () => controller.abort();
  }, [universityId]);

  return (
    <section
      aria-labelledby="university-facts-title"
      className="mt-4 rounded-control border border-border-soft bg-surface-1 p-4 sm:p-5"
      data-information-facts={state.kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-cobalt">
            <ShieldCheck size={12} aria-hidden="true" />
            Approved facts
          </p>
          <h2 id="university-facts-title" className="mt-1 text-sm font-semibold text-text-primary">
            已审核事实层
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-text-secondary">
            仅展示通过人工审核、仍在有效期内的结构化事实。下方 Preview 档案继续保留，但两者不互相冒充。
          </p>
        </div>
        {state.kind === "ready" && (
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-[10px] text-text-muted">事实</p>
              <p className="text-lg font-semibold tabular-nums text-text-primary">{state.profile.totalFacts}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted">明确缺失</p>
              <p className="text-lg font-semibold tabular-nums text-text-secondary">{state.profile.missingFacts}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        {state.kind === "loading" && (
          <p className="flex items-center gap-2 rounded-control border border-border-soft bg-surface-muted px-3 py-3 text-[12px] text-text-secondary">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            正在读取已审核事实…
          </p>
        )}

        {state.kind === "unavailable" && (
          <p className="flex items-start gap-2 rounded-control border border-border-soft bg-surface-muted px-3 py-3 text-[12px] leading-relaxed text-text-secondary">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-persimmon" aria-hidden="true" />
            <span>
              已审核事实层暂不可用{state.code ? `（${state.code}）` : ""}：{state.message}
            </span>
          </p>
        )}

        {state.kind === "error" && (
          <p className="flex items-start gap-2 rounded-control border border-persimmon/30 bg-persimmon/10 px-3 py-3 text-[12px] text-persimmon">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        )}

        {state.kind === "ready" && state.profile.totalFacts === 0 && (
          <p className="flex items-start gap-2 rounded-control border border-border-soft bg-surface-muted px-3 py-3 text-[12px] leading-relaxed text-text-secondary">
            <Database size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            这所学校尚未导入已审核事实。现有 Preview 档案保持展示，但不会在这里被标记为已审核。
          </p>
        )}

        {state.kind === "ready" && state.profile.groups.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-2">
            {state.profile.groups.map((group) => (
              <article key={group.id} className="rounded-control border border-border-soft bg-surface-muted/40 p-3">
                <h3 className="text-[12px] font-semibold text-text-primary">{group.title}</h3>
                <p className="mt-0.5 text-[10px] text-text-muted">{group.description}</p>
                <ul className="mt-2" aria-label={`${group.title}事实`}>
                  {group.facts.map((fact) => (
                    <FactRow key={fact.id} fact={fact} />
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}

        {state.kind === "ready" && state.profile.recentChanges.length > 0 && (
          <div className="mt-4 rounded-control border border-border-soft bg-surface-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold text-text-primary">最近事实更新</h3>
              <Link
                href="/opportunities"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-cobalt hover:underline"
              >
                查看信息动态
                <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            </div>
            <ul className="mt-2 divide-y divide-border-soft">
              {state.profile.recentChanges.map((change) => (
                <li key={`${change.factId}-${change.updatedAt}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-text-primary">{change.label}</p>
                    <p className="text-[10px] text-text-muted">
                      {change.updatedAt.slice(0, 16).replace("T", " ")} · rev {change.revision}
                    </p>
                  </div>
                  <a
                    href={change.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] text-cobalt hover:underline"
                  >
                    来源
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default UniversityFactSection;
