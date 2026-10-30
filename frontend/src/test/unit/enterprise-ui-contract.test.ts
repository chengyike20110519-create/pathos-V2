import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("enterprise information-platform UI contract", () => {
  it("routes the public product navigation to canonical enterprise surfaces", () => {
    const navigation = read("src/components/NavBar.tsx");
    for (const route of ["/map", "/trends", "/compare", "/workbench/shortlists"]) {
      expect(navigation).toContain(`href: "${route}"`);
    }
    expect(navigation).not.toContain('href: "/entry/map"');
  });

  it("shares one enterprise header across page shells and workbench primitives", () => {
    const header = read("src/components/shared/EnterprisePageHeader.tsx");
    const shell = read("src/components/shared/PageShell.tsx");
    const primitives = read("src/components/v2/V2Primitives.tsx");

    expect(header).toContain("export function EnterprisePageHeader");
    expect(shell).toContain("<EnterprisePageHeader");
    expect(primitives).toContain("<EnterprisePageHeader");
  });

  it("applies the enterprise surface to every PageMotion feature page", () => {
    const globalStyles = read("src/app/globals.css");
    expect(globalStyles).toContain(".page-motion-root");
    expect(globalStyles).toContain("background: #eef1f5");
    expect(globalStyles).toContain(".page-motion-root .rounded-card");
    expect(globalStyles).toContain(".page-motion-root .text-cobalt");
  });

  it("keeps loading, empty, unavailable, and validation states visually unified", () => {
    const states = read("src/components/shared/data-states.tsx");
    expect(states).not.toContain("rounded-lg");
    expect(states.match(/bg-white/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(states).toContain("#bd5a3e45");
  });

  it("connects the core information surfaces to the enterprise header", () => {
    for (const path of [
      "src/components/search/GlobalSearchView.tsx",
      "src/components/information/CostCenterView.tsx",
      "src/components/compare/ComparisonMatrix.tsx",
      "src/app/deadlines/page.tsx",
      "src/components/university/UniversityDetailView.tsx",
      "src/app/news/page.tsx",
      "src/app/guides/page.tsx",
      "src/app/workbench/shortlists/page.tsx",
      "src/app/workbench/orgs/page.tsx",
    ]) {
      expect(read(path), path).toContain("EnterprisePageHeader");
    }
  });

  it("completes functional gaps without weakening data boundaries", () => {
    const search = read("src/components/search/GlobalSearchView.tsx");
    const universityRoute = read("src/app/university/[id]/page.tsx");
    const news = read("src/app/news/page.tsx");

    expect(search).toContain("pathos:saved-searches");
    expect(search).toContain("保存搜索");
    expect(universityRoute).toContain("const { id } = await params");
    expect(universityRoute).toContain("<UniversityDetailView id={id} />");
    expect(news).toContain("function isUnitedStatesArticle");
    expect(news).not.toContain("来自 QS 与启德教育的整理");
  });

  it("connects school discovery to the server-backed shortlist workflow", () => {
    const university = read("src/components/university/UniversityDetailView.tsx");
    const addToShortlist = read("src/components/shortlists/AddToShortlist.tsx");
    const followed = read("src/app/followed/page.tsx");
    const compareStore = read("src/state/compare-store.ts");

    expect(university).toContain("<AddToShortlist");
    expect(addToShortlist).toContain('fetch("/api/shortlists"');
    expect(addToShortlist).toContain("/api/shortlists/${encodeURIComponent(targetId)}/items");
    for (const code of ["UNAUTHENTICATED", "DATABASE_NOT_CONFIGURED", "DUPLICATE_ITEM", "UNKNOWN_UNIVERSITY"]) {
      expect(addToShortlist).toContain(code);
    }
    expect(followed).toContain("EnterprisePageHeader");
    expect(followed).toContain("addFollowedToCompare");
    expect(compareStore).toContain("const MAX_ITEMS = 4;");
  });
});
