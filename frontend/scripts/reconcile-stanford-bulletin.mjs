/**
 * Review a complete response from the public search used by Stanford Bulletin.
 * Emits an apply_patch document; does not silently mutate published records.
 * Usage: node scripts/reconcile-stanford-bulletin.mjs <response.json>
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { mergeSourcesById } from "./lib/source-index.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Pass the complete Stanford Bulletin search JSON");
const input = fs.readFileSync(inputPath, "utf8");
const raw = JSON.parse(input);
if (!Array.isArray(raw.data) || raw.data.length !== raw.listLength) {
  throw new Error("Incomplete official search response; refusing to replace the directory");
}
const checkedOn = new Date().toISOString().slice(0, 10);
const sourceIdFor = (url) => `official-source-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
const directoryUrl = "https://bulletin.stanford.edu/programs";
const directoryId = sourceIdFor(directoryUrl);
const rows = raw.data.filter((p) => p.level === "Undergraduate Matriculated"
  && p.status === "Active" && /^(BA|BS) - Bachelor of /.test(p.degreeDesignation)
  && ["(MAJ) Major", "(IDM) Indiv Designed Major"].includes(p.type));
if (!rows.some((p) => p.code === "MATH-BS") || !rows.some((p) => p.code === "SYMBO-BS")) {
  throw new Error("Official response is missing Mathematics or Symbolic Systems");
}
const detailPath = "data/preview/university-details/candidate-v2/stanford-university.json";
const detail = JSON.parse(fs.readFileSync(detailPath, "utf8"));
const groups = new Map();
const evidence = [];
const newSources = [];
for (const p of rows) {
  if (!p.transcriptDescription || !p.programGroupId || !p.code) throw new Error("Missing official program identifier/name");
  const degree = p.degreeDesignation.split(" - ")[0];
  const name = p.transcriptDescription.replace(/\s*\((?:BA|BS)\)/g, "").trim();
  const url = `https://bulletin.stanford.edu/programs/${encodeURIComponent(p.programGroupId)}`;
  const sourceId = sourceIdFor(url);
  const item = groups.get(name) ?? {
    degreeType: "bachelor_degree_award_area", displayName: name,
    listType: "official_undergraduate_majors", name, sourceIds: [], status: "verified",
    degreePaths: [], officialUrl: url, officialProgramCodes: [], officialUrls: [],
    programType: name.startsWith("Engineering:") ? "engineering_subplan"
      : p.type === "(IDM) Indiv Designed Major" ? "individually_designed_major" : "major",
  };
  item.degreePaths.push(degree);
  item.sourceIds.push(sourceId);
  item.officialProgramCodes.push(p.code);
  item.officialUrls.push(url);
  groups.set(name, item);
  evidence.push({ code: p.code, title: p.transcriptDescription, type: p.type, level: p.level,
    degree: p.degreeDesignation, status: p.status, effectiveStartDate: p.effectiveStartDate,
    effectiveEndDate: p.effectiveEndDate, url, sourceId });
  newSources.push({ universityId: detail.id, publisher: "Stanford University Bulletin", referenceYear: "2026-27",
    scope: ["undergraduate program title, degree and classification"], sourceId,
    sourceType: "official_undergraduate_bulletin", status: "verified", url, checkedOn });
}
detail.allMajors = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
detail.allMajorsStatus = {
  nullReason: null, status: "verified_official_undergraduate_majors", referenceYear: "2026-27", checkedOn,
  sourceScope: "2026-27 Stanford Bulletin: active undergraduate BA/BS major and individually designed major records. Same-name BA/BS paths are merged; Engineering subplans remain explicitly named under Engineering.",
  officialProgramRecords: rows.length, directoryEntries: detail.allMajors.length,
};
// A directory review does not upgrade unrelated admissions, cost or history facts.
detail.sourceStatus = "verified_frozen_with_warnings";
const indexPath = "data/preview/source-index.json";
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
newSources.unshift({ universityId: detail.id, publisher: "Stanford University Bulletin", referenceYear: "2026-27",
  scope: ["active undergraduate BA/BS programs, including Engineering subplans and individually designed majors"],
  sourceId: directoryId, sourceType: "official_undergraduate_bulletin", status: "verified", url: directoryUrl, checkedOn });
index.sources = mergeSourcesById(index.sources, newSources);
const guidePath = "data/reviewed/guide-source-candidates.json";
const guide = JSON.parse(fs.readFileSync(guidePath, "utf8"));
guide.records = guide.records.filter((r) => !(r.universityId === detail.id && r.sourceUrl === directoryUrl));
guide.records.push({ universityId: detail.id, universityName: detail.name, sourceUrl: directoryUrl,
  supportingSourceUrls: evidence.map((e) => e.url), publisher: "Stanford University Bulletin",
  sourceType: "official_undergraduate_bulletin", scope: ["2026-27 active undergraduate BA/BS programs and explicitly named Engineering subplans"], checkedOn });
const snapshotPath = "data/reviewed/stanford-undergraduate-bulletin.json";
const snapshot = { universityId: detail.id, checkedOn, referenceYear: "2026-27", sourceUrl: directoryUrl,
  officialSearch: { catalogId: "s1KuGHRiFO9tNyicMDbi", effectiveDatesRange: "2026-08-01,2026-08-01",
    totalRecords: raw.listLength, receivedRecords: raw.data.length, responseSha256: crypto.createHash("sha256").update(input).digest("hex") },
  includedProgramRecords: rows.length, mergedDirectoryEntries: detail.allMajors.length, programs: evidence };
const updates = [[detailPath, detail], [indexPath, index], [guidePath, guide], [snapshotPath, snapshot]];
let patch = "*** Begin Patch\n";
for (const [file, value] of updates) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (!fs.existsSync(file)) {
    patch += `*** Add File: ${path.resolve(file)}\n` + next.trimEnd().split("\n").map((line) => `+${line}`).join("\n") + "\n";
  } else {
    const old = fs.readFileSync(file, "utf8");
    if (old === next) continue;
    const before = old.trimEnd().split("\n");
    const after = next.trimEnd().split("\n");
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let tail = 0;
    while (tail < before.length - start && tail < after.length - start && before[before.length - tail - 1] === after[after.length - tail - 1]) tail++;
    const contextStart = Math.max(0, start - 3);
    patch += `*** Update File: ${path.resolve(file)}\n@@\n` + [
      ...before.slice(contextStart, start).map((line) => ` ${line}`),
      ...before.slice(start, before.length - tail).map((line) => `-${line}`),
      ...after.slice(start, after.length - tail).map((line) => `+${line}`),
      ...before.slice(before.length - tail, before.length - tail + 3).map((line) => ` ${line}`),
    ].join("\n") + "\n";
  }
}
patch += "*** End Patch\n";
process.stdout.write(patch);
