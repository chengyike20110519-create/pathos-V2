import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function walk(relativeDirectory: string): string[] {
  const absoluteDirectory = resolve(ROOT, relativeDirectory);
  return readdirSync(absoluteDirectory).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry}`;
    return statSync(resolve(ROOT, relativePath)).isDirectory()
      ? walk(relativePath)
      : [relativePath];
  });
}

describe("PathOS parallel-development coupling contract", () => {
  it("keeps one canonical navigation and one canonical footer", () => {
    const layout = read("src/app/layout.tsx");
    const home = read("src/app/page.tsx");

    expect((layout.match(/<NavBar\s*\/>/g) ?? [])).toHaveLength(1);
    expect((layout.match(/<Footer\s*\/>/g) ?? [])).toHaveLength(1);
    expect(home).not.toMatch(/<footer\b/i);
    expect(home).not.toContain("NavBar");
  });

  it("uses only canonical, buildable product routes from the integrated home", () => {
    const home = read("src/app/page.tsx");
    const navigation = read("src/components/NavBar.tsx");
    const homeSurface = home + "\n" + navigation;
    const required = [
      "/map",
      "/majors",
      "/costs",
      "/calculator",
      "/deadlines",
      "/news",
      "/compare",
      "/trends",
      "/research",
      "/search",
      "/followed",
      "/workbench/shortlists",
      "/s/home",
    ];

    for (const route of required) {
      expect(homeSurface, route).toContain(`href: \"${route}\"`);
    }
    expect(home).not.toContain("/map/rankings");
    expect(home).not.toContain("/explore");
    expect(home).not.toContain("/interactive-map");
  });

  it("shows the verified Preview boundary instead of candidate mock counts", () => {
    const home = read("src/app/page.tsx");
    const mapShell = read("src/components/map/MapShell.tsx");
    const mapLayout = read("src/app/map/layout.tsx");
    const valueProposition = read("src/components/home/ValuePropositionSection.tsx");

    expect(valueProposition).toContain("全量院校");
    expect(valueProposition).toContain("专业目录");
    expect(valueProposition).toContain("来源可追溯");
    expect(home).toContain("4 项区域指标");
    expect(home).not.toContain("40+");
    expect(home).not.toContain("\"18\"");
    expect(home).not.toContain("6大核心指标");
    expect(home).toContain("Preview");
    expect(home).toContain("不构成录取保证");
    expect(mapLayout).toContain("四项区域指标");
    expect(mapShell).not.toContain("六大指标覆盖全美");
    expect(mapShell).toContain("useUniversitySummaries");
    expect(mapShell).toContain("allUniversities");
    expect(mapShell).toContain("setSelectedRegionFips");
    expect(mapShell).toMatch(/handleStateSelect[\s\S]+?setSelectedRegionFips\(fips\)/);
    expect(mapShell).toMatch(/useSelectedRegionUrl\([\s\S]+?setSelectedStateFips\(next\)/);
    expect(read("src/regional/useSelectedRegionUrl.ts")).toContain("onExternalChange(normalized)");
    expect(read("src/lib/city-utils.ts")).toContain('return "数据补充中"');
    expect(read("src/lib/city-utils.ts")).not.toContain("return `指数 ${Math.round");
    expect(mapShell).toContain("regionalCounters.verifiedCount / REGIONAL_METRIC_IDS.length");
  });

  it("keeps the operational home free of candidate media or mock data", () => {
    const home = read("src/app/page.tsx");
    const modulePath = resolve(ROOT, "src/app/home.module.css");
    expect(existsSync(modulePath)).toBe(true);
    if (!existsSync(modulePath)) return;
    const moduleStyles = read("src/app/home.module.css");

    expect(home).toContain("home-fx.css");
    expect(home).not.toContain("data-integration-source=");
    expect(home).not.toMatch(/src\/data\//);
    expect(home).not.toMatch(/portfolio-robot|harvard-library|mit-dome|stanford-quad/);
    expect(home).not.toMatch(/https?:\/\//);
    expect(moduleStyles).toContain("prefers-reduced-motion: reduce");
    expect(moduleStyles).not.toMatch(/url\(['\"]?https?:\/\//);
  });

  it("retains the canonical Preview BFF and forbids fixture fallback in integration", () => {
    const bff = read("src/app/api/pathos/preview/route.ts");
    const backendLoader = read("src/server/backend-preview.ts");
    const sourceFiles = walk("src").filter(
      (path) => /\.(?:ts|tsx)$/.test(path) && !path.startsWith("src/test/"),
    );
    const integratedSources = sourceFiles.map(read).join("\n");

    expect(bff).toContain("handlePreviewRoute");
    // Since 85385a9 the canonical Preview backend reads immutable artifacts
    // from Postgres. Keep the old filesystem escape hatch out so production
    // cannot silently fall back to unreviewed local fixture files.
    expect(backendLoader).toContain("getPool().query");
    expect(backendLoader).toContain("DatabaseNotConfiguredError");
    expect(backendLoader).not.toContain("readFile");
    expect(backendLoader).not.toContain("PATHOS_PREVIEW_BUNDLE_DIR");
    expect(integratedSources).not.toMatch(/PATHOS_DATA_MODE\s*=\s*[\"']fixture[\"']/);
    expect(integratedSources).not.toContain("candidate-inventory");
  });

  it("does not add a second UI framework or change the canonical dependency surface", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    expect(dependencies).not.toHaveProperty("styled-components");
    expect(dependencies).not.toHaveProperty("@mui/material");
    expect(dependencies).not.toHaveProperty("framer-motion");
    expect(dependencies).not.toHaveProperty("antd");
    expect(dependencies.next).toMatch(/^\^14\.2\./);
  });
});
