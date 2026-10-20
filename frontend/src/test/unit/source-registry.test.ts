import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SourceRegistry,
  assertSourceRegistryEntry,
  canonicalSourceUrl,
  createSourceRegistry,
  type SourceRegistryEntry,
} from "@/server/information/source-registry";

const ROOT = resolve(__dirname, "../../..");

function entry(extra: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry {
  return {
    name: "MIT Admissions",
    url: "https://example.edu/admissions",
    authority: "A",
    sourceType: "official_html",
    robotsReviewStatus: "allowed",
    termsReviewStatus: "allowed",
    fetchEnabled: true,
    timeoutMs: 5000,
    maxResponseBytes: 100000,
    userAgent: "PathOS-Test/1.0",
    ...extra,
  };
}

describe("SourceRegistry", () => {
  it("canonicalizes URLs and rejects credentials or fragments", () => {
    expect(canonicalSourceUrl("HTTPS://Example.edu:443/admissions")).toBe(
      "https://example.edu/admissions",
    );
    expect(() => canonicalSourceUrl("https://user:pass@example.edu")).toThrow(/credentials/);
    expect(() => canonicalSourceUrl("https://example.edu#section")).toThrow(/fragments/);
    expect(() => canonicalSourceUrl("ftp://example.edu/file")).toThrow(/http and https/);
  });

  it("validates runtime guard bounds", () => {
    expect(() => assertSourceRegistryEntry(entry())).not.toThrow();
    expect(() => assertSourceRegistryEntry(entry({ timeoutMs: 10 }))).toThrow(/timeoutMs/);
    expect(() => assertSourceRegistryEntry(entry({ maxResponseBytes: 10 }))).toThrow(/maxResponseBytes/);
    expect(() => assertSourceRegistryEntry(entry({ userAgent: " " }))).toThrow(/userAgent/);
    expect(() => assertSourceRegistryEntry(entry({ authority: "G" as never }))).toThrow(/authority/);
  });

  it("registers each URL once and lists stable copies", () => {
    const registry = createSourceRegistry([entry()]);
    expect(registry.size).toBe(1);
    expect(() => registry.register(entry({ name: "Duplicate" }))).toThrow(/already registered/);
    registry.list()[0].name = "Mutated";
    expect(registry.require("https://example.edu/admissions").name).toBe("MIT Admissions");
  });

  it("blocks unregistered sources before any fetch attempt", () => {
    const registry = new SourceRegistry();
    expect(registry.canFetch("https://unknown.example.edu")).toEqual({
      allowed: false,
      code: "SOURCE_NOT_REGISTERED",
      message: "source is not registered",
    });
  });

  it("requires active, enabled, robots-approved, and terms-approved entries", () => {
    const registry = new SourceRegistry();
    registry.register(entry({ isActive: false }));
    expect(registry.canFetch(entry().url).code).toBe("SOURCE_INACTIVE");

    const disabled = new SourceRegistry();
    disabled.register(entry({ isActive: true, fetchEnabled: false }));
    expect(disabled.canFetch(entry().url).code).toBe("FETCH_DISABLED");

    const robots = new SourceRegistry();
    robots.register(entry({ robotsReviewStatus: "pending" }));
    expect(robots.canFetch(entry().url).code).toBe("ROBOTS_NOT_ALLOWED");

    const terms = new SourceRegistry();
    terms.register(entry({ termsReviewStatus: "disallowed" }));
    expect(terms.canFetch(entry().url).code).toBe("TERMS_NOT_ALLOWED");

    const allowed = new SourceRegistry();
    allowed.register(entry());
    expect(allowed.canFetch(entry().url)).toEqual({ allowed: true });
  });

  it("keeps fetch guards in an idempotent database migration", () => {
    const sql = readFileSync(resolve(ROOT, "db/migrations/009-source-fetch-guards.sql"), "utf8");
    for (const column of [
      "robots_review_status",
      "terms_review_status",
      "fetch_enabled",
      "timeout_ms",
      "max_response_bytes",
      "user_agent",
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
    }
    for (const column of [
      "fetch_outcome",
      "final_url",
      "redirect_count",
      "content_type",
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
    }
    expect(sql).toMatch(/DROP INDEX IF EXISTS uq_source_documents_hash/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_source_documents_hash/);
    expect(sql).toMatch(/IF NOT EXISTS \(/);
    expect(sql).toMatch(/ADD CONSTRAINT chk_source_documents_fetch_outcome/);
    expect(sql).toMatch(/INSERT INTO schema_migrations \(version\) VALUES \('009-source-fetch-guards'\)/);
  });
});
