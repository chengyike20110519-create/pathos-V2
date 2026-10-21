"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Database,
  FileStack,
  GitCompareArrows,
  GraduationCap,
  Map,
  Menu,
  Newspaper,
  Search,
  Scale,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavSearch } from "@/components/NavSearch";
import { AuthButton } from "@/components/AuthButton";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  links: readonly NavLink[];
};

const NAV_GROUPS = [
  {
    id: "discover",
    label: "找学校",
    icon: Database,
    links: [
      { href: "/map", label: "留学地图", icon: Map },
      { href: "/discover", label: "校园漫游", icon: Compass },
      { href: "/search", label: "全局检索", icon: Search },
      { href: "/guides", label: "大学指南", icon: Newspaper },
    ],
  },
  {
    id: "direction",
    label: "看是否适合",
    icon: GraduationCap,
    links: [
      { href: "/majors", label: "专业库", icon: GraduationCap },
      { href: "/topics/cs-engineering", label: "工程与计算机", icon: FileStack },
      { href: "/match", label: "按我的偏好匹配", icon: ClipboardCheck },
    ],
  },
  {
    id: "decide",
    label: "比较与取舍",
    icon: GitCompareArrows,
    links: [
      { href: "/trends", label: "趋势台", icon: GitCompareArrows },
      { href: "/compare", label: "跨校比较", icon: Scale },
      { href: "/assessment", label: "申请风险体检", icon: ClipboardCheck },
      { href: "/portfolio", label: "组合结构检查", icon: FileStack },
    ],
  },
  {
    id: "plan",
    label: "算成本与时间",
    icon: CalendarClock,
    links: [
      { href: "/costs", label: "费用中心", icon: Wallet },
      { href: "/calculator", label: "预算计算器", icon: Calculator },
      { href: "/deadlines", label: "截止日期", icon: CalendarClock },
      { href: "/news", label: "政策与资讯", icon: Newspaper },
    ],
  },
  {
    id: "my-plan",
    label: "我的计划",
    icon: FileStack,
    links: [
      { href: "/research", label: "我的研究台", icon: FileStack },
      { href: "/followed", label: "关注与动态", icon: Newspaper },
      { href: "/workbench/shortlists", label: "研究集合", icon: FileStack },
      { href: "/s/home", label: "数据工作台", icon: ClipboardCheck },
    ],
  },
] as const satisfies readonly NavGroup[];

function isPathActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const canonicalHref = href.startsWith("/entry/") ? href.slice("/entry".length) : href;
  return (
    pathname === href ||
    pathname.startsWith(href + "/") ||
    pathname === canonicalHref ||
    pathname.startsWith(canonicalHref + "/")
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [homeScrolled, setHomeScrolled] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const mobileButtonRef = useRef<HTMLButtonElement | null>(null);
  const groupButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const groupMenuRefs = useRef<Record<string, HTMLUListElement | null>>({});

  // Escape is the explicit keyboard exit for both navigation disclosures.
  useEffect(() => {
    if (!openGroup) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      groupButtonRefs.current[openGroup]?.focus();
      setOpenGroup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openGroup]);

  // A pointer action outside the active disclosure closes that disclosure.
  useEffect(() => {
    if (!openGroup) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(`[data-nav-group="${openGroup}"]`) === null
      ) {
        setOpenGroup(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openGroup]);

  // Keep the mobile drawer keyboard-dismissable and return focus to its trigger.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileOpen(false);
      mobileButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Route changes always close transient navigation state.
  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  // The home page uses an immersive editorial hero. Its header starts
  // transparent and becomes the StudyUS-style dark solid bar after the
  // first viewport, matching the hero-to-content transition.
  useEffect(() => {
    if (pathname !== "/") {
      setHomeScrolled(false);
      return;
    }
    const onScroll = () => setHomeScrolled(window.scrollY > window.innerHeight * 0.7);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // The opportunity preview page renders its own Apple-style chrome;
  // suppress the global navbar so the two headers do not stack. Keep this
  // return after all hooks so the hook order is identical on every route.
  if (pathname === "/opportunities-preview") return null;

  const groupHasActivePage = (group: NavGroup) =>
    group.links.some((link) => isPathActive(pathname, link.href));
  const isHome = pathname === "/";
  const navSurface = isHome ? (homeScrolled ? "dark" : "hero") : "page";

  return (
    <header
      ref={headerRef}
      role="banner"
      data-nav-surface={navSurface}
      className={
        isHome
          ? "fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,border-color,padding] duration-[400ms] " +
            (homeScrolled
              ? "border-[#eef1f526] bg-[#11151ff2] backdrop-blur-md"
              : "border-transparent bg-transparent")
          : "sticky top-0 z-50 border-b border-border-soft bg-surface-1/95 backdrop-blur supports-[backdrop-filter]:bg-surface-1/80 dark:bg-surface-1/90"
      }
    >
      <div className="mx-auto flex h-nav w-full max-w-page items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link
          href="/"
          aria-label="PathOS 首页"
          className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <div className="grid h-8 w-8 place-items-center rounded-control bg-ink text-paper dark:bg-paper dark:text-ink">
            <Compass size={17} aria-hidden="true" />
          </div>
          <span className="hidden text-[15px] font-semibold tracking-tight text-text-primary sm:inline">
            PathOS
          </span>
        </Link>

        {/* Desktop primary level follows the five information domains. */}
        <nav aria-label="主导航" className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const groupActive = groupHasActivePage(group);
            const isOpen = openGroup === group.id;
            const menuId = `desktop-nav-${group.id}`;
            return (
              <div
                key={group.id}
                className="relative"
                data-nav-group={group.id}
                onMouseEnter={() => setOpenGroup(group.id)}
                onMouseLeave={() => setOpenGroup(null)}
              >
                <button
                  ref={(element) => {
                    groupButtonRefs.current[group.id] = element;
                  }}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={menuId}
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setOpenGroup(group.id);
                      requestAnimationFrame(() => {
                        groupMenuRefs.current[group.id]
                          ?.querySelector("a")
                          ?.focus();
                      });
                    }
                  }}
                  className={
                    "inline-flex h-11 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
                    (groupActive || isOpen
                      ? "bg-ink/8 text-text-primary"
                      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")
                  }
                >
                  <GroupIcon size={15} aria-hidden="true" />
                  {group.label}
                  {groupActive && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-cobalt"
                    />
                  )}
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className={"transition-transform " + (isOpen ? "rotate-180" : "")}
                  />
                </button>
                {isOpen && (
                  <ul
                    id={menuId}
                    ref={(element) => {
                      groupMenuRefs.current[group.id] = element;
                    }}
                    className="absolute left-0 top-[calc(100%+6px)] w-56 overflow-hidden rounded-card border border-border-soft bg-surface-1 p-2 shadow-pop"
                  >
                    {group.links.map((link) => {
                      const LinkIcon = link.icon;
                      const active = isPathActive(pathname, link.href);
                      return (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            aria-current={active ? "page" : undefined}
                            className={
                              "flex min-h-11 items-center gap-2.5 rounded-control px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
                              (active
                                ? "bg-ink/8 text-text-primary"
                                : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")
                            }
                          >
                            <LinkIcon size={15} aria-hidden="true" />
                            {link.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/trends"
            className="hidden h-control-lg items-center gap-1.5 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:inline-flex"
          >
            开始研究
          </Link>
          <Suspense fallback={<div className="h-11 w-11 shrink-0" aria-hidden="true" />}>
            <NavSearch />
          </Suspense>
          <ThemeToggle />
          <AuthButton />
          <button
            ref={mobileButtonRef}
            type="button"
            aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setMobileOpen((value) => !value)}
            className="grid h-11 w-11 place-items-center rounded-control border border-border-soft bg-surface-1 text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring lg:hidden"
          >
            {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-nav-drawer"
          aria-label="主导航（移动端）"
          className="border-t border-border-soft bg-surface-1 px-4 py-4 lg:hidden"
        >
          <div className="flex flex-col gap-4">
            {NAV_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              return (
                <section
                  key={group.id}
                  aria-labelledby={`mobile-nav-${group.id}`}
                  className="flex flex-col gap-2"
                >
                  <h2
                    id={`mobile-nav-${group.id}`}
                    className="flex h-6 items-center gap-2 px-3 text-label text-text-muted"
                  >
                    <GroupIcon size={14} aria-hidden="true" />
                    {group.label}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {group.links.map((link) => {
                      const LinkIcon = link.icon;
                      const active = isPathActive(pathname, link.href);
                      return (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            aria-current={active ? "page" : undefined}
                            className={
                              "flex min-h-11 items-center gap-2.5 rounded-control px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
                              (active
                                ? "bg-ink/8 text-text-primary"
                                : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")
                            }
                          >
                            <LinkIcon size={16} aria-hidden="true" />
                            {link.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            <Link
              href="/search"
              className="flex min-h-11 items-center gap-2.5 rounded-control px-3 text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Search size={16} aria-hidden="true" />
              搜索
            </Link>
            <Link
              href="/search"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control bg-ink px-3 text-[13px] font-semibold text-paper transition hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              开始研究
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
