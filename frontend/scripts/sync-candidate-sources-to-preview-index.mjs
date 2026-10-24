import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { mergeSourcesById } from "./lib/source-index.mjs";

const candidatePath = "data/reviewed/guide-source-candidates.json";
const indexPath = "data/preview/source-index.json";
const candidates = JSON.parse(fs.readFileSync(candidatePath, "utf8")).records;
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const restoreArg = process.argv.indexOf("--restore-from-git");
if (restoreArg !== -1) {
  const ref = process.argv[restoreArg + 1];
  if (!ref || ref.startsWith("-")) throw new Error("--restore-from-git requires a Git ref");
  const restored = JSON.parse(execFileSync("git", ["show", `${ref}:frontend/data/preview/source-index.json`], { encoding: "utf8" }));
  // Current records take precedence. Restore only identities that were lost.
  index.sources = mergeSourcesById(restored.sources, index.sources);
}
const incoming = [];
for (const candidate of candidates) {
  const urls = [candidate.sourceUrl, ...(candidate.supportingSourceUrls ?? [])];
  for (const url of urls) {
  const sourceId = `official-source-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
  incoming.push({
    universityId: candidate.universityId,
    publisher: candidate.publisher,
    referenceYear: 2026,
    scope: candidate.scope,
    sourceId,
    sourceType: candidate.sourceType,
    status: "verified",
    url,
  });
  }
}
index.sources = mergeSourcesById(index.sources, incoming);
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ addedOrUpdated: candidates.length, totalSources: index.sources.length }, null, 2));
