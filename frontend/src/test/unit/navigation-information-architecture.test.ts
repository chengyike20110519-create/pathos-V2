import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("global navigation information architecture", () => {
  it("groups product destinations into the five information domains", () => {
    const navigation = read("src/components/NavBar.tsx");

    expect(navigation).not.toContain("const NAV_LINKS");
    expect(navigation).toContain('id: "discover"');
    expect(navigation).toContain('id: "direction"');
    expect(navigation).toContain('id: "decide"');
    expect(navigation).toContain('id: "plan"');
    expect(navigation).toContain('id: "my-plan"');

    const routes = [...navigation.matchAll(/href: "([^"]+)"/g)].map(([, route]) => route);
    expect(routes).toEqual([
      "/map",
      "/search",
      "/guides",
      "/majors",
      "/topics/cs-engineering",
      "/match",
      "/trends",
      "/compare",
      "/assessment",
      "/portfolio",
      "/costs",
      "/calculator",
      "/deadlines",
      "/news",
      "/research",
      "/followed",
      "/workbench/shortlists",
      "/s/home",
    ]);
  });

  it("keeps the desktop primary level to five disclosure groups", () => {
    const navigation = read("src/components/NavBar.tsx");
    const groupIds = [
      ...navigation.matchAll(/id: "(discover|direction|decide|plan|my-plan)"/g),
    ];

    expect(groupIds).toHaveLength(5);
    expect(navigation).toContain('aria-label="主导航"');
    expect(navigation).toContain("NAV_GROUPS.map");
    expect(navigation).toContain("aria-expanded={isOpen}");
    expect(navigation).toContain("aria-controls={menuId}");
    expect(navigation).not.toContain("NAV_LINKS.map");
  });

  it("keeps mobile drawer grouped, touch-sized, keyboard-dismissable, and state-aware", () => {
    const navigation = read("src/components/NavBar.tsx");

    expect(navigation).toContain('id="mobile-nav-drawer"');
    expect(navigation).toContain("min-h-11");
    expect(navigation).toContain("h-11 w-11");
    expect(navigation.match(/flex min-h-11 items-center/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(navigation).toMatch(/event\.key !== "Escape"/);
    expect(navigation).toContain("mobileButtonRef.current?.focus()");
    expect(navigation).toContain('aria-current={active ? "page" : undefined}');
    expect(navigation).toContain('aria-labelledby={`mobile-nav-${group.id}`}');
  });

  it("uses lucide icons and preserves the global search island", () => {
    const navigation = read("src/components/NavBar.tsx");
    const search = read("src/components/NavSearch.tsx");

    expect(navigation).toContain('} from "lucide-react"');
    expect(navigation).toMatch(/icon: (Map|Search|GraduationCap|GitCompareArrows|CalendarClock|FileStack)/);
    expect(navigation).toContain("<NavSearch />");
    expect(search).toContain('aria-label="搜索学校 / 城市"');
    expect(search).toContain('router.replace(`/search?q=${encodeURIComponent(q)}`)');
    expect(search).toContain("h-11 w-11");
    expect(search).toContain("min-h-11");
  });
});
