import fs from "node:fs";
import path from "node:path";

export function jsonPatch(updates) {
  let patch = "*** Begin Patch\n";
  for (const [file, value] of updates) {
    const next = `${JSON.stringify(value, null, 2)}\n`;
    const after = next.trimEnd().split("\n");
    if (!fs.existsSync(file)) {
      patch += `*** Add File: ${path.resolve(file)}\n` + after.map((line) => `+${line}`).join("\n") + "\n";
      continue;
    }
    const old = fs.readFileSync(file, "utf8");
    if (old === next) continue;
    const before = old.trimEnd().split("\n");
    let start = 0, tail = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    while (tail < before.length - start && tail < after.length - start && before[before.length - tail - 1] === after[after.length - tail - 1]) tail++;
    patch += `*** Update File: ${path.resolve(file)}\n@@\n` + [
      ...before.slice(Math.max(0, start - 3), start).map((line) => ` ${line}`),
      ...before.slice(start, before.length - tail).map((line) => `-${line}`),
      ...after.slice(start, after.length - tail).map((line) => `+${line}`),
      ...before.slice(before.length - tail, before.length - tail + 3).map((line) => ` ${line}`),
    ].join("\n") + "\n";
  }
  return patch + "*** End Patch\n";
}
