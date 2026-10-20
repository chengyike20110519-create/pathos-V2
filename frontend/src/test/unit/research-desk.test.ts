import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("research desk", () => {
  it("organizes student work around research questions instead of application management", () => {
    const component = read("src/components/research/ResearchDeskView.tsx");
    const route = read("src/app/research/page.tsx");

    expect(component).toContain("const STORAGE_KEY = \"pathos:research-projects\"");
    expect(component).toContain("新建研究问题");
    expect(component).toContain("证据笔记");
    expect(component).toContain("相关资讯候选");
    expect(component).toContain("学校是这个研究问题的证据样本，不是决策清单");
    expect(component).toContain("V1 研究问题与证据保存在本机浏览器");
    expect(component).not.toContain("冲刺");
    expect(component).not.toContain("保底");
    expect(route).toContain('title: "我的研究台"');
  });

  it("connects research assets to comparison and trend analysis without replacing the legacy desk", () => {
    const component = read("src/components/research/ResearchDeskView.tsx");
    const nav = read("src/components/NavBar.tsx");
    const home = read("src/app/page.tsx");

    expect(component).toContain("compare.replaceIds");
    expect(component).toContain("/trends?ids=");
    expect(component).toContain("pathos_followed_universities");
    expect(component).toContain("pathos:saved-searches");
    expect(component).toContain("/api/shortlists");
    expect(component).toContain('href="/s/home"');
    expect(nav).toContain('href: "/research"');
    expect(home).toContain('href: "/research"');
  });
});
