import type { Metadata } from "next";
import Link from "next/link";
import { Code2, Construction, KeyRound, ShieldCheck } from "lucide-react";
import { getCommercialCapabilities } from "@/lib/contact";

export const metadata: Metadata = {
  title: "数据 API 文档",
  description: "PathOS 数据 API（v1，内测）鉴权、速率限制、字段说明与示例代码。",
};

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/universities",
    desc: "获取学校列表（分页、按 state / tier 过滤）。",
    example: `curl https://personal-os-zu9q.onrender.com/api/v1/universities \\
  -H "Authorization: Bearer pk_xxx" \\
  -G --data-urlencode "state=CA" --data-urlencode "limit=20"`,
    response: `{
  "ok": true,
  "data": {
    "universities": [{ "id": "candidate-v2:stanford-university", "name": "Stanford University", ... }],
    "pagination": { "limit": 20, "nextCursor": null, "hasMore": false },
    "rateLimit": { "remaining": 59, "perMinute": 60 },
    "quota":     { "used": 12, "limit": 10000 }
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/universities/[id]",
    desc: "获取单个学校的精简字段 + 详情 JSONB。",
    example: `curl https://personal-os-zu9q.onrender.com/api/v1/universities/candidate-v2%3Astanford-university \\
  -H "Authorization: Bearer pk_xxx"`,
    response: `{
  "ok": true,
  "data": {
    "id": "candidate-v2:stanford-university",
    "name": "Stanford University",
    "chineseName": "斯坦福大学",
    "state": "CA",
    "nationalRanking": 3,
    "latitude": 37.4275,
    "longitude": -122.1697,
    "detail": { ... 详情 JSONB ... }
  }
}`,
  },
];

const SCOPES = [
  { id: "universities.read", desc: "读取学校列表与详情（默认，已上线）", planned: false },
  { id: "reports.write", desc: "通过 API 生成 AI 解读报告", planned: true },
  { id: "*", desc: "所有权限，仅供内部测试使用", planned: false },
];

export default function AccountApiKeysPage() {
  const capabilities = getCommercialCapabilities();
  return (
    <main className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">数据 API 文档</h1>
        <p className="mt-2 max-w-2xl text-base text-text-secondary">
          PathOS 数据 API（v1）目前处于内测阶段，面向留学机构、国际学校、教辅平台定向开放。
          基于学校基础字段与 IPEDS 评级详情，提供 JSON 只读接口、Bearer 鉴权与速率限制。
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-300">
          <Construction size={14} aria-hidden="true" />
          内测中：接口与字段可能调整，变更会提前通知已开通的机构。
        </p>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-border-soft bg-surface-1 p-5">
          <KeyRound size={20} className="text-cobalt" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-text-primary">Bearer Token 鉴权</h2>
          <p className="mt-2 text-sm text-text-secondary">
            每个请求需要 <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">Authorization: Bearer pk_xxx</code> 或
            <code className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">X-Api-Key: pk_xxx</code>。
          </p>
        </article>
        <article className="rounded-2xl border border-border-soft bg-surface-1 p-5">
          <ShieldCheck size={20} className="text-cobalt" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-text-primary">速率限制 + 配额</h2>
          <p className="mt-2 text-sm text-text-secondary">
            每个 key 单独配置每分钟调用数与每月配额，默认每分钟 60 次、每月 10000 次。
            超出后返回 429 并附带
            <code className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">Retry-After</code> 头。
          </p>
        </article>
        <article className="rounded-2xl border border-border-soft bg-surface-1 p-5">
          <Construction size={20} className="text-text-tertiary" aria-hidden="true" />
          <h2 className="mt-3 flex items-center gap-2 text-base font-semibold text-text-primary">
            变更通知
            {!capabilities.webhooks && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                规划中
              </span>
            )}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {capabilities.webhooks
              ? "数据集更新后通过 Webhook 推送到已配置的回调地址。"
              : "Webhook 与 Slack / 飞书 / 邮件通知尚未上线。内测期间数据集更新由我们直接通知对接人，接口侧可通过响应中的更新时间字段判断。"}
          </p>
        </article>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-text-primary">端点</h2>
        <div className="mt-4 space-y-4">
          {ENDPOINTS.map((endpoint) => (
            <article key={endpoint.path} className="rounded-3xl border border-border-soft bg-surface-1 p-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 items-center rounded-full bg-emerald-500/10 px-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  {endpoint.method}
                </span>
                <code className="font-mono text-sm text-text-primary">{endpoint.path}</code>
              </div>
              <p className="mt-3 text-sm text-text-secondary">{endpoint.desc}</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-border-soft bg-surface-2/70">
                  <div className="flex items-center gap-1.5 border-b border-border-soft bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                    <Code2 size={12} aria-hidden="true" /> 请求示例
                  </div>
                  <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-text-primary"><code>{endpoint.example}</code></pre>
                </div>
                <div className="rounded-2xl border border-border-soft bg-surface-2/70">
                  <div className="flex items-center gap-1.5 border-b border-border-soft bg-surface-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                    <Code2 size={12} aria-hidden="true" /> 响应示例
                  </div>
                  <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-text-primary"><code>{endpoint.response}</code></pre>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-text-primary">权限（scope）</h2>
        <ul className="mt-3 space-y-2">
          {SCOPES.map((scope) => (
            <li key={scope.id} className="flex items-start gap-3 rounded-control border border-border-soft bg-surface-1 px-3 py-2 text-sm">
              <code className="shrink-0 font-mono text-[12px] text-cobalt">{scope.id}</code>
              <span className="text-text-secondary">{scope.desc}</span>
              {scope.planned && (
                <span className="ml-auto shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  规划中
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <aside className="mt-12 rounded-3xl border border-border-soft bg-surface-1 p-6">
        <h2 className="text-base font-semibold text-text-primary">申请 API Key</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {capabilities.selfServeApiKeys
            ? "可在账号内自助创建与轮换 key。"
            : "内测期间 key 由我们手动开通，暂不支持自助创建与轮换；每家机构先开通 1 个 key。"}
          {" 如需申请，前往"}
          <Link href="/pricing" className="mx-1 underline decoration-text-tertiary underline-offset-2 hover:text-text-primary">/pricing</Link>
          选择「数据 API（内测）」并留下联系方式，我们会与您确认用量后开通。
        </p>
      </aside>
    </main>
  );
}
