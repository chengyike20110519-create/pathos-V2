"use client";

import Link from "next/link";
import { ArrowUpRight, Check, ExternalLink, LineChart, Radar, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import type { TimeSeriesMetric, TimeSeriesPoint } from "@/types/timeseries";

export function V2PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <EnterprisePageHeader eyebrow={eyebrow} title={title} description={description} actions={action} />;
}

export function V2Panel({ children, className = "", revealDelay }: { children: ReactNode; className?: string; revealDelay?: 80 | 160 | 240 | 320 | 400 | 480 }) {
  return <section className={`page-motion-card rounded-card border border-border-soft bg-surface-1 p-4 shadow-sm sm:p-5 ${className}`} data-reveal="true" data-reveal-delay={revealDelay ? String(revealDelay) : undefined}>{children}</section>;
}

export function V2Provenance({ source = "来源待挂接", asOf, verifiedBy, confidence }: { source?: string; asOf?: string; verifiedBy?: string; confidence?: number }) {
  const timestamp = asOf ? new Date(asOf).getTime() : NaN;
  const age = Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 86400000)) : null;
  const tone = age === null ? "text-text-muted" : age < 30 ? "text-jade" : age < 90 ? "text-persimmon" : "text-danger";
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted" title={`来源：${source}${verifiedBy ? `；核验人：${verifiedBy}` : ""}`}><span className="inline-flex items-center gap-1 font-medium text-text-secondary"><ShieldCheck size={12} className="text-jade" />{source}</span><span className={tone}>{age === null ? "更新日期待核验" : `更新 ${age} 天前`}</span><span>{confidence === undefined ? "置信度待核验" : `置信度 ${confidence}%`}</span>{verifiedBy ? <span className="inline-flex items-center gap-1"><Check size={11} className="text-jade" />{verifiedBy}</span> : null}</div>;
}

export function V2Missing({ text = "暂无" }: { text?: string }) {
  return <span className="italic text-text-muted">{text}</span>;
}

// The data source does not currently publish a universal series for every
// school. Keep the default empty so a chart can never imply fabricated
// historical values; callers pass a real school's series when available.
export const TREND_DATA: TimeSeriesPoint[] = [];

export function V2TrendChart({ data = TREND_DATA, metric = "acceptanceRate" as TimeSeriesMetric, height = 210, events = [] }: { data?: TimeSeriesPoint[]; metric?: TimeSeriesMetric; height?: number; events?: Array<{ semester: string; title: string }> }) {
  const values = useMemo(() => data.map((point) => point[metric] ?? null).filter((value): value is number => typeof value === "number"), [data, metric]);
  if (data.length === 0 || values.length === 0) {
    return <div role="status" className="flex min-h-[180px] items-center justify-center rounded-control border border-dashed border-border-soft bg-surface-muted/30 px-4 text-center text-xs text-text-muted">该学校暂无已核验的{metric === "acceptanceRate" ? "录取率" : metric === "sat" ? "SAT" : metric === "gpa" ? "GPA" : "学费"}时序数据。</div>;
  }
  const max = Math.max(...values, 1); const min = Math.min(...values, 0); const range = max - min || 1;
  const points = data.map((point, index) => { const raw = point[metric]; const value = typeof raw === "number" ? raw : min; const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100; const y = 92 - ((value - min) / range) * 78; return `${x},${y}`; }).join(" ");
  const label = metric === "acceptanceRate" ? "录取率" : metric === "sat" ? "SAT" : metric === "gpa" ? "GPA" : "总成本";
  return <div role="img" aria-label={`${label}时序图`}><div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-text-muted"><span className="inline-flex items-center gap-1"><LineChart size={12} className="text-cobalt" />{label} · 时序</span>{events.length > 0 ? <span className="inline-flex items-center gap-1 text-persimmon"><span className="h-1.5 w-1.5 rounded-full bg-persimmon" />{events.length} 个政策事件</span> : null}</div><svg viewBox="0 0 100 100" className="h-auto w-full" style={{ height }} preserveAspectRatio="none"><path d="M0 92H100M0 53H100M0 14H100" stroke="currentColor" className="text-border-soft" strokeWidth=".35" strokeDasharray="1.5 2" fill="none" /><polyline points={points} fill="none" stroke="currentColor" className="text-cobalt" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />{data.map((point, index) => { const raw = point[metric]; if (typeof raw !== "number") return null; const value = `${(raw - min) / range}`; const cx = data.length === 1 ? 50 : (index / (data.length - 1)) * 100; const cy = 92 - Number(value) * 78; return <circle key={point.semester} cx={cx} cy={cy} r="1.7" className="fill-surface-1 stroke-cobalt" strokeWidth=".7" />; })}</svg><div className="mt-1 flex justify-between text-[9px] text-text-muted">{data.map((point) => <span key={point.semester}>{point.semester}</span>)}</div>{events.length > 0 ? <ul className="mt-3 space-y-1 text-[10px] text-text-secondary">{events.map((event) => <li key={`${event.semester}-${event.title}`}><span className="font-medium text-persimmon">{event.semester}</span> · {event.title}</li>)}</ul> : null}</div>;
}

export function V2SourceCard({ title = "数据出处", source = "来源待挂接", detail = "不同来源可能存在统计口径差异，PathOS 保留原始出处并在此处说明。", href }: { title?: string; source?: string; detail?: string; href?: string }) {
  return <div className="rounded-control border border-border-soft bg-surface-muted/40 p-3"><div className="flex items-center justify-between gap-2"><p className="text-caption font-semibold text-text-primary">{title}</p>{href ? <a href={href} target="_blank" rel="noreferrer" aria-label={`打开${source}来源`}><ExternalLink size={13} className="text-cobalt" /></a> : <ExternalLink size={13} className="text-text-muted" />}</div><p className="mt-1 text-[11px] font-medium text-cobalt">{source}</p><p className="mt-1 text-[11px] leading-5 text-text-muted">{detail}</p></div>;
}

export function V2FeatureCard({ href, title, description, icon }: { href: string; title: string; description: string; icon?: ReactNode }) {
  return <Link href={href} className="group flex min-h-[150px] flex-col justify-between rounded-card border border-border-soft bg-surface-1 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-cobalt/40 hover:shadow-md"><div><div className="flex items-start justify-between"><span className="text-cobalt">{icon ?? <Radar size={19} />}</span><ArrowUpRight size={15} className="text-text-muted transition group-hover:text-cobalt" /></div><h2 className="mt-4 text-sm font-semibold text-text-primary">{title}</h2><p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p></div><span className="mt-4 text-[11px] font-medium text-cobalt">进入模块</span></Link>;
}
