import crypto from "node:crypto";
import fs from "node:fs";

const candidatePath = "data/reviewed/guide-source-candidates.json";
const indexPath = "data/preview/source-index.json";
const candidates = JSON.parse(fs.readFileSync(candidatePath, "utf8")).records;
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const byUrl = new Map(index.sources.map((source) => [source.url, source]));
for (const candidate of candidates) {
  const urls = [candidate.sourceUrl, ...(candidate.supportingSourceUrls ?? [])];
  for (const url of urls) {
  const sourceId = `official-source-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
  byUrl.set(url, {
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
index.sources = [...byUrl.values()];
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ addedOrUpdated: candidates.length, totalSources: index.sources.length }, null, 2));
