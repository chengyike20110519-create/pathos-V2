import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SourceRegistry, type SourceRegistryEntry } from "@/server/information/source-registry";
import {
  assertSourceFetchUrl,
  fetchRegisteredSource,
} from "@/server/information/source-fetcher";

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

function registry(extra: Partial<SourceRegistryEntry> = {}): SourceRegistry {
  return new SourceRegistry([entry(extra)]);
}

function lookup(addresses: string[]) {
  return vi.fn(async () => addresses);
}

function response(body: BodyInit, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

describe("source URL guard", () => {
  it("rejects private, loopback, reserved, credentialed, and odd-port URLs", () => {
    expect(() => assertSourceFetchUrl("https://127.0.0.1/admissions")).toThrow(/private/);
    expect(() => assertSourceFetchUrl("http://10.1.2.3/admissions")).toThrow(/private/);
    expect(() => assertSourceFetchUrl("http://[::1]/admissions")).toThrow(/private/);
    expect(() => assertSourceFetchUrl("https://intranet.internal/admissions")).toThrow(/private/);
    expect(() => assertSourceFetchUrl("https://user:pass@example.edu")).toThrow(/credentials/);
    expect(() => assertSourceFetchUrl("https://example.edu:8443/admissions")).toThrow(/ports/);
    expect(assertSourceFetchUrl("https://example.edu/admissions").toString()).toBe(
      "https://example.edu/admissions",
    );
  });
});

describe("fetchRegisteredSource", () => {
  it("returns a blocked result without calling fetch for an unregistered source", async () => {
    const fetchMock = vi.fn();
    const result = await fetchRegisteredSource(
      new SourceRegistry(),
      "https://unknown.example.edu",
      {},
      { fetch: fetchMock, lookup: lookup(["93.184.216.34"]) },
    );
    expect(result).toMatchObject({
      kind: "failure",
      fetchStatus: "blocked",
      fetchOutcome: "blocked",
      errorCode: "ACCESS_DENIED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns blocked when DNS resolves to a private address", async () => {
    const fetchMock = vi.fn();
    const result = await fetchRegisteredSource(
      registry(),
      "https://example.edu/admissions",
      {},
      { fetch: fetchMock, lookup: lookup(["192.168.1.10"]) },
    );
    expect(result).toMatchObject({
      kind: "failure",
      fetchStatus: "blocked",
      errorCode: "PRIVATE_ADDRESS",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches successfully, hashes content, and detects an unchanged document", async () => {
    const body = "admissions data";
    const hash = createHash("sha256").update(body).digest("hex");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      response(body, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }).clone(),
    );
    const deps = { fetch: fetchMock as never, lookup: lookup(["93.184.216.34"]) };
    const changed = await fetchRegisteredSource(registry(), entry().url, {}, deps);
    expect(changed).toMatchObject({
      kind: "success",
      fetchStatus: "succeeded",
      fetchOutcome: "changed",
      httpStatus: 200,
      contentHash: hash,
      responseBytes: body.length,
    });
    expect(Buffer.from((changed as { content: Uint8Array }).content).toString()).toBe(body);

    const unchanged = await fetchRegisteredSource(
      registry(),
      entry().url,
      { previousContentHash: hash },
      deps,
    );
    expect(unchanged).toMatchObject({ kind: "success", fetchOutcome: "unchanged" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe("manual");
  });

  it("validates every redirect hop and records the final URL", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example.edu/admissions") {
        return response("", { status: 302, headers: { location: "/final" } });
      }
      return response("final", { status: 200, headers: { "content-type": "text/html" } });
    });
    const result = await fetchRegisteredSource(
      registry(),
      entry().url,
      {},
      { fetch: fetchMock as never, lookup: lookup(["93.184.216.34"]) },
    );
    expect(result).toMatchObject({
      kind: "success",
      finalUrl: "https://example.edu/final",
      redirectCount: 1,
      responseBytes: 5,
    });
  });

  it("blocks a redirect into a private network", async () => {
    const fetchMock = vi.fn(async () =>
      response("", { status: 301, headers: { location: "http://127.0.0.1/admin" } }),
    );
    const result = await fetchRegisteredSource(
      registry(),
      entry().url,
      {},
      { fetch: fetchMock as never, lookup: lookup(["93.184.216.34"]) },
    );
    expect(result).toMatchObject({
      kind: "failure",
      fetchStatus: "blocked",
      errorCode: "PRIVATE_ADDRESS",
      redirectCount: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps redirect chains", async () => {
    const fetchMock = vi.fn(async () =>
      response("", { status: 302, headers: { location: "/next" } }),
    );
    const result = await fetchRegisteredSource(
      registry(),
      entry().url,
      { maxRedirects: 2 },
      { fetch: fetchMock as never, lookup: lookup(["93.184.216.34"]) },
    );
    expect(result).toMatchObject({ errorCode: "TOO_MANY_REDIRECTS", redirectCount: 3 });
  });

  it("fails non-2xx terminal responses with the HTTP status", async () => {
    const result = await fetchRegisteredSource(
      registry(),
      entry().url,
      {},
      {
        fetch: vi.fn(async () => response("missing", { status: 404 })) as never,
        lookup: lookup(["93.184.216.34"]),
      },
    );
    expect(result).toMatchObject({
      kind: "failure",
      fetchStatus: "failed",
      errorCode: "HTTP_ERROR",
      httpStatus: 404,
    });
  });

  it("rejects responses above the configured byte limit", async () => {
    const result = await fetchRegisteredSource(
      registry({ maxResponseBytes: 1024 }),
      entry().url,
      {},
      {
        fetch: vi.fn(async () =>
          response("x".repeat(1025), {
            status: 200,
            headers: { "content-length": String(1025) },
          }),
        ) as never,
        lookup: lookup(["93.184.216.34"]),
      },
    );
    expect(result).toMatchObject({
      errorCode: "RESPONSE_TOO_LARGE",
      responseBytes: 1025,
    });
  });

  it("reports timeout separately from other fetch errors", async () => {
    function rejectingFetch(name: string) {
      return async (): Promise<Response> => {
        const error = new Error("network operation failed");
        error.name = name;
        throw error;
      };
    }
    const timeoutResult = await fetchRegisteredSource(
      registry(),
      entry().url,
      {},
      { fetch: rejectingFetch("AbortError") as never, lookup: lookup(["93.184.216.34"]) },
    );
    expect(timeoutResult).toMatchObject({ errorCode: "TIMEOUT" });

    const errorResult = await fetchRegisteredSource(
      registry(),
      entry().url,
      {},
      { fetch: rejectingFetch("Error") as never, lookup: lookup(["93.184.216.34"]) },
    );
    expect(errorResult).toMatchObject({ errorCode: "FETCH_ERROR", errorMessage: "network operation failed" });
  });
});
