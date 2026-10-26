/**
 * Merge exact duplicate undergraduate directory entries in place.
 *
 * A duplicate is only an entry whose normalized display name is identical
 * within one school's reviewed directory. We retain one record, merge source
 * and official-link arrays, and preserve the richest metadata record.
 * Dry-run by default; pass --apply to update the reviewed JSON files.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Major = Record<string, any>;

const ROOT = "data/preview/university-details/candidate-v2";
const apply = process.argv.includes("--apply");

function keyOf(item: Major): string {
  return String(item.name ?? item.displayName ?? "").trim().toLocaleLowerCase();
}

function arrayUnion(...values: unknown[]): string[] | undefined {
  const items = values.flatMap((value) => Array.isArray(value) ? value : []);
  if (!items.length) return undefined;
  return [...new Set(items.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

function score(item: Major): number {
  return Object.entries(item).reduce((total, [key, value]) => {
    if (key === "sourceIds" || key === "officialUrls" || key === "degreePaths" || key === "officialProgramLabels") return total;
    return total + (value !== null && value !== undefined && value !== "" ? 1 : 0);
  }, 0) + (Array.isArray(item.sourceIds) ? item.sourceIds.length * 3 : 0);
}

function mergeGroup(items: Major[]): Major {
  const ordered = [...items].sort((a, b) => score(b) - score(a));
  const merged = { ...ordered[0] };
  for (const key of ["sourceIds", "officialUrls", "degreePaths", "officialProgramLabels"]) {
    const values = arrayUnion(...ordered.map((item) => item[key]));
    if (values?.length) merged[key] = values;
  }
  return merged;
}

async function main() {
  const files = (await readdir(ROOT)).filter((file) => file.endsWith(".json")).sort();
  const changes: Array<{ file: string; before: number; after: number; removed: number }> = [];
  for (const file of files) {
    const fullPath = path.join(ROOT, file);
    const detail = JSON.parse(await readFile(fullPath, "utf8"));
    const entries = Array.isArray(detail.allMajors) ? detail.allMajors : [];
    const groups = new Map<string, Major[]>();
    for (const item of entries) {
      if (!item || typeof item !== "object" || !keyOf(item)) continue;
      const key = keyOf(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const duplicates = [...groups.values()].filter((group) => group.length > 1);
    if (!duplicates.length) continue;
    const replacement = new Map<string, Major>([...groups.entries()].map(([key, group]) => [key, mergeGroup(group)]));
    const deduped = entries.map((item: Major) => replacement.get(keyOf(item)) ?? item)
      .filter((item: Major, index: number, all: Major[]) => all.findIndex((candidate) => candidate === item) === index);
    changes.push({ file, before: entries.length, after: deduped.length, removed: entries.length - deduped.length });
    if (apply) await writeFile(fullPath, `${JSON.stringify({ ...detail, allMajors: deduped }, null, 2)}\n`);
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", changes, removed: changes.reduce((sum, item) => sum + item.removed, 0) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
