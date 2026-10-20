// PathOS — IECG ↔ universities.json matching audit
import { readFileSync } from "node:fs";
import path from "node:path";

const project = path.resolve(__dirname, "..");
const iecg = JSON.parse(
  readFileSync(path.join(project, "data/college-guides/iecg-2025.json"), "utf8"),
);
const univ = JSON.parse(
  readFileSync(path.join(project, "data/preview/universities.json"), "utf8"),
);

console.log("\n=== Universe sizes ===");
console.log("IECG profiles:        " + iecg.profiles.length);
console.log("POI universities:     " + univ.length);

function normalize(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[（(][^）)]+[)）]/g, "") // strip parentheticals
    .replace(/university|college|institute/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

const poiKeys = new Map<string, any>();
for (const u of univ) {
  const k = normalize(u.name) + "|" + normalize(u.chineseName || u.nameZh || "");
  poiKeys.set(k, u);
}

const iecgKeys = new Map<string, any>();
for (const p of iecg.profiles) {
  const k = normalize(p.schoolNameRaw);
  iecgKeys.set(k, p);
}

console.log("\n=== Schools in IECG but NOT in POI list (would need to be added) ===");
const onlyInIeCG: any[] = [];
for (const [k, p] of Array.from(iecgKeys.entries())) {
  let matched = false;
  for (const [k2, u] of Array.from(poiKeys.entries())) {
    if (k.includes(normalize(u.name)) || k2.includes(k)) {
      matched = true;
      break;
    }
  }
  if (!matched) onlyInIeCG.push(p);
}
console.log("count: " + onlyInIeCG.length);
onlyInIeCG.slice(0, 30).forEach((p) => console.log("  - " + (p.schoolNameRaw || "(no name)")));

console.log("\n=== Schools in POI but NOT in IECG ===");
const onlyInPoi: any[] = [];
for (const u of univ) {
  const n = normalize(u.name);
  let matched = false;
  for (const [k, p] of Array.from(iecgKeys.entries())) {
    if (k.includes(n) || n.includes(k)) {
      matched = true;
      break;
    }
  }
  if (!matched) onlyInPoi.push(u);
}
console.log("count: " + onlyInPoi.length);
onlyInPoi.forEach((u) => console.log("  - " + (u.name || u.chineseName || "(no name)")));
