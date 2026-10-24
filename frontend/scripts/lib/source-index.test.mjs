import assert from "node:assert/strict";
import test from "node:test";
import { collectSourceReferences, mergeSourcesById } from "./source-index.mjs";

test("shared URLs retain legacy source IDs used by facts", () => {
  const old = [{ sourceId: "history-2025", url: "https://example.edu/about" }];
  const added = [{ sourceId: "official-2026", url: "https://example.edu/about" }];
  assert.deepEqual(mergeSourcesById(old, added).map((s) => s.sourceId), ["history-2025", "official-2026"]);
});

test("refreshing an identity preserves other sources and is idempotent", () => {
  const old = [{ sourceId: "a", url: "https://example.edu/old", publisher: "School" }, { sourceId: "b", url: "https://example.edu/b" }];
  const added = [{ sourceId: "a", url: "https://example.edu/current" }];
  const merged = mergeSourcesById(old, added);
  assert.equal(merged[0].publisher, "School");
  assert.equal(merged[0].url, added[0].url);
  assert.equal(merged.length, 2);
  assert.deepEqual(mergeSourcesById(merged, added), merged);
});

test("nested fact and major references are both audited", () => {
  const refs = collectSourceReferences({ history: { sourceIds: ["history"] }, allMajors: [{ sourceIds: ["catalog"] }], source: { sourceId: "record" } });
  assert.deepEqual(refs.map((r) => r.sourceId), ["history", "catalog", "record"]);
});
