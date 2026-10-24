// Reconcile already downloaded official directories; output reviewable patches.
import fs from "node:fs";
import crypto from "node:crypto";
import { mergeSourcesById } from "./lib/source-index.mjs";
import { jsonPatch } from "./lib/json-patch.mjs";

const checkedOn = new Date().toISOString().slice(0, 10);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const clean = (s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&#038;|&amp;/g, "&")
  .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();
const idFor = (url) => `official-source-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
const indexPath = "data/preview/source-index.json", guidePath = "data/reviewed/guide-source-candidates.json";
const index = read(indexPath), guide = read(guidePath), updates = [];

for (const [slug, input, url, publisher] of [
  ["boston-university", process.argv[2], "https://www.bu.edu/academics/degree-programs/", "Boston University Bulletin"],
  ["tufts-university", process.argv[3], "https://students.tufts.edu/registrar/forms-and-policies/departments-and-programs", "Tufts University AS&E Registrar"],
]) {
  if (!input) throw new Error("Pass BU degree-programs HTML and Tufts departments/programs HTML");
  const html = fs.readFileSync(input, "utf8"), sourceId = idFor(url);
  const entries = new Map(), excluded = [];
  if (slug === "boston-university") {
    for (const match of html.matchAll(/<li class="([^"]+)">([\s\S]*?)<\/li>/g)) {
      if (!match[1].split(/\s+/).includes("mj")) continue;
      const links = [...match[2].matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)]
        .map((m) => ({ url: new URL(m[1], "https://www.bu.edu").href, label: clean(m[2]) }))
        .filter((l) => /^(BA|BS|BFA|BM|BLS)(?:$|—)/.test(l.label));
      const name = clean(match[2].split(/\s*\(<a/)[0]);
      if (!links.length) { excluded.push(name); continue; }
      entries.set(name, { degreeType: "bachelor_degree_award_area", displayName: name,
        listType: "official_undergraduate_majors", name, sourceIds: [sourceId], status: "verified",
        degreePaths: [...new Set(links.map((l) => l.label))], officialUrl: links[0].url,
        officialUrls: [...new Set(links.map((l) => l.url))],
        programType: /Specialization|Chemistry:/.test(name) ? "major_specialization" : "major" });
    }
    if ([...entries.keys()].some((n) => /^Pre-(Law|Med|Dent|Vet)/i.test(n))) throw new Error("Pre-professional advising was incorrectly counted as a major");
  } else {
    for (const match of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      if (cells.length < 3) continue;
      const name = clean(cells[0]), type = clean(cells[1]);
      if (/Minor/i.test(type) || name === "No Major") continue;
      if (!(/^Undergraduate\b/.test(type) && /Major|Degree/.test(type))
          && !/^Degree \(BS\w*\)/.test(type) && type !== "Major") continue;
      const degreePaths = [...new Set([...`${name} ${type}`.matchAll(/\b(?:BA|BS[A-Z]*|BFA|BED|BES)\b/g)].map((m) => m[0]))];
      const link = cells[2].match(/href="(https?:[^"\s]+)"/);
      const previous = entries.get(name);
      const programType = /Co[ -]*Major|Second Major/i.test(type) ? "co_or_second_major" : "major";
      entries.set(name, { degreeType: "bachelor_degree_award_area", displayName: name,
        listType: "official_undergraduate_majors", name, sourceIds: [sourceId], status: "verified",
        ...(degreePaths.length ? { degreePaths } : {}), programType,
        officialProgramLabels: [...new Set([...(previous?.officialProgramLabels ?? []), type])],
        ...(link ? { officialUrl: link[1] } : {}) });
    }
    for (const expected of ["Computer Engineering", "Electrical Engineering", "Environmental Studies"]) {
      if (!entries.has(expected)) throw new Error(`Missing official Tufts program ${expected}`);
    }
  }
  const detailPath = `data/preview/university-details/candidate-v2/${slug}.json`, detail = read(detailPath);
  const sourceScope = slug === "boston-university"
    ? "Current BU Bulletin degree directory: Undergraduate Major entries with a standalone bachelor degree link. Includes Metropolitan College and explicitly named specializations; excludes pre-professional advising and combined graduate pathways."
    : "Tufts AS&E Bulletin departments/programs: undergraduate majors, co-majors, second majors and bachelor degree programs. Official program labels are preserved; minors, graduate programs and No Major are excluded. Degree paths are recorded only when explicit.";
  detail.allMajors = [...entries.values()];
  detail.allMajorsStatus = { nullReason: null, status: "verified_official_undergraduate_majors", sourceScope, referenceYear: 2026, checkedOn,
    directoryEntries: entries.size };
  detail.sourceStatus = "verified_frozen_with_warnings";
  updates.push([detailPath, detail]);
  index.sources = mergeSourcesById(index.sources, [{ universityId: detail.id, publisher, referenceYear: 2026,
    scope: [sourceScope], sourceId, sourceType: "official_undergraduate_bulletin", status: "verified", url, checkedOn }]);
  guide.records = guide.records.filter((r) => !(r.universityId === detail.id && r.sourceUrl === url));
  guide.records.push({ universityId: detail.id, universityName: detail.name, sourceUrl: url, publisher,
    sourceType: "official_undergraduate_bulletin", scope: [sourceScope], checkedOn });
  updates.push([`data/reviewed/${slug}-undergraduate-directory.json`, { universityId: detail.id, checkedOn, sourceUrl: url, sourceScope,
    responseSha256: crypto.createHash("sha256").update(html).digest("hex"), entries: detail.allMajors, excludedCombinedPathways: excluded }]);
}
const jhuPath = "data/preview/university-details/candidate-v2/johns-hopkins-university.json";
const jhu = read(jhuPath); jhu.sourceStatus = "verified_frozen_with_warnings";
updates.push([jhuPath, jhu], [indexPath, index], [guidePath, guide]);
const only = process.argv[4];
process.stdout.write(jsonPatch(only ? updates.filter(([file]) => file === only) : updates));
