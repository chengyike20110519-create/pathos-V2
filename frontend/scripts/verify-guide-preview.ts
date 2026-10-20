// PathOS — verify Princeton guidePreview fields after patch
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractGuidePreview } from "../src/lib/guide-preview";

const project = path.resolve(__dirname, "..");
const iecg = JSON.parse(
  readFileSync(path.join(project, "data/college-guides/iecg-2025.json"), "utf8"),
);

const targets = [
  "Princeton University 普林斯顿大学",
  "Cornell University康奈尔大学",
  "Stanford University 斯坦福大学",
  "University of California, Los Angeles加州大学洛杉矶分校",
  "University of California, Berkeley加州大学伯克利分校",
  "Yale University 耶鲁大学",
  "University of Wisconsin-Madison威斯康星大学麦迪逊分校",
  "Purdue University 普渡大学",
  "Harvard University",
];

for (const p of iecg.profiles) {
  if (!targets.includes(p.schoolNameRaw)) continue;
  const structured = (p as any).structured || {};
  const sections = (p as any).sections || [];
  const gp = extractGuidePreview({ structured, sections });
  console.log("\n========== " + p.schoolNameRaw + " ==========");
  console.log("officialWebsite:", gp.officialWebsite);
  console.log("tuition.total:   ", gp.tuition?.total);
  console.log("acceptanceRate:  ", gp.acceptanceRatePercent);
  console.log("graduationRate4Yr:", gp.graduationRate4Yr);
  console.log("freshmanRetention:", gp.freshmanRetentionRate);
  console.log("studentFacultyRatio:", gp.studentFacultyRatio);
  console.log("academicSystem:  ", gp.academicSystem);
  console.log("applicationDeadlines:", gp.applicationDeadlines?.slice(0, 60));
  console.log("usNewsRanks:     ", JSON.stringify(gp.usNewsRanks));
  console.log("curriculumUrl:   ", gp.curriculumUrl);
  console.log("curriculumSummary:", gp.curriculumSummary?.slice(0, 80));
  console.log("programs (count):", gp.programs?.length, "-> first 3:");
  console.log("  ", (gp.programs ?? []).slice(0, 3).map((x: any) => `${x.name} | ${x.nameZh}`).join("\n  "));
  console.log("midRangeScores:  ", JSON.stringify(gp.midRangeScores));
  console.log("testPolicy:      ", gp.testPolicy?.slice(0, 80));
  console.log("classSize:       ", JSON.stringify(gp.classSize));
}
