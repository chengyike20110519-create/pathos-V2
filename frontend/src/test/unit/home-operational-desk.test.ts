import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("home operational information desk", () => {
  it("prioritizes the five-domain research chain over a feature exhibition", () => {
    const home = read("src/app/page.tsx");
    expect(home).toContain("PILLARS.map");
    expect(home).toContain("学校速览");
    expect(home).toContain("信息核查");
    expect(home).toContain("横向比较");
    expect(home).toContain("趋势分析");
    expect(home).toContain("我的研究");
    expect(home).toContain("JOURNEY.map");
    expect(home).toContain("TRUSTED_SOURCES.join");
    expect(home).toContain("Content Pillars");
    expect(home).toContain("START HERE");
    expect(home).not.toContain("决策工作台");
    expect(home).not.toContain("FlipModuleCard");
    expect(home).not.toContain("ChapterNav");
    expect(home).not.toContain("HeroTilt");
  });

  it("keeps data transparency modules on the first information platform surface", () => {
    const home = read("src/app/page.tsx");
    expect(home).toContain("DataCoverageDashboard");
    expect(home).toContain("LatestUpdatesSection");
    expect(home).toContain("FeaturedSchoolsSection");
    expect(home).toContain("Preview 数据只展示已收录与已验证内容");
  });

  it("keeps motion meaningful and reduced-motion safe", () => {
    const home = read("src/app/page.tsx");
    const fx = read("src/app/home-fx.css");
    const editorialFx = read("src/app/home-editorial.module.css");
    expect(home).toContain("HomeScrollFx");
    expect(home).toContain("data-back-to-top");
    expect(home).toContain('data-hero-earth="true"');
    expect(home).toContain("heroTitleLine");
    expect(home).toContain('data-heading-stagger="true"');
    expect(fx).toContain("min-height: 44px");
    expect(editorialFx).toContain("@keyframes hero-media-pan");
    expect(editorialFx).toContain("@keyframes hero-line-rise");
    expect(editorialFx).toContain("@keyframes line-draw");
    expect(editorialFx).toContain("@keyframes scroll-cue-pulse");
    expect(editorialFx).toContain("prefers-reduced-motion: reduce");
    expect(fx).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
