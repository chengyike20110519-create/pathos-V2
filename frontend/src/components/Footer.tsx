import NextLink from "next/link";
import type { ComponentProps } from "react";
import { BellRing, Compass, Github, KeyRound, MessageCircle, Receipt } from "lucide-react";
import { getContactChannels } from "@/lib/contact";
import { isInformationPlatformMode } from "@/lib/product-mode";

// Footer links can enter Next's prefetch margin while the map is still
// loading. Keep these secondary routes on demand instead of fetching
// every research/calculator/account bundle alongside the school request.
function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={false} />;
}

export default function Footer() {
  const contact = getContactChannels();
  const informationMode = isInformationPlatformMode();
  return (
    <footer className="border-t border-line/50 bg-ink/95 text-panel/70">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-panel/15 text-panel">
                <Compass size={16} />
              </div>
              <span className="text-base font-bold text-panel">PathOS</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-panel/60">
              面向学生的大学信息研究平台。<br />
              快速读懂学校，看清数据与趋势。
            </p>
            {informationMode ? (
              <Link
                href="/opportunities"
                className="mt-4 inline-flex items-center gap-1.5 rounded-control border border-panel/20 px-3 py-1.5 text-[13px] font-medium text-panel transition hover:border-panel/40 hover:bg-panel/10"
              >
                <BellRing size={14} aria-hidden="true" />
                查看信息动态
              </Link>
            ) : (
              <a
                href="/pricing"
                className="mt-4 inline-flex items-center gap-1.5 rounded-control border border-panel/20 px-3 py-1.5 text-[13px] font-medium text-panel transition hover:border-panel/40 hover:bg-panel/10"
              >
                <Receipt size={14} aria-hidden="true" />
                查看付费方案
              </a>
            )}
          </div>

          {/* Platform */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-panel/85">平台功能</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link href="/map" className="transition-colors hover:text-panel">留学地图</Link>
              <Link href="/trends" className="transition-colors hover:text-panel">趋势台</Link>
              <Link href="/compare" className="transition-colors hover:text-panel">跨校比较</Link>
              <Link href="/calculator" className="transition-colors hover:text-panel">留学计算器</Link>
              <Link href="/match" className="transition-colors hover:text-panel">自主测验</Link>
              <Link href="/assessment" className="transition-colors hover:text-panel">AI 学校评估</Link>
              <Link href="/portfolio" className="transition-colors hover:text-panel">AI 清单分析</Link>
              <Link href="/majors" className="transition-colors hover:text-panel">专业档案</Link>
              <Link href="/deadlines" className="transition-colors hover:text-panel">申请日历</Link>
              <Link href="/costs" className="transition-colors hover:text-panel">成本中心</Link>
              <Link href="/news" className="transition-colors hover:text-panel">留学资讯</Link>
              <Link href="/research" className="transition-colors hover:text-panel">我的研究台</Link>
              <Link href="/s/home" className="transition-colors hover:text-panel">数据工作台</Link>
              <Link href="/followed" className="transition-colors hover:text-panel">我的关注</Link>
            </div>
          </div>

          {/* For business */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-panel/85">
              {informationMode ? "数据与协作" : "企业与顾问"}
            </h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <Link href="/account/api-keys" className="inline-flex items-center gap-1.5 transition-colors hover:text-panel">
                <KeyRound size={12} aria-hidden="true" /> 数据 API 文档
              </Link>
              <Link href="/about" className="transition-colors hover:text-panel">关于 PathOS</Link>
              {informationMode ? (
                <Link
                  href="/pricing"
                  className="text-panel/60 transition-colors hover:text-panel"
                  title="保留的团队协作入口"
                >
                  团队协作
                </Link>
              ) : (
                <>
                  <Link href="/pricing" className="transition-colors hover:text-panel">付费方案</Link>
                  <Link href="/account/subscription" className="transition-colors hover:text-panel">我的订阅</Link>
                </>
              )}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-panel/85">联系与反馈</h3>
            <div className="flex flex-col gap-2 text-sm">
              {contact.wechatId && (
                <span className="inline-flex items-center gap-1.5 text-panel/60">
                  <MessageCircle size={14} aria-hidden="true" />
                  微信 {contact.wechatId}
                </span>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="transition-colors hover:text-panel"
                >
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="transition-colors hover:text-panel">
                  {contact.phone}
                </a>
              )}
              {contact.hours && <span className="text-panel/60">工作时间 {contact.hours}</span>}
              {!contact.hasAnyChannel && (
                <Link href="/pricing" className="transition-colors hover:text-panel">
                  在线提交咨询表单
                </Link>
              )}
              <a
                href="https://github.com/MAGA2010/personal-OS"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-panel/60 transition-colors hover:text-panel"
              >
                <Github size={14} /> GitHub
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-panel/10 pt-6 text-center text-xs text-panel/40">
          PathOS — 面向学生的大学信息研究平台 · 2026
        </div>
      </div>
    </footer>
  );
}
