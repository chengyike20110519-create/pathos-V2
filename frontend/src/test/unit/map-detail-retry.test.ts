import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeStage5Summary } from "@/schemas/stage5-preview.schema";

const sample = normalizeStage5Summary(JSON.parse(readFileSync("data/preview/universities.json", "utf8"))[0]);

describe("school detail transport recovery", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("recovers from one transient connection failure and caches the successful detail", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "BACKEND_UNAVAILABLE" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(sample), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { PreviewApiDataSource } = await import("@/services/preview-api-data-source");
    const source = new PreviewApiDataSource();
    await expect(source.getUniversityDetail(sample.id)).resolves.toMatchObject({ id: sample.id });
    await expect(source.getUniversityDetail(sample.id)).resolves.toMatchObject({ id: sample.id });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a missing school or hide a structural data error", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "UNIVERSITY_NOT_FOUND" }), { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const { PreviewApiDataSource } = await import("@/services/preview-api-data-source");
    await expect(new PreviewApiDataSource().getUniversityDetail("missing")).rejects.toMatchObject({ code: "UNIVERSITY_NOT_FOUND" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("allows subscribers to share a request without one panel abort canceling another", async () => {
    const fetch = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify(sample), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    const { PreviewApiDataSource } = await import("@/services/preview-api-data-source");
    const source = new PreviewApiDataSource();
    const controller = new AbortController();
    const first = source.getUniversityDetail(sample.id, controller.signal);
    controller.abort();
    await expect(source.getUniversityDetail(sample.id)).resolves.toMatchObject({ id: sample.id });
    await first;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
