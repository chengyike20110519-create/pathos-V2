import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCT_MODES,
  isInformationPlatformMode,
  isProductMode,
  resolveProductMode,
} from "@/lib/product-mode";

const ROOT = resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("product mode", () => {
  it("fails closed to information mode by default", () => {
    expect(resolveProductMode({})).toBe("information");
  });

  it("requires an explicit commercial opt-in", () => {
    expect(resolveProductMode({ PATHOS_PRODUCT_MODE: "commercial" })).toBe("commercial");
    expect(resolveProductMode({ PATHOS_PRODUCT_MODE: " COMMERCIAL " })).toBe("commercial");
  });

  it("treats invalid values as information mode", () => {
    expect(resolveProductMode({ PATHOS_PRODUCT_MODE: "sales" })).toBe("information");
    expect(resolveProductMode({ PATHOS_PRODUCT_MODE: "" })).toBe("information");
  });

  it("exposes the only supported modes and helper predicates", () => {
    expect(PRODUCT_MODES).toEqual(["information", "commercial"]);
    expect(isProductMode("information", "information")).toBe(true);
    expect(isProductMode("commercial", "information")).toBe(false);
    expect(isInformationPlatformMode({})).toBe(true);
    expect(isInformationPlatformMode({ PATHOS_PRODUCT_MODE: "commercial" })).toBe(false);
  });

  it("keeps the public footer information-first while retaining the commercial route", () => {
    const footer = read("src/components/Footer.tsx");
    expect(footer).toContain("isInformationPlatformMode()");
    expect(footer).toContain('href="/opportunities"');
    expect(footer).toContain("查看信息动态");
    expect(footer).toContain('href="/pricing"');
    expect(footer).toContain("团队协作");
  });

  it("keeps commercial pages out of the information-mode sitemap", () => {
    const sitemap = read("src/app/sitemap.xml/route.ts");
    expect(sitemap).toContain("isInformationPlatformMode()");
    expect(sitemap).toContain("INFORMATION_PATHS");
    expect(sitemap).toContain("COMMERCIAL_PATHS");
    expect(sitemap).toContain("isInformationPlatformMode()");
  });

  it("exposes the information platform centers in persistent public entry points", () => {
    const footer = read("src/components/Footer.tsx");
    const sitemap = read("src/app/sitemap.xml/route.ts");
    for (const route of ["/majors", "/deadlines", "/costs"]) {
      expect(footer).toContain(`href="${route}"`);
      expect(sitemap).toContain(`"${route}"`);
    }
  });
});
