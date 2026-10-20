"use client";

import Link from "next/link";
import {
  BookOpenCheck,
  CalendarClock,
  CircleDollarSign,
  GraduationCap,
  LineChart,
  MapPin,
  Percent,
  Scale,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PreviewField, UniversityDetail } from "@/domain/dataset";

type MetricTone = "neutral" | "positive" | "warning" | "missing";

interface QuickMetric {
  id: string;
  label: string;
  value: string;
  meta: string;
  source: string;
  tone: MetricTone;
  icon: LucideIcon;
  href?: string;
}

function displayName(detail: UniversityDetail) {
  return detail.nameZh || detail.chineseName || detail.name;
}

function formatRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}

function formatCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= 10000
    ? `$${Math.round(value / 1000)}k`
    : `$${new Intl.NumberFormat("zh-CN").format(value)}`;
}

function fieldMeta(field: PreviewField<unknown> | undefined, fallback?: string) {
  if (!field) return fallback ?? "口径未标注";
  return [
    field.referenceYear ? String(field.referenceYear) : null,
    field.scope ?? null,
    field.unit ?? null,
  ]
    .filter(Boolean)
    .join(" · ") || (fallback ?? "口径未标注");
}

function fieldSource(field: PreviewField<unknown> | undefined, fallback = "Preview") {
  if (!field) return fallback;
  const count = field.sourceIds.length;
  return count > 0 ? `${field.status} / ${count} 来源` : `${field.status} / 来源待挂接`;
}

function missingReason(field: PreviewField<unknown> | undefined) {
  return field?.nullReason ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreRange(value: unknown, key: string): [number, number] | null {
  const range = asRecord(asRecord(value)?.[key]);
  const low = finite(range?.percentile_25);
  const high = finite(range?.percentile_75);
  return low !== null && high !== null ? [low, high] : null;
}

function formatSat(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const math = scoreRange(record, "math");
  const reading = scoreRange(record, "reading_writing");
  if (!math || !reading) return null;
  return `${math[0] + reading[0]}-${math[1] + reading[1]}`;
}

const POLICY_LABELS: Record<string, string> = {
  required: "必须提交",
  test_required: "必须提交",
  optional: "可选提交",
  test_optional: "可选提交",
  blind: "不审阅标化",
  test_blind: "不审阅标化",
  flexible: "灵活提交",
  test_flexible: "灵活提交",
};

function formatPolicy(value: unknown) {
  if (typeof value === "string" && value.trim()) return POLICY_LABELS[value] ?? value;
  const record = asRecord(value);
  const raw = [record?.policyStatus, record?.policy_status, record?.label, record?.displayLabel]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0);
  return raw ? POLICY_LABELS[raw] ?? raw : null;
}

function metricTone(available: boolean, warning = false): MetricTone {
  if (!available) return "missing";
  return warning ? "warning" : "neutral";
}

const TONE_CLASS: Record<MetricTone, string> = {
  neutral: "border-border-soft bg-surface-1",
  positive: "border-jade/30 bg-jade/6",
  warning: "border-persimmon/30 bg-persimmon/6",
  missing: "border-dashed border-border-soft bg-surface-muted/45",
};

function buildMetrics(detail: UniversityDetail): QuickMetric[] {
  const metadata = detail.previewMetadata;
  const official = detail.officialResearch;
  const rank = detail.rankingSummary?.nationalRank ?? detail.nationalRanking ?? null;
  const acceptance = metadata?.admissions?.acceptanceRate;
  const acceptanceValue = acceptance?.value ?? detail.acceptanceRate ?? official?.acceptanceRate ?? null;
  const enrollment = metadata?.enrollment;
  const enrollmentValue =
    enrollment?.total?.value ?? detail.enrollmentSummary?.total ?? enrollment?.undergraduate?.value ?? detail.enrollmentSummary?.undergraduate ?? official?.undergraduateEnrollment ?? null;
  const costRecord = detail.cost.find((item) => item.components.tuition) ?? detail.cost[0];
  const sat = metadata?.admissions?.sat;
  const satValue = formatSat(sat?.value) ?? (official && official.satReading25 !== null && official.satReading75 !== null && official.satMath25 !== null && official.satMath75 !== null
    ? `${official.satReading25 + official.satMath25}-${official.satReading75 + official.satMath75}` : null);
  const graduation = metadata?.admissions?.graduationRate;
  const graduationValue = graduation?.value ?? detail.graduationRate ?? null;
  const testPolicy = metadata?.admissions?.testPolicy;
  const policyValue = formatPolicy(testPolicy?.value);
  const ratio = detail.studentFacultyRatio;
  const costComparisonUnsafe = detail.costSummary?.comparisonSafe === false;
  const officialTuition = official?.tuitionOutOfState ?? official?.tuitionInState;
  const costValue = [
    detail.costSummary?.displayLabel,
    costRecord ? `${(costRecord.amount / 10000).toFixed(1)}万${costRecord.currency}` : null,
    !costRecord && typeof officialTuition === "number" ? `约 $${new Intl.NumberFormat("en-US").format(officialTuition)}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    {
      id: "ranking",
      label: "全国排名",
      value: typeof rank === "number" ? `#${rank}` : "未发布",
      meta: detail.rankingYear ? `${detail.rankingYear} 年榜单` : "榜单年份未标注",
      source: detail.ranking[0]?.sourceUrl ? "Ranking / 官方链接" : "Ranking / 来源待挂接",
      tone: metricTone(typeof rank === "number"),
      icon: LineChart,
    },
    {
      id: "acceptance-rate",
      label: "录取率",
      value: formatRate(acceptanceValue) ?? missingReason(acceptance) ?? "未报告",
      meta: fieldMeta(acceptance, "申请人范围未标注"),
      source: official?.acceptanceRate === acceptanceValue && !acceptance ? "College Scorecard / 美国教育部" : fieldSource(acceptance),
      tone: metricTone(formatRate(acceptanceValue) !== null),
      icon: Percent,
    },
    {
      id: "enrollment",
      label: "在校规模",
      value: formatCount(enrollmentValue) ?? missingReason(enrollment?.total) ?? "未报告",
      meta: fieldMeta(enrollment?.total ?? enrollment?.undergraduate, "学生范围未标注"),
      source: official?.undergraduateEnrollment === enrollmentValue && !enrollment ? "College Scorecard / 美国教育部" : fieldSource(enrollment?.total ?? enrollment?.undergraduate),
      tone: metricTone(formatCount(enrollmentValue) !== null),
      icon: Users,
    },
    {
      id: "cost",
      label: "学费 / 费用",
      value: costValue || "未报告",
      meta: [
        costRecord ? `${costRecord.year} · ${costRecord.components.tuition ? "学费" : "综合费用"} · ${costRecord.scope}` : null,
        costComparisonUnsafe ? "跨校不可直接比较" : null,
      ].filter(Boolean).join(" · ") || "费用口径未标注",
      source: [
        costRecord?.sourceUrl ? "Cost / 官方链接" : "Cost / 来源待挂接",
        costComparisonUnsafe ? "口径未对齐" : null,
      ].filter(Boolean).join(" · "),
      tone: metricTone(Boolean(costValue), costComparisonUnsafe),
      icon: CircleDollarSign,
      href: "/costs",
    },
    {
      id: "sat",
      label: "SAT 区间",
      value: satValue ?? missingReason(sat) ?? "未报告",
      meta: fieldMeta(sat, "SAT 25-75 分位"),
      source: satValue && !sat ? "College Scorecard / 美国教育部" : fieldSource(sat),
      tone: metricTone(satValue !== null),
      icon: BookOpenCheck,
    },
    {
      id: "ratio",
      label: "师生比",
      value: typeof ratio === "number" ? `1 : ${ratio}` : "未报告",
      meta: "统计口径以学校申报为准",
      source: "Profile / 来源待挂接",
      tone: metricTone(typeof ratio === "number"),
      icon: GraduationCap,
    },
    {
      id: "graduation",
      label: "毕业率",
      value: formatRate(graduationValue) ?? missingReason(graduation) ?? "未报告",
      meta: fieldMeta(graduation, "毕业口径未标注"),
      source: fieldSource(graduation),
      tone: metricTone(formatRate(graduationValue) !== null),
      icon: CalendarClock,
    },
    {
      id: "test-policy",
      label: "标化政策",
      value: policyValue ?? missingReason(testPolicy) ?? "未报告",
      meta: fieldMeta(testPolicy, "适用年级未标注"),
      source: fieldSource(testPolicy),
      tone: metricTone(policyValue !== null),
      icon: Scale,
    },
  ];
}

function Sparkline({ detail }: { detail: UniversityDetail }) {
  const metric = detail.timeSeries?.some((point) => typeof point.acceptanceRate === "number")
    ? "acceptanceRate"
    : "tuitionUSD";
  const points = [...(detail.timeSeries ?? [])]
    .sort((a, b) => a.semester.localeCompare(b.semester))
    .map((point) => ({
      semester: point.semester,
      value: point[metric],
      source: point.source,
    }));
  const numeric = points.flatMap((point) =>
    typeof point.value === "number" && Number.isFinite(point.value) ? [{ ...point }] : [],
  );

  if (numeric.length === 0) {
    return (
      <div className="rounded-control border border-dashed border-border-soft bg-surface-muted/40 px-3 py-4 text-caption text-text-muted">
        该校暂未发布已核验时序数据。费用、录取和排名仍可在档案与比较中核查，缺失不会被补点。
      </div>
    );
  }

  const numericValues = numeric
    .map((point) => point.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const max = Math.max(...numericValues);
  const min = Math.min(...numericValues, 0);
  const range = max - min || 1;
  const geometry = points.map((point, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = typeof point.value === "number" ? 38 - ((point.value - min) / range) * 34 : null;
    return { x, y, semester: point.semester };
  });
  const segments: string[] = [];
  let current: string[] = [];
  geometry.forEach((point) => {
    if (point.y === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${point.x},${point.y}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-semibold text-text-primary">
          {metric === "acceptanceRate" ? "录取率趋势" : "学费趋势"}
        </p>
        <Link
          href={`/trends?ids=${encodeURIComponent(detail.id)}`}
          className="inline-flex min-h-control items-center gap-1 text-[11px] font-medium text-cobalt hover:underline"
        >
          打开趋势台
          <LineChart size={12} aria-hidden="true" />
        </Link>
      </div>
      <svg
        viewBox="0 0 100 40"
        className="mt-2 h-20 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${displayName(detail)}${metric === "acceptanceRate" ? "录取率" : "学费"}序列`}
      >
        <path d="M0 38H100" stroke="currentColor" className="text-border-soft" strokeWidth=".4" />
        {segments.map((points, index) => (
          <polyline
            key={index}
            points={points}
            fill="none"
            stroke="currentColor"
            className="text-cobalt"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {geometry.map((point) =>
          point.y === null ? null : (
            <circle
              key={point.semester}
              cx={point.x}
              cy={point.y}
              r="1.4"
              className="fill-surface-1 stroke-cobalt"
              strokeWidth=".6"
            />
          ),
        )}
      </svg>
      <p className="mt-1 text-[10px] text-text-muted">
        {numeric[0].semester} - {numeric[numeric.length - 1].semester} · {numeric.length} 个真实数据点 · 来源 {numeric[0].source}
      </p>
    </div>
  );
}

export function SchoolQuickRead({ detail }: { detail: UniversityDetail }) {
  const metrics = buildMetrics(detail);
  const available = metrics.filter((metric) => metric.value !== "未报告" && metric.value !== "未发布").length;
  const coverage = Math.round((available / metrics.length) * 100);

  return (
    <section
      aria-labelledby="school-quick-read"
      className="mt-4 rounded-card border border-border-soft bg-surface-2 p-4 shadow-pop sm:p-5"
      data-reveal="true"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label uppercase text-cobalt">Quick Read</p>
          <h2 id="school-quick-read" className="mt-1 text-section text-text-primary">
            3 分钟学校速览
          </h2>
          <p className="mt-1 text-caption text-text-secondary">
            先看关键事实、口径与缺口；不做录取判断，也不把 Preview 数据包装成已审核事实。
          </p>
        </div>
        <div className="text-right">
          <p className="text-label uppercase text-text-muted">核心字段覆盖</p>
          <p className="text-display tabular-nums text-text-primary">{coverage}%</p>
          <p className="text-[10px] text-text-muted">{available}/{metrics.length} 个字段有值</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-12">
        <aside className="rounded-card bg-ink p-4 text-panel lg:col-span-4">
          <p className="text-label uppercase text-panel/50">School Identity</p>
          <h3 className="mt-2 text-lg leading-tight font-semibold">{displayName(detail)}</h3>
          <p lang="en" className="mt-1 text-caption text-panel/72">{detail.name}</p>
          <p className="mt-3 flex items-start gap-1.5 text-caption text-panel/78">
            <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[#dd8568]" />
            {[detail.city, detail.state, detail.country].filter(Boolean).join(", ") || "地点待核验"}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-caption">
            <div>
              <dt className="text-panel/50">数据层</dt>
              <dd className="mt-0.5 font-medium">{detail.previewOnly ? "Preview" : "Production"}</dd>
            </div>
            <div>
              <dt className="text-panel/50">数据集</dt>
              <dd className="mt-0.5 truncate font-mono" title={detail.datasetVersion}>{detail.datasetVersion}</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-panel/12 pt-3">
            <Sparkline detail={detail} />
          </div>
        </aside>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:col-span-8">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            const content = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-label uppercase text-text-muted">{metric.label}</p>
                    <p
                      className={`mt-1.5 text-lg leading-tight font-semibold tabular-nums ${
                        metric.tone === "missing" ? "text-text-muted" : "text-text-primary"
                      }`}
                    >
                      {metric.value}
                    </p>
                  </div>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-ink/6 text-ink/64">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 truncate text-[10px] text-text-muted" title={metric.meta}>{metric.meta}</p>
                <p className="mt-1 truncate text-[10px] font-medium text-cobalt" title={metric.source}>{metric.source}</p>
              </>
            );
            const className = `page-motion-card flex h-full min-h-[136px] flex-col justify-between rounded-card border p-3 ${TONE_CLASS[metric.tone]}`;
            return metric.href ? (
              <Link key={metric.id} href={metric.href} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`} data-reveal="true" data-reveal-delay={(index % 4) * 80}>
                {content}
              </Link>
            ) : (
              <article key={metric.id} className={className} data-reveal="true" data-reveal-delay={(index % 4) * 80}>
                {content}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default SchoolQuickRead;
