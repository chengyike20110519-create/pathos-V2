"use client";

import { useState, useMemo, useCallback } from "react";
import { useDataSource } from "@/services/data-source-provider";
import { useRegionMetrics, useUniversitySummaries } from "@/hooks/use-data-source";
import { Calculator, DollarSign, Plane, ShieldCheck, FileText, Plus, X, Copy, Check } from "lucide-react";
import { useCompareStore } from "@/state/compare-store";
import {
  computeAnnualTotalRmb,
  computeCostMultiplier,
  formatRmbShort,
  TUITION_EMPTY_LABEL,
  type FormattedCost,
} from "@/lib/cost-format";
import { tuitionRmbFromSummary } from "@/lib/legacy-mappers";
import { SchoolPicker } from "@/components/calculator/SchoolPicker";
import { PageEmptyState, PageShell, PageStep } from "@/components/shared/PageShell";

const EXCHANGE_RATE = 7.2;
const STANDARD_COSTS = [
  { label: "医疗保险", amount: 36000, icon: ShieldCheck },
  { label: "往返机票 (2次/年)", amount: 24000, icon: Plane },
  { label: "签证及服务费", amount: 12000, icon: FileText },
];
const LIVING_TIERS = [
  { id: "low", label: "低", labelEn: "Low", housing: 72000, food: 48000, transport: 12000, desc: "合租·自己做饭" },
  { id: "medium", label: "中", labelEn: "Medium", housing: 120000, food: 72000, transport: 24000, desc: "一居室·混合饮食" },
  { id: "high", label: "高", labelEn: "High", housing: 180000, food: 108000, transport: 36000, desc: "独立公寓·外食多" },
];
const TIER_LIVING_LABELS: Record<string, { label: string; items: { label: string; key: string }[] }> = {
  low:    { label: "节俭型", items: [{ label: "住宿 (合租)", key: "housing" }, { label: "餐饮 (自己做)", key: "food" }, { label: "交通 (公交)", key: "transport" }] },
  medium: { label: "标准型", items: [{ label: "住宿 (一居室)", key: "housing" }, { label: "餐饮 (混合)", key: "food" }, { label: "交通 (公交+打车)", key: "transport" }] },
  high:   { label: "舒适型", items: [{ label: "住宿 (独立公寓)", key: "housing" }, { label: "餐饮 (外食多)", key: "food" }, { label: "交通 (公交+车)", key: "transport" }] },
};

export default function CalculatorPage() {
  const compare = useCompareStore();
  const selectedIds = compare.ids;
  const [tierId, setTierId] = useState("medium");
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dataSource = useDataSource();
  const summariesState = useUniversitySummaries(dataSource);
  const incomeMetricsState = useRegionMetrics(dataSource, {
    metricId: "income",
    granularity: "state",
  });
  const allUnis = useMemo<UniversityView[]>(
    () => (summariesState.state.status === "ready" ? (summariesState.state.data as unknown as UniversityView[]) : []),
    [summariesState.state],
  );
  const incomeRecords = useMemo(
    () => (incomeMetricsState.state.status === "ready" ? (incomeMetricsState.state.data as unknown as Array<{ metricId: string; value: number; fipsCode: string }>) : []),
    [incomeMetricsState.state],
  );
  const stateCostMult = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of incomeRecords) {
      if (r.metricId === "income" && typeof r.value === "number") {
        const fips = String(r.fipsCode ?? "").padStart(2, "0").slice(-2);
        map.set(fips, computeCostMultiplier(r.value));
      }
    }
    return map;
  }, [incomeRecords]);
  const getCostMult = useCallback(
    (fips?: string) => stateCostMult.get(String(fips ?? "").padStart(2, "0").slice(-2)) ?? 0.7,
    [stateCostMult],
  );
  const COST_LEVEL = (m: number) => (m >= 0.85 ? "H" : m >= 0.70 ? "M" : "L");

  const tier = LIVING_TIERS.find((t) => t.id === tierId)!;
  const standardTotal = STANDARD_COSTS.reduce((s, c) => s + c.amount, 0);

  const selected = useMemo(
    () => allUnis.filter((u) => selectedIds.includes(u.id)),
    [allUnis, selectedIds],
  );
  const available = useMemo(
    () => allUnis.filter((u) => !selectedIds.includes(u.id)),
    [allUnis, selectedIds],
  );
  const addUni = useCallback((id: string) => {
    compare.add(id);
    setPickerOpen(false);
  }, [compare]);
  const removeUni = useCallback((id: string) => { compare.remove(id); }, [compare]);

  const totalsById = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const u of selected) {
      const tuition = tuitionRmbFromSummary(u);
      const cm = getCostMult(u.stateFips);
      const tierLiving = tier.housing + tier.food + tier.transport;
      out.set(u.id, computeAnnualTotalRmb(tuition, tierLiving, cm, standardTotal));
    }
    return out;
  }, [selected, getCostMult, tier, standardTotal]);

  const comparableTotals = useMemo(
    () => Array.from(totalsById.values()).filter((v): v is number => typeof v === "number"),
    [totalsById],
  );
  const maxTotal = comparableTotals.length > 0 ? Math.max(...comparableTotals) : 1;
  const BAR_COLORS = ["bg-cobalt", "bg-jade", "bg-persimmon"];

  const handleCopy = useCallback(() => {
    const lines = ["PathOS 留学预算计算器", "=".repeat(30), ""];
    selected.forEach((u) => {
      const tuition = tuitionRmbFromSummary(u);
      const tuitionLabel: FormattedCost = formatRmbShort(tuition);
      const t = totalsById.get(u.id) ?? null;
      const totalLabel: FormattedCost =
        t === null
          ? { kind: "empty", label: TUITION_EMPTY_LABEL }
          : { kind: "value", label: "¥" + t.toLocaleString() };
      lines.push("■ " + u.chineseName + " (" + u.name + ")");
      lines.push("  学费: " + tuitionLabel.label);
      lines.push("  生活费: ¥" + (tier.housing + tier.food + tier.transport).toLocaleString());
      lines.push("  其他: ¥" + standardTotal.toLocaleString());
      lines.push("  总计: " + totalLabel.label);
      lines.push("");
    });
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [selected, tier, standardTotal, totalsById]);

  return (
    <>
      <PageShell
        eyebrow="留学预算"
        title="预算计算器"
        description="选择最多三所大学，按学费、生活费档次、州成本系数和固定支出生成年度预算。"
        icon={Calculator}
        backHref="/map"
        backLabel="返回地图"
        journey={{ step: "3", total: "4", label: "比较成本与选择", nextHref: "/portfolio", nextLabel: "检查申请组合" }}
        primaryAction={
          selectedIds.length < 3 ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex h-control items-center gap-1.5 rounded-control border border-border-soft bg-surface-1 px-3 text-caption font-semibold text-text-primary transition hover:border-cobalt/40 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Plus size={13} aria-hidden="true" /> 添加大学
            </button>
          ) : undefined
        }
        coverage={{
          detail: "学费来自公开学费区间与 IECG 学费带；缺失学费会显示为数据补充中，不会被估算或计入最高费用比较。",
        }}
        contentClassName="space-y-5"
      >
      <PageStep
        step="01"
        title="选择学校并设定生活费"
        description="最多比较三所大学；费用口径、汇率和计算过程在每张卡片内保持可见。"
        aside={<span className="inline-flex items-center gap-1.5 rounded-control border border-border-soft bg-surface-2 px-2.5 py-1 text-caption text-text-secondary"><DollarSign size={12} aria-hidden="true" /> 汇率 {EXCHANGE_RATE}</span>}
      >
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-5" data-reveal data-reveal-delay="80">
          <div className="flex items-center gap-2">
            <span className="text-caption font-medium text-text-secondary whitespace-nowrap">生活费档次</span>
            <div className="flex overflow-hidden rounded-control border border-border-soft">
              {LIVING_TIERS.map((t) => (
                <button key={t.id} onClick={() => setTierId(t.id)}
                  aria-pressed={tierId === t.id}
                  className={"px-3 py-1.5 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " + (tierId === t.id ? "bg-ink text-paper" : "bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary")}>{t.label}</button>
              ))}
            </div>
            <span className="text-[10px] text-text-muted">{tier.desc}</span>
          </div>
          <div className="flex items-center gap-1.5 text-caption text-text-muted">
            <DollarSign size={12} aria-hidden="true" /><span>汇率 {EXCHANGE_RATE}</span>
          </div>
        </div>

        {/* University Selector */}
        <div className="flex flex-wrap items-center gap-2 mb-5" data-reveal data-reveal-delay="160">
          {selected.map((u, i) => {
            const total = totalsById.get(u.id) ?? null;
            const bar = total !== null ? BAR_COLORS[i % 3] : "bg-border-soft";
            return (
              <span key={u.id} className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium text-paper " + bar}>
                {u.chineseName}
                {total === null && (
                  <span className="ml-1 rounded-full bg-paper/25 px-1.5 py-0.5 text-[9px] font-normal" title="学费尚未收录到该校的可用数据源">
                    数据补充中
                  </span>
                )}
                <button type="button" onClick={() => removeUni(u.id)} aria-label={"移除 " + u.chineseName} className="opacity-70 transition-opacity hover:opacity-100"><X size={12} aria-hidden="true" /></button>
              </span>
            );
          })}
          {selectedIds.length < 3 && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex h-control items-center gap-1.5 rounded-control border border-dashed border-border-soft bg-surface-1 px-3 text-caption font-medium text-text-secondary transition hover:border-cobalt/40 hover:bg-cobalt/8 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Plus size={12} aria-hidden="true" />
              添加大学（还可选择 {3 - selectedIds.length} 所）
            </button>
          )}
        </div>

        {/* Empty */}
        {selectedIds.length === 0 && (
          <PageEmptyState
            title="请添加大学开始预算计算"
            description="先选择学校，再调整生活费档次；缺失学费会明确显示，不会生成假总额。"
            action={
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-control bg-cobalt px-4 py-2 text-caption font-semibold text-paper transition hover:bg-cobalt/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Plus size={14} aria-hidden="true" />
                选择第一所大学
              </button>
            }
          />
        )}

        {/* Cards */}
        {selectedIds.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {selected.map((u, i) => {
                const tuition = tuitionRmbFromSummary(u);
                const tuitionLabel = formatRmbShort(tuition);
                const total = totalsById.get(u.id) ?? null;
                const hasCost = total !== null;
                const costMult = getCostMult(u.stateFips);
                const adjH = Math.round(tier.housing * costMult);
                const adjF = Math.round(tier.food * costMult);
                const adjT = Math.round(tier.transport * costMult);
                const living = adjH + adjF + adjT;
                return (
                  <div
                    key={u.id}
                    className="page-motion-card overflow-hidden rounded-card border border-border-soft bg-surface-1 shadow-sm"
                    data-reveal
                    data-reveal-delay={i === 0 ? undefined : i === 1 ? "80" : "160"}
                  >
                    <div className={"flex items-center justify-between px-4 py-2.5 text-body font-medium text-paper " + BAR_COLORS[i % 3]}>
                      <span>{u.chineseName}</span>
                      <button type="button" onClick={() => removeUni(u.id)} aria-label={"移除 " + u.chineseName} className="opacity-70 transition-opacity hover:opacity-100"><X size={14} aria-hidden="true" /></button>
                    </div>
                    <div className={"-mt-1 px-4 pb-2 text-[10px] font-normal text-paper/80 " + BAR_COLORS[i % 3]}>{u.name} · {u.city ?? "—"}, {u.state ?? "—"}</div>
                    <div className="p-4 space-y-2">
                      <div className="flex justify-between text-caption">
                        <span className="text-text-secondary">学费</span>
                        <span className={"font-medium tabular-nums " + (tuitionLabel.kind === "empty" ? "text-text-muted" : "text-text-primary")}>
                          {tuitionLabel.label}
                        </span>
                      </div>
                      <div className="h-px bg-border-soft" />
                      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">生活费 · {TIER_LIVING_LABELS[tierId].label}</div>
                      {TIER_LIVING_LABELS[tierId].items.map((item) => (
                        <div key={item.key} className="flex justify-between text-caption">
                          <span className="text-text-secondary">{item.label}</span>
                          <span className="tabular-nums">¥{Math.round((tier as unknown as Record<string, number>)[item.key] * costMult).toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="-mx-4 flex justify-between bg-surface-2 px-4 py-1 text-caption">
                        <span className="font-medium text-text-secondary">小计</span>
                        <span className="font-medium tabular-nums">¥{living.toLocaleString()}</span>
                        <span className="ml-2 text-[9px] text-text-muted">cost: {COST_LEVEL(costMult)}</span>
                      </div>
                      <div className="h-px bg-border-soft" />
                      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">其他固定费用</div>
                      {STANDARD_COSTS.map((c) => (
                        <div key={c.label} className="flex justify-between text-caption">
                          <span className="flex items-center gap-1 text-text-secondary"><c.icon size={10} aria-hidden="true" />{c.label}</span>
                          <span className="tabular-nums">¥{c.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="h-px bg-border-soft" />
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-body font-bold text-text-primary">年度总费用</span>
                        <div className="text-right">
                          {hasCost ? (
                            <>
                              <div className="text-base font-bold tabular-nums text-text-primary">
                                ¥
                                <span data-counter={String(total as number)} data-counter-format="locale">
                                  {(total as number).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-[10px] tabular-nums text-text-muted">${Math.round((total as number) / EXCHANGE_RATE).toLocaleString()} USD</div>
                            </>
                          ) : (
                            <>
                              <div className="text-body font-medium text-text-muted">{TUITION_EMPTY_LABEL}</div>
                              <div className="text-[10px] text-text-muted">该学校未参与费用对比</div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Calculation breakdown */}
                      <details className="group mt-2">
                        <summary className="cursor-pointer select-none text-[10px] text-text-muted transition-colors hover:text-text-secondary">
                          查看计算过程
                        </summary>
                        <div className="mt-2 space-y-1 border-t border-dashed border-border-soft pt-2 text-[10px] text-text-muted">
                          <div className="flex justify-between">
                            <span>学费（固定）</span>
                            <span>{tuitionLabel.label}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>生活费基数 × {costMult.toFixed(2)}</span>
                            <span>¥{(adjH + adjF + adjT).toLocaleString()}</span>
                          </div>
                          <div className="pl-2 text-[9px] text-text-muted">住宿 ¥{adjH.toLocaleString()} + 餐饮 ¥{adjF.toLocaleString()} + 交通 ¥{adjT.toLocaleString()}</div>
                          <div className="pl-2 text-[9px] text-text-muted">系数来源: 州收入水平 → {COST_LEVEL(costMult)} = {costMult.toFixed(2)}</div>
                          <div className="flex justify-between"><span>医疗保险（固定）</span><span>¥{STANDARD_COSTS[0].amount.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span>往返机票（固定）</span><span>¥{STANDARD_COSTS[1].amount.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span>签证费用（固定）</span><span>¥{STANDARD_COSTS[2].amount.toLocaleString()}</span></div>
                          <div className="flex justify-between border-t border-dotted border-border-soft pt-1 font-medium text-text-secondary">
                            <span>总计</span>
                            <span>{hasCost ? `¥${(total as number).toLocaleString()}` : TUITION_EMPTY_LABEL}</span>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
              {selectedIds.length < 3 && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed border-border-soft bg-surface-1 min-h-[350px] text-text-muted transition hover:border-cobalt/45 hover:bg-cobalt/5 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <Plus size={22} className="mx-auto mb-2 text-text-muted" aria-hidden="true" />
                  <p className="text-caption font-medium">添加大学</p>
                  <p className="mt-1 text-[11px] text-text-muted">还可选择 {3 - selectedIds.length} 所</p>
                </button>
              )}
            </div>

            {/* Comparison bars */}
            {selected.length >= 2 && (
              <div className="mt-6 rounded-card border border-border-soft bg-surface-1 p-5 shadow-sm" data-reveal data-reveal-delay="160">
                <h3 className="mb-4 text-body font-semibold text-text-primary">总费用对比</h3>
                <div className="space-y-3">
                  {selected.map((u, i) => {
                    const total = totalsById.get(u.id) ?? null;
                    if (total === null) {
                      return (
                        <div key={u.id} className="flex items-start justify-between gap-3 rounded-control border border-persimmon/30 bg-persimmon/8 px-3 py-2 text-caption text-persimmon">
                          <span className="font-medium">{u.chineseName}</span>
                          <span className="text-right">该校费用数据未纳入最高费用比较</span>
                        </div>
                      );
                    }
                    const pct = (total / maxTotal) * 100;
                    return (
                      <div key={u.id}>
                        <div className="mb-1 flex items-center justify-between text-caption">
                          <span className="font-medium text-text-secondary">{u.chineseName}</span>
                          <span className="tabular-nums font-medium">¥{total.toLocaleString()}</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={"h-full rounded-full transition-[width] duration-[620ms] ease-out motion-reduce:transition-none " + BAR_COLORS[i % 3]}
                            style={{ width: pct + "%" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex gap-3" data-reveal data-reveal-delay="240">
              <button type="button" onClick={handleCopy} className="inline-flex items-center gap-2 rounded-control border border-border-soft bg-surface-1 px-4 py-2 text-caption font-medium text-text-secondary transition-colors hover:border-cobalt/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                {copied ? <Check size={14} className="text-jade" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                {copied ? "已复制" : "复制结果"}
              </button>
            </div>
          </>
        )}
      </PageStep>
      </PageShell>

      {/* School picker dialog — opens from the empty-state CTA, the
          top-of-page selector, and the dashed-slot CTA on each card
          column. Mobile: full-height sheet; desktop: centered modal. */}
      <SchoolPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        candidates={allUnis as unknown as readonly import("@/domain/dataset").UniversitySummary[]}
        selectedIds={selectedIds}
        max={3}
        title="选择大学计算预算"
        onPick={(id) => addUni(id)}
        storageKey="pathos:calculator:picker:query"
      />
    </>
  );
}

/** Minimum shape the Calculator reads from each row of the summary list. */
type UniversityView = {
  id: string;
  name: string;
  chineseName: string;
  state?: string;
  stateFips?: string;
  city?: string;
  costSummary?: { minimumUsd?: number | null; maximumUsd?: number | null } | null;
};
