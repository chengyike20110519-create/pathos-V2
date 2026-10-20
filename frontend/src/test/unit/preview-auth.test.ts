import { describe, expect, it } from "vitest";
import {
  isPreviewAuthEnabled,
  safePreviewDestination,
} from "@/lib/preview-auth";

describe("fixture-only preview auth", () => {
  it("is enabled only for non-production fixture previews", () => {
    expect(isPreviewAuthEnabled({
      PATHOS_DATA_MODE: "fixture",
      NODE_ENV: "development",
    })).toBe(true);
    expect(isPreviewAuthEnabled({
      PATHOS_DATA_MODE: "backend",
      NODE_ENV: "development",
    })).toBe(false);
    expect(isPreviewAuthEnabled({
      PATHOS_DATA_MODE: "fixture",
      NODE_ENV: "production",
    })).toBe(false);
  });

  it("only allows same-site destination paths", () => {
    expect(safePreviewDestination("/workbench/orgs")).toBe("/workbench/orgs");
    expect(safePreviewDestination(null)).toBe("/s/home");
    expect(safePreviewDestination("/login")).toBe("/s/home");
    expect(safePreviewDestination("//evil.example")).toBe("/s/home");
    expect(safePreviewDestination("https://evil.example")).toBe("/s/home");
  });
});
