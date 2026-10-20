export type GPAAlgorithm = "standard_4_0" | "improved_4_0_a" | "beida_4_0";

export const STANDARD_4_0 = (score: number): number => {
  if (score >= 90) return 4;
  if (score >= 80) return 3;
  if (score >= 70) return 2;
  if (score >= 60) return 1;
  return 0;
};

export const IMPROVED_4_0_A = (score: number): number => {
  if (score >= 97) return 4;
  if (score >= 93) return 4;
  if (score >= 90) return 3.7;
  if (score >= 87) return 3.3;
  if (score >= 83) return 3;
  if (score >= 80) return 2.7;
  if (score >= 77) return 2.3;
  if (score >= 73) return 2;
  if (score >= 70) return 1.7;
  if (score >= 67) return 1.3;
  if (score >= 65) return 1;
  if (score >= 60) return 0.7;
  return 0;
};

export const BEIDA_4_0 = (score: number): number => {
  if (score >= 95) return 4;
  if (score >= 90) return 4;
  if (score >= 85) return 3.7;
  if (score >= 82) return 3.3;
  if (score >= 78) return 3;
  if (score >= 75) return 2.7;
  if (score >= 72) return 2.3;
  if (score >= 68) return 2;
  if (score >= 64) return 1.5;
  if (score >= 60) return 1;
  return 0;
};

export const GPA_ALGORITHMS: Record<GPAAlgorithm, { name: string; fn: (score: number) => number; scale: 4 }> = {
  standard_4_0: { name: "标准 4.0（美本）", fn: STANDARD_4_0, scale: 4 },
  improved_4_0_a: { name: "改进 4.0（+0.3 奖励）", fn: IMPROVED_4_0_A, scale: 4 },
  beida_4_0: { name: "北大 4.0", fn: BEIDA_4_0, scale: 4 },
};

export interface GPACourse { name: string; score: number; credits: number; }

export function calculateGPA(courses: GPACourse[], algorithm: GPAAlgorithm = "standard_4_0"): number {
  const fn = GPA_ALGORITHMS[algorithm].fn;
  const valid = courses.filter((course) => Number.isFinite(course.score) && course.credits > 0);
  const credits = valid.reduce((sum, course) => sum + course.credits, 0);
  if (!credits) return 0;
  return valid.reduce((sum, course) => sum + fn(course.score) * course.credits, 0) / credits;
}
