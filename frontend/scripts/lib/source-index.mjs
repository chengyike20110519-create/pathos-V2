// URLs may be shared by multiple facts, years, and schools. Source IDs are the
// stable references stored in content payloads and must survive synchronization.
export function mergeSourcesById(existing, incoming) {
  const byId = new Map();
  for (const source of [...existing, ...incoming]) {
    if (!source?.sourceId) throw new Error("Source record requires sourceId");
    byId.set(source.sourceId, { ...byId.get(source.sourceId), ...source });
  }
  return [...byId.values()];
}

export function collectSourceReferences(value, location = "$", references = []) {
  if (!value || typeof value !== "object") return references;
  for (const [key, item] of Object.entries(value)) {
    const child = `${location}.${key}`;
    if (key === "sourceIds" && Array.isArray(item)) {
      for (const sourceId of item) {
        if (typeof sourceId === "string") references.push({ sourceId, location: child });
      }
    } else if (key === "sourceId" && typeof item === "string") {
      references.push({ sourceId: item, location: child });
    } else {
      collectSourceReferences(item, child, references);
    }
  }
  return references;
}
