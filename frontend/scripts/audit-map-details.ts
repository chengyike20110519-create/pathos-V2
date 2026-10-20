import { mkdir, rename, writeFile } from "node:fs/promises";
import { parseUniversityDetail, parseUniversitySummaryList } from "../src/schemas/dataset.schema";

async function main() {
  const origin = process.env.PATHOS_CHECK_URL ?? "http://localhost:3000";
  const list = await fetch(`${origin}/api/pathos/preview?endpoint=universities&limit=500`, { signal: AbortSignal.timeout(30000) });
  if (!list.ok) throw new Error(`Summary HTTP ${list.status}`);
  const schools = parseUniversitySummaryList(await list.json());
  const results: Array<{ id: string; name: string; ok: boolean; status: number; ms: number; programs?: number; sources?: number; hasOfficialSnapshot?: boolean; code?: string; message?: string }> = [];
  let next = 0;
  const worker = async () => {
    while (next < schools.length) {
      const school = schools[next++];
      const start = Date.now();
      try {
        const response = await fetch(`${origin}/api/pathos/preview?endpoint=university&id=${encodeURIComponent(school.id)}`, { signal: AbortSignal.timeout(30000) });
        const raw = await response.json();
        if (!response.ok) {
          results.push({ id: school.id, name: school.chineseName, ok: false, status: response.status, ms: Date.now() - start, code: raw.code, message: raw.message });
        } else {
          const detail = parseUniversityDetail(raw);
          if (detail.id !== school.id) throw new Error("Detail ID mismatch");
          results.push({ id: school.id, name: school.chineseName, ok: true, status: response.status, ms: Date.now() - start, programs: detail.previewMetadata?.allMajors?.length || detail.programs.length, sources: detail.sources.length, hasOfficialSnapshot: !!detail.officialResearch });
        }
      } catch (error) {
        results.push({ id: school.id, name: school.chineseName, ok: false, status: 0, ms: Date.now() - start, message: (error as Error).message });
      }
      if (results.length % 20 === 0) console.log(`Checked ${results.length}/${schools.length}`);
    }
  };
  // The shared Supabase pooler is intentionally tested serially. Parallel
  // detail requests can create false 503s and hide the actual endpoint state.
  await Promise.all(Array.from({ length: 1 }, worker));
  const times = results.map((row) => row.ms).sort((a, b) => a - b);
  const failures = results.filter((row) => !row.ok);
  const summary = {
    checkedAt: new Date().toISOString(), total: schools.length,
    passed: results.length - failures.length, failed: failures.length,
    medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.floor(times.length * 0.95)],
    failures,
  };
  await mkdir("test-results", { recursive: true });
  const output = process.env.PATHOS_AUDIT_OUTPUT ?? "test-results/map-details-audit.json";
  const tempOutput = `${output}.tmp-${process.pid}`;
  await writeFile(tempOutput, JSON.stringify({ ...summary, results }, null, 2));
  await rename(tempOutput, output);
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
