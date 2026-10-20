"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  CircleDollarSign,
  Database,
  LineChart,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import PageMotion from "@/components/shared/PageMotion";
import { EnterprisePageHeader } from "@/components/shared/EnterprisePageHeader";
import { SchoolPicker } from "@/components/calculator/SchoolPicker";
import { useUniversitySummaries } from "@/hooks/use-data-source";
import { useDataSource } from "@/services/data-source-provider";
import type { CostItemType, CostMoneyRange, CostScenarioRates } from "@/domain/information/cost";

type Scenario = { low: string; central: string; high: string };
type CostResult = {
  entityId: string;
  academicYear: string;
  projection: {
    baseYear: {
      official: { official: CostMoneyRange; assumptions: CostMoneyRange; combined: CostMoneyRange };
      assumptions: { assumptions: CostMoneyRange };
      missingItems: Array<{ type: CostItemType; group: "direct" | "indirect" }>;
      isComplete: boolean;
    };
    assumptions: {
      inflation: { default: { low: number; central: number; high: number } };
      exchangeRate: {
        cnyPerUsd: { low: number; central: number; high: number };
        quotedAt: string;
        sourceName: string;
      };
    };
    assumptionNotes: string[];
    years: Array<{
      academicYear: string;
      range: { usd: CostMoneyRange; cny: CostMoneyRange };
    }>;
    total: { usd: CostMoneyRange; cny: CostMoneyRange };
  };
  officialItems: Array<{ type: CostItemType; amount: number | { min: number; max: number } }>;
  userAssumptionItems: Array<{ type: CostItemType; amount: number | { min: number; max: number } }>;
  ignoredFacts: Array<{ factId: string; fieldKey: string; reason: string }>;
  scholarships: {
    available: boolean | null;
    amount: number | { min: number; max: number } | null;
    facts: Array<{ id: string; fieldKey: string }>;
  };
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: CostResult }
  | { kind: "unavailable"; message: string; code?: string }
  | { kind: "error"; message: string };

const COST_LABELS: Record<CostItemType, string> = {
  tuition: "学费",
  fees: "学杂费",
  housing: "住宿",
  food: "餐饮",
  insurance: "保险",
  books: "书籍材料",
  transportation: "交通",
  personal: "个人支出",
};

const COST_TYPES = Object.keys(COST_LABELS) as CostItemType[];
const DEFAULT_YEAR = "2026-2027";
const DEFAULT_INFLATION: Scenario = { low: "3", central: "5", high: "7" };
const DEFAULT_EXCHANGE: Scenario = { low: "7.1", central: "7.2", high: "7.3" };

function money(range: CostMoneyRange): string {
  const symbol = range.currency === "CNY" ? "¥" : "$";
  return `${symbol}${Math.round(range.min).toLocaleString("zh-CN")} - ${symbol}${Math.round(
    range.max,
  ).toLocaleString("zh-CN")}`;
}

function median(range: CostMoneyRange): string {
  return `${range.currency === "CNY" ? "¥" : "$"}${Math.round(range.median).toLocaleString("zh-CN")}`;
}

function amount(value: number | { min: number; max: number }): string {
  return typeof value === "number"
    ? `$${Math.round(value).toLocaleString("zh-CN")}`
    : `$${Math.round(value.min).toLocaleString("zh-CN")} - $${Math.round(value.max).toLocaleString("zh-CN")}`;
}

function scenarioNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scenarioInput(value: Scenario, label: string): string | CostScenarioRates {
  const low = scenarioNumber(value.low);
  const central = scenarioNumber(value.central);
  const high = scenarioNumber(value.high);
  if (low == null || central == null || high == null) return `${label}必须填写完整数字`;
  if (low > central || central > high) return `${label}需按低 / 中位 / 高排序`;
  return { low, central, high };
}

function Field({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-text-tertiary">{label}</span>
      <span className="mt-1 flex h-control items-center rounded-control border border-border-soft bg-surface-1 px-3 transition focus-within:border-cobalt/60 focus-within:ring-2 focus-within:ring-cobalt/15">
        <input
          type="number"
          min={min}
          step="any"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] tabular-nums text-text-primary outline-none disabled:text-text-muted"
        />
        {suffix ? <span className="ml-2 shrink-0 text-[11px] text-text-muted">{suffix}</span> : null}
      </span>
    </label>
  );
}

function RangeFields({
  title,
  value,
  onChange,
  suffix,
  disabled,
}: {
  title: string;
  value: Scenario;
  onChange: (value: Scenario) => void;
  suffix: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-[11px] font-semibold text-text-secondary">{title}</legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Field label="低" value={value.low} suffix={suffix} disabled={disabled}
          onChange={(next) => onChange({ ...value, low: next })} />
        <Field label="中位" value={value.central} suffix={suffix} disabled={disabled}
          onChange={(next) => onChange({ ...value, central: next })} />
        <Field label="高" value={value.high} suffix={suffix} disabled={disabled}
          onChange={(next) => onChange({ ...value, high: next })} />
      </div>
    </fieldset>
  );
}

function Metric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="border border-border-soft bg-surface-1 p-4" data-reveal>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
        <span className="text-cobalt">{icon}</span>
      </div>
      <p className="mt-2 text-lg font-semibold tabular-nums text-text-primary">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-text-muted">{sub}</p> : null}
    </article>
  );
}

export function CostCenterView() {
  const dataSource = useDataSource();
  const summaries = useUniversitySummaries(dataSource);
  const schools = useMemo(
    () => (summaries.state.status === "ready" ? summaries.state.data : []),
    [summaries.state],
  );
  const [entityId, setEntityId] = useState("");
  const [academicYear, setAcademicYear] = useState(DEFAULT_YEAR);
  const [yearCount, setYearCount] = useState("4");
  const [useDefaults, setUseDefaults] = useState(true);
  const [inflation, setInflation] = useState(DEFAULT_INFLATION);
  const [exchange, setExchange] = useState(DEFAULT_EXCHANGE);
  const [userValues, setUserValues] = useState<Record<CostItemType, string>>(
    () => Object.fromEntries(COST_TYPES.map((type) => [type, ""])) as Record<CostItemType, string>,
  );
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedSchool = schools.find((school) => school.id === entityId);
  const schoolsReady = summaries.state.status === "ready" && schools.length > 0;
  const officialTypes = new Set(
    state.kind === "ready" ? state.result.officialItems.map((item) => item.type) : [],
  );

  const calculate = useCallback(async (nextEntityId?: string) => {
    const universityId = (nextEntityId ?? entityId).trim();
    if (!universityId) {
      setState({ kind: "error", message: "请先选择一所学校。" });
      return;
    }
    const years = Number(yearCount);
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      setState({ kind: "error", message: "预测年限必须是 1 到 10 年。" });
      return;
    }
    let inflationPayload: object | undefined;
    let exchangePayload: object | undefined;
    if (!useDefaults) {
      const parsedInflation = scenarioInput(inflation, "通胀");
      const parsedExchange = scenarioInput(exchange, "汇率");
      if (typeof parsedInflation === "string") {
        setState({
          kind: "error",
          message: parsedInflation,
        });
        return;
      }
      if (typeof parsedExchange === "string") {
        setState({ kind: "error", message: parsedExchange });
        return;
      }
      inflationPayload = parsedInflation;
      exchangePayload = parsedExchange;
    }
    const assumptions = COST_TYPES.flatMap((type) => {
      const parsed = Number(userValues[type]);
      return Number.isFinite(parsed) && parsed >= 0 && userValues[type].trim() !== ""
        ? [{ type, amount: parsed }]
        : [];
    });

    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/information/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          entityId: universityId,
          academicYear,
          yearCount: years,
          useDefaultAssumptions: useDefaults,
          ...(inflationPayload ? { inflationPercent: inflationPayload } : {}),
          ...(exchangePayload ? { exchangeRateCnyPerUsd: exchangePayload } : {}),
          userAssumptions: assumptions,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: CostResult;
        code?: string;
        message?: string;
      };
      if (!response.ok || !body.ok || !body.result) {
        setState({
          kind: response.status >= 500 ? "unavailable" : "error",
          code: body.code,
          message: body.message ?? `请求失败 (${response.status})`,
        });
        return;
      }
      setState({ kind: "ready", result: body.result });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "网络请求失败",
      });
    }
  }, [academicYear, entityId, exchange, inflation, useDefaults, userValues, yearCount]);

  return (
    <PageMotion>
      <main className="min-h-screen bg-[#eef1f5]">
        <EnterprisePageHeader
          eyebrow="Cost Center"
          title="成本与奖学金中心"
          description="官方费用、家庭假设、多年预测和资助信息在同一个预算视图里对齐。"
          icon={CircleDollarSign}
          stats={[
            { label: "当前学校", value: selectedSchool?.nameZh ?? selectedSchool?.name ?? "未选择" },
            { label: "学年起始", value: academicYear },
            { label: "预测年限", value: `${yearCount} 年` },
            {
              label: "官方成本项",
              value: state.kind === "ready" ? `${state.result.officialItems.length} 项` : "待计算",
            },
          ]}
          sourceNote="口径 · 官方 facts 优先 · 家庭假设显式分离 · 缺失项不补造"
        />

        <div className="mx-auto grid max-w-page gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[380px_1fr]">
          <form
            className="lg:sticky lg:top-20 lg:self-start"
            onSubmit={(event) => {
              event.preventDefault();
              void calculate();
            }}
          >
            <section className="border border-border-soft bg-surface-1 p-4" data-reveal>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-text-tertiary">学校</p>
                  <p className="mt-1 truncate text-sm font-semibold text-text-primary">
                    {selectedSchool?.nameZh ?? selectedSchool?.name ?? "未选择"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={!schoolsReady}
                  title={schoolsReady ? "选择学校" : "学校列表加载中"}
                  className="inline-flex h-control shrink-0 items-center gap-1 rounded-control border border-border-soft bg-surface-1 px-3 text-[12px] font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
                >
                  <Plus size={13} aria-hidden="true" /> 选择
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-text-tertiary">学年起始</span>
                  <input
                    value={academicYear}
                    onChange={(event) => setAcademicYear(event.target.value)}
                    className="mt-1 h-control w-full rounded-control border border-border-soft bg-surface-1 px-3 text-[13px] text-text-primary outline-none focus:border-cobalt/60 focus:ring-2 focus:ring-cobalt/15"
                  />
                </label>
                <Field label="预测年限" value={yearCount} suffix="年" min={1}
                  onChange={(value) => setYearCount(value)} />
              </div>

              <label className="mt-4 flex items-center justify-between gap-3 rounded-control border border-border-soft bg-surface-muted/50 px-3 py-2.5">
                <span>
                  <span className="block text-[12px] font-medium text-text-primary">使用默认假设</span>
                  <span className="mt-0.5 block text-[10px] text-text-muted">
                    通胀 3% / 5% / 7%；汇率 7.1 / 7.2 / 7.3
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={useDefaults}
                  onChange={(event) => setUseDefaults(event.target.checked)}
                  className="h-4 w-4 accent-cobalt"
                />
              </label>

              <div className={`mt-4 space-y-4 ${useDefaults ? "opacity-55" : ""}`}>
                <RangeFields title="年通胀率" value={inflation} onChange={setInflation} suffix="%" disabled={useDefaults} />
                <RangeFields title="CNY / USD" value={exchange} onChange={setExchange} suffix="¥" disabled={useDefaults} />
              </div>

              <div className="mt-5">
                <p className="text-[11px] font-semibold text-text-secondary">补充假设值</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {COST_TYPES.map((type) => (
                    <Field
                      key={type}
                      label={COST_LABELS[type]}
                      value={userValues[type]}
                      suffix="USD"
                      disabled={officialTypes.has(type)}
                      onChange={(value) => setUserValues((current) => ({ ...current, [type]: value }))}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={state.kind === "loading"}
                className="mt-5 inline-flex h-control w-full items-center justify-center gap-2 rounded-control bg-cobalt px-4 text-[13px] font-semibold text-paper transition hover:bg-cobalt/90 disabled:opacity-60"
              >
                {state.kind === "loading" ? <Loader2 size={14} className="animate-spin" /> : <LineChart size={14} />}
                {state.kind === "loading" ? "计算中" : "生成预算"}
              </button>
            </section>
          </form>

          <div className="min-w-0 space-y-5">
            {state.kind === "idle" && (
              <section className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-border-soft bg-surface-1/60 p-8 text-center" data-reveal>
                <Database size={24} className="text-text-muted" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-text-secondary">选择学校后生成预算</p>
                <p className="mt-1 text-[12px] text-text-muted">官方事实与家庭假设会分区展示。</p>
              </section>
            )}

            {state.kind === "loading" && (
              <section className="flex min-h-[320px] items-center justify-center border border-border-soft bg-surface-1 p-8">
                <p className="flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" /> 正在计算…
                </p>
              </section>
            )}

            {(state.kind === "error" || state.kind === "unavailable") && (
              <section className="flex min-h-[220px] items-center justify-center border border-persimmon/30 bg-persimmon/8 p-8">
                <p className="flex items-start gap-2 text-sm leading-relaxed text-persimmon">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {state.kind === "unavailable" ? "成本事实层暂不可用：" : ""}
                  {state.message}
                </p>
              </section>
            )}

            {state.kind === "ready" && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="总预算低 / 高" value={money(state.result.projection.total.usd)}
                    sub={`中位 ${median(state.result.projection.total.usd)}`} icon={<CircleDollarSign size={16} />} />
                  <Metric label="人民币区间" value={money(state.result.projection.total.cny)}
                    sub={`中位 ${median(state.result.projection.total.cny)}`} icon={<BadgeDollarSign size={16} />} />
                  <Metric label="官方年度成本" value={money(state.result.projection.baseYear.official.official)}
                    sub={`用户假设 ${money(state.result.projection.baseYear.assumptions.assumptions)}`}
                    icon={<ShieldCheck size={16} />} />
                </div>

                <section className="overflow-hidden border border-border-soft bg-surface-1" data-reveal>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
                    <h2 className="text-sm font-semibold text-text-primary">年度预测</h2>
                    <p className="text-[11px] text-text-muted">{state.result.academicYear} 起</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left">
                      <thead className="bg-surface-muted/60 text-[11px] text-text-tertiary">
                        <tr>
                          <th className="px-4 py-2 font-medium">学年</th>
                          <th className="px-4 py-2 font-medium">USD</th>
                          <th className="px-4 py-2 font-medium">CNY</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft text-[12px] tabular-nums">
                        {state.result.projection.years.map((year) => (
                          <tr key={year.academicYear}>
                            <td className="px-4 py-2.5 text-text-primary">{year.academicYear}</td>
                            <td className="px-4 py-2.5 text-text-secondary">{money(year.range.usd)}</td>
                            <td className="px-4 py-2.5 text-text-secondary">{money(year.range.cny)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="grid gap-3 lg:grid-cols-2">
                  <section className="border border-border-soft bg-surface-1 p-4" data-reveal>
                    <h2 className="text-sm font-semibold text-text-primary">官方成本项</h2>
                    <ul className="mt-3 divide-y divide-border-soft">
                      {state.result.officialItems.map((item) => (
                        <li key={item.type} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                          <span className="text-text-secondary">{COST_LABELS[item.type]}</span>
                          <span className="font-semibold tabular-nums text-text-primary">{amount(item.amount)}</span>
                        </li>
                      ))}
                      {state.result.officialItems.length === 0 && (
                        <li className="py-3 text-[12px] text-text-muted">暂无已审核官方成本项</li>
                      )}
                    </ul>
                  </section>

                  <section className="border border-border-soft bg-surface-1 p-4" data-reveal>
                    <h2 className="text-sm font-semibold text-text-primary">用户假设</h2>
                    <ul className="mt-3 divide-y divide-border-soft">
                      {state.result.userAssumptionItems.map((item) => (
                        <li key={item.type} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                          <span className="text-text-secondary">{COST_LABELS[item.type]}</span>
                          <span className="font-semibold tabular-nums text-text-primary">{amount(item.amount)}</span>
                        </li>
                      ))}
                      {state.result.userAssumptionItems.length === 0 && (
                        <li className="py-3 text-[12px] text-text-muted">无补充假设</li>
                      )}
                    </ul>
                  </section>

                  <section className="border border-border-soft bg-surface-1 p-4" data-reveal>
                    <h2 className="text-sm font-semibold text-text-primary">明确缺失</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {state.result.projection.baseYear.missingItems.length === 0 ? (
                        <span className="rounded-control border border-jade/30 bg-jade/10 px-2.5 py-1 text-[11px] text-jade">完整</span>
                      ) : (
                        state.result.projection.baseYear.missingItems.map((item) => (
                          <span key={item.type} className="rounded-control border border-persimmon/25 bg-persimmon/8 px-2.5 py-1 text-[11px] text-persimmon">
                            {COST_LABELS[item.type]}
                          </span>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="border border-border-soft bg-surface-1 p-4" data-reveal>
                    <h2 className="text-sm font-semibold text-text-primary">奖学金事实</h2>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] text-text-tertiary">可用性</p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {state.result.scholarships.available == null ? "未报告" : state.result.scholarships.available ? "有" : "无"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-text-tertiary">金额</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                          {state.result.scholarships.amount == null ? "未报告" : amount(state.result.scholarships.amount)}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>

                <section className="border border-border-soft bg-surface-1 p-4" data-reveal>
                  <h2 className="text-sm font-semibold text-text-primary">假设与来源</h2>
                  <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-text-secondary">
                    {state.result.projection.assumptionNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      <SchoolPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        candidates={schools as any}
        selectedIds={entityId ? [entityId] : []}
        max={1}
        title="选择大学查看费用"
        onPick={(id) => {
          setEntityId(id);
          setPickerOpen(false);
          void calculate(id);
        }}
        storageKey="pathos:cost-center:picker:query"
      />
    </PageMotion>
  );
}

export default CostCenterView;
