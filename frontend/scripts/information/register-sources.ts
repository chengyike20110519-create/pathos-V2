import { readFile } from "node:fs/promises";
import path from "node:path";
import { SourceRegistry, type SourceRegistryEntry } from "../../src/server/information/source-registry";
import { registerSource } from "../../src/server/information/source-repository";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main(): Promise<void> {
  const input = argValue("--input");
  const dryRun = process.argv.includes("--dry-run");
  if (!input) {
    console.error("Usage: tsx scripts/information/register-sources.ts --input <source-registry.json> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.resolve(input), "utf8"));
  } catch (error) {
    console.error(`[register-sources] unable to read ${input}:`, error);
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(parsed)) {
    console.error("[register-sources] input JSON must be an array of source registry entries");
    process.exitCode = 1;
    return;
  }

  // Build the in-memory registry first so one bad entry cannot cause a partial
  // database registration.
  const registry = new SourceRegistry();
  const entries = parsed as SourceRegistryEntry[];
  for (const [index, entry] of entries.entries()) {
    try {
      registry.register(entry);
    } catch (error) {
      console.error(`[register-sources] entry ${index} is invalid:`, error);
      process.exitCode = 1;
      return;
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, count: registry.size }, null, 2));
    return;
  }

  const saved: Array<Record<string, unknown>> = [];
  for (const entry of registry.list()) {
    const source = await registerSource(entry);
    saved.push({
      id: source.id,
      url: source.url,
      fetchEnabled: source.fetchEnabled,
      robotsReviewStatus: source.robotsReviewStatus,
      termsReviewStatus: source.termsReviewStatus,
    });
  }
  console.log(JSON.stringify({ ok: true, count: saved.length, sources: saved }, null, 2));
}

main().catch((error) => {
  console.error("[register-sources] failed:", error);
  process.exitCode = 1;
});
