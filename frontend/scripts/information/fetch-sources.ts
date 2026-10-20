import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SourceRegistryEntry } from "../../src/server/information/source-registry";
import { SourceRegistry } from "../../src/server/information/source-registry";
import { listActiveSources } from "../../src/server/information/source-repository";
import { fetchAndRecordSource } from "../../src/server/information/source-fetch-service";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main(): Promise<void> {
  const input = argValue("--input");
  const onlyUrl = argValue("--url");
  if (!input) {
    console.error("Usage: tsx scripts/information/fetch-sources.ts --input <source-registry.json> [--url <url>]");
    process.exitCode = 1;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.resolve(input), "utf8"));
  } catch (error) {
    console.error(`[fetch-sources] unable to read ${input}:`, error);
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(parsed)) {
    console.error("[fetch-sources] input JSON must be an array of source registry entries");
    process.exitCode = 1;
    return;
  }

  const registry = new SourceRegistry();
  for (const entry of parsed as SourceRegistryEntry[]) {
    try {
      registry.register(entry);
    } catch (error) {
      console.error("[fetch-sources] invalid registry entry:", error);
      process.exitCode = 1;
      return;
    }
  }

  const sources = (await listActiveSources()).filter((source) => {
    if (onlyUrl && source.url !== onlyUrl) return false;
    return registry.get(source.url) !== null;
  });

  const results: Array<Record<string, unknown>> = [];
  for (const source of sources) {
    const access = registry.canFetch(source.url);
    if (!access.allowed) {
      results.push({
        sourceId: source.id,
        url: source.url,
        outcome: "blocked",
        code: access.code,
      });
      continue;
    }
    const result = await fetchAndRecordSource(source, registry);
    results.push({
      sourceId: source.id,
      url: source.url,
      outcome: result.fetch.fetchOutcome,
      documentId: result.document?.id ?? null,
      contentHash: result.fetch.contentHash,
      errorCode: result.fetch.kind === "failure" ? result.fetch.errorCode : null,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    registered: registry.size,
    considered: sources.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error("[fetch-sources] failed:", error);
  process.exitCode = 1;
});
