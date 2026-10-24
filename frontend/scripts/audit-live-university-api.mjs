import fs from "node:fs/promises";

const origin = process.argv[2] ?? "http://localhost:3002";
const allSummaries = JSON.parse(await fs.readFile("data/preview/universities.json", "utf8"));
const previous = process.argv.includes("--retry-failed")
  ? JSON.parse(await fs.readFile("test-results/live-university-api-audit.json", "utf8")) : null;
if (previous && previous.origin !== origin) throw new Error("Cannot retry an audit from a different server");
const retryIds = new Set(previous?.failures.map((row) => row.id));
const summaries = previous ? allSummaries.filter((row) => retryIds.has(row.id)) : allSummaries;
const results = [];
for (let offset = 0; offset < summaries.length; offset += 4) {
  const batch = await Promise.all(summaries.slice(offset, offset + 4).map(async ({ id }) => {
    const local = JSON.parse(await fs.readFile(`data/preview/university-details/${id.replace(/^candidate-v2:/, "candidate-v2/")}.json`, "utf8"));
    const url = new URL("/api/pathos/preview", origin);
    url.searchParams.set("endpoint", "university"); url.searchParams.set("id", id);
    const started = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const text = await response.text(); const body = JSON.parse(text);
      const actual = body.previewMetadata?.allMajors;
      const expectedNames = local.allMajors.map((item) => typeof item === "string" ? item : item.name);
      // The HTTP transport retains legacy string rows; the client parser
      // converts them to named objects before rendering the school card.
      const actualNames = actual?.map((item) => typeof item === "string" ? item : item.name);
      const matches = response.ok && JSON.stringify(expectedNames) === JSON.stringify(actualNames)
        && body.previewMetadata?.allMajorsStatus?.status === local.allMajorsStatus?.status;
      return { id, http: response.status, ms: Math.round(performance.now() - started), bytes: Buffer.byteLength(text),
        entries: actual?.length ?? 0, matches, ...(response.ok ? {} : { error: body.code, message: body.message }) };
    } catch (error) { return { id, matches: false, ms: Math.round(performance.now() - started), error: error.message }; }
  }));
  results.push(...batch);
}
const byId = new Map((previous?.schools ?? []).map((row) => [row.id, row]));
for (const row of results) byId.set(row.id, row);
const schools = [...byId.values()];
const times = schools.map((row) => row.ms).sort((a, b) => a - b);
const failures = schools.filter((row) => !row.matches);
const report = { checkedAt: new Date().toISOString(), origin, total: schools.length, passed: schools.length - failures.length,
  failed: failures.length, responseMs: { p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times.at(-1) },
  scope: "Actual school-detail HTTP responses and directory names/status compared with local reviewed data. Times measure API responses, not full map rendering.", failures, schools };
await fs.mkdir("test-results", { recursive: true });
await fs.writeFile("test-results/live-university-api-audit.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, schools: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
