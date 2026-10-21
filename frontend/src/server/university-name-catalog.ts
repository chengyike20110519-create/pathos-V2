// Canonical bilingual labels for the 94-school preview catalogue.
// This is a server-only projection fallback: it does not invent or write data.
import previewUniversities from "../../data/preview/universities.json";
import reviewedOverviews from "../../data/reviewed/university-overviews.json";

const byId = new Map<string, string>();
const byEnglishName = new Map<string, string>();

for (const school of previewUniversities) {
  const chinese = typeof school.nameZh === "string" ? school.nameZh.trim() : "";
  if (!chinese) continue;
  byId.set(String(school.id).trim(), chinese);
  byEnglishName.set(String(school.name).trim().toLocaleLowerCase(), chinese);
}

// The reviewed overview file is the authoritative Chinese-name layer when a
// preview record still contains an English abbreviation such as "UIUC".
for (const school of reviewedOverviews.schools) {
  const chinese = typeof school.nameZh === "string" ? school.nameZh.trim() : "";
  if (!chinese) continue;
  const id = String(school.universityId).trim();
  byId.set(id, chinese);
  byId.set(id.split(":").pop() || id, chinese);
}

for (const school of previewUniversities) {
  const reviewedName = byId.get(String(school.id).trim())
    || byId.get(String(school.id).trim().split(":").pop() || "");
  if (reviewedName) byEnglishName.set(String(school.name).trim().toLocaleLowerCase(), reviewedName);
}

export function canonicalChineseName(id: unknown, englishName: unknown, databaseName: unknown): string {
  const english = typeof englishName === "string" ? englishName.trim() : "";
  const database = typeof databaseName === "string" ? databaseName.trim() : "";
  if (database && database.toLocaleLowerCase() !== english.toLocaleLowerCase() && /[^\x00-\x7F]/.test(database)) return database;
  const rawId = String(id ?? "").trim();
  const fromCatalog = byId.get(rawId)
    || byId.get(rawId.split(":").pop() || rawId)
    || byEnglishName.get(english.toLocaleLowerCase());
  return fromCatalog || "";
}

export const UNIVERSITY_NAME_CATALOG_SIZE = byId.size;
