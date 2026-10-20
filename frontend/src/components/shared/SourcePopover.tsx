"use client";

import { useState } from "react";
import { Clock, ExternalLink, ShieldCheck } from "lucide-react";
import type { Fact } from "@/domain/information/fact";

const CONFIDENCE_LABELS: Record<Fact["confidence"], string> = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
};

function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "暂无";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value instanceof Date ? value.toISOString() : value;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function SourcePopover({ fact }: { fact: Fact }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`fact-source-${fact.id}`}
        className="inline-flex h-control items-center gap-1 rounded-control border border-border-soft bg-surface-1 px-2 text-[11px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
      >
        <ShieldCheck size={12} aria-hidden="true" />
        来源
      </button>
      {open && (
        <div
          id={`fact-source-${fact.id}`}
          className="absolute right-0 z-20 mt-2 w-72 rounded-control border border-border-soft bg-surface-1 p-3 text-left shadow-xl"
        >
          <p className="text-[11px] font-semibold text-text-primary">事实来源</p>
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-start gap-1 text-[11px] leading-relaxed text-cobalt hover:underline"
          >
            <ExternalLink size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="break-all">{fact.sourceUrl}</span>
          </a>
          <dl className="mt-3 grid gap-1.5 text-[10px] text-text-muted">
            <div className="flex justify-between gap-2">
              <dt>来源 ID</dt>
              <dd className="truncate font-mono text-text-secondary">{fact.sourceId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>抓取时间</dt>
              <dd className="text-text-secondary">{formatTime(fact.retrievedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>审核时间</dt>
              <dd className="text-text-secondary">{formatTime(fact.reviewedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>事实版本</dt>
              <dd className="text-text-secondary">rev {fact.currentRevision}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>置信度</dt>
              <dd className="text-text-secondary">{CONFIDENCE_LABELS[fact.confidence]}</dd>
            </div>
          </dl>
          <p className="mt-2 flex items-start gap-1 text-[10px] leading-relaxed text-text-muted">
            <Clock size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
            该行仅消费已审核事实；来源页面变化会进入修订历史，不会静默改写。
          </p>
        </div>
      )}
    </div>
  );
}

export default SourcePopover;
