import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const latestMock = vi.hoisted(() => vi.fn());
const recordMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/information/source-repository", () => ({
  getLatestSourceDocument: latestMock,
  recordSourceDocument: recordMock,
}));

import type { Source, SourceDocument } from "@/domain/information/source";
import { SourceRegistry, type SourceRegistryEntry } from "@/server/information/source-registry";
import { fetchAndRecordSource } from "@/server/information/source-fetch-service";

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
    maxResponseBytes: 1024,
    userAgent: "PathOS-Test/1.0",
    ...extra,
  };
}

function source(): Source {
  return {
    id: "src_1",
    name: "MIT Admissions",
    url: "https://example.edu/admissions",
    authority: "A",
    sourceType: "official_html",
    publisher: "MIT",
    licenseNote: null,
    parserName: "generic",
    rateLimitSeconds: 3600,
    isActive: true,
    robotsReviewStatus: "allowed",
    termsReviewStatus: "allowed",
    fetchEnabled: true,
    timeoutMs: 5000,
    maxResponseBytes: 1024,
    userAgent: "PathOS-Test/1.0",
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
  };
}

function document(extra: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "doc_1",
    sourceId: "src_1",
    url: "https://example.edu/admissions",
    fetchedAt: "2026-10-15T00:00:00.000Z",
    httpStatus: 200,
    contentHash: "hash",
    fetchDurationMs: 10,
    responseBytes: 3,
    fetchStatus: "succeeded",
    errorCode: null,
    errorMessage: null,
    parserMetadata: {},
    fetchOutcome: "unchanged",
    finalUrl: "https://example.edu/admissions",
    redirectCount: 0,
    contentType: "text/html",
    createdAt: "2026-10-15T00:00:00.000Z",
    ...extra,
  };
}

describe("fetchAndRecordSource", () => {
  it("records a successful fetch with changed or unchanged outcome", async () => {
    const contentHash = createHash("sha256").update("abc").digest("hex");
    latestMock.mockResolvedValue(document({ contentHash }));
    recordMock.mockImplementation(async (draft: SourceDocument) => document({
      contentHash: draft.contentHash,
      fetchOutcome: draft.fetchOutcome,
    }));
    const fetchMock = vi.fn(async () => new Response("abc", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));
    const result = await fetchAndRecordSource(source(), new SourceRegistry([entry()]), {
      fetch: fetchMock as never,
      lookup: async () => ["93.184.216.34"],
    });
    expect(result.fetch.fetchOutcome).toBe("unchanged");
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "src_1",
      fetchStatus: "succeeded",
      fetchOutcome: "unchanged",
      contentHash: expect.any(String),
      finalUrl: "https://example.edu/admissions",
      redirectCount: 0,
    }));
  });

  it("records failed fetches without touching the fact repository", async () => {
    latestMock.mockResolvedValue(null);
    recordMock.mockResolvedValue(document({
      fetchStatus: "failed",
      fetchOutcome: "failed",
      contentHash: null,
      httpStatus: 503,
    }));
    const result = await fetchAndRecordSource(source(), new SourceRegistry([entry()]), {
      fetch: vi.fn(async () => new Response("upstream", { status: 503 })) as never,
      lookup: async () => ["93.184.216.34"],
    });
    if (result.fetch.kind !== "failure") throw new Error("expected fetch failure");
    expect(result.fetch.errorCode).toBe("HTTP_ERROR");
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({
      fetchStatus: "failed",
      fetchOutcome: "failed",
      errorCode: "HTTP_ERROR",
      contentHash: null,
    }));
  });
});
