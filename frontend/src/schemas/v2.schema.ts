import type { FieldMeta, MajorComparison, TimeSeriesPoint } from "@/types/timeseries";

export type MajorCategory = "engineering" | "business" | "science" | "social" | "arts" | "agriculture" | "life_health";

export interface UniversityDetailV2 {
  slug: string;
  rankingCrossSource?: { qs: number | null; usNews: number | null; the: number | null; reconciliationNote: string };
  financial?: { tuition: Array<{ degree: "bachelor" | "master" | "phd"; type: "highest" | "lowest"; amountUSD: number | null; meta: FieldMeta }>; accommodation: number | null; livingCost: { min: number; max: number } | null };
  requirements?: Array<{ degree: string; language: string | null; standardized: string | null; meta: FieldMeta }>;
  timeSeries?: TimeSeriesPoint[];
  majorStrengths?: Array<{ majorName: string; category: MajorCategory; score: number | null; meta: FieldMeta }>;
  history?: Array<{ year: number; title: string; description: string; meta: FieldMeta }>;
  notableAlumni?: Array<{ category: "president" | "nobel" | "pulitzer" | "business" | "other"; names: string[]; meta: FieldMeta }>;
  facilities?: Array<{ type: string; name: string; metric: string | null; meta: FieldMeta }>;
}

export interface CaseRecord extends FieldMeta {
  id: string;
  fromSchool?: string;
  toSchool: string;
  major: string;
  gpa: number | null;
  sat: number | null;
  toefl: number | null;
  essayExcerpt: string | null;
  admissionYear: number;
  isPublic: boolean;
}

export interface NewMajorEvent extends FieldMeta {
  id: string;
  school: string;
  major: string;
  announcedAt: string;
  summary: string;
  suitabilityTags: string[];
  status: "verified" | "pending";
}

export function isFieldMeta(value: unknown): value is FieldMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<FieldMeta>;
  return typeof meta.source === "string" && typeof meta.asOf === "string" && typeof meta.verifiedBy === "string" && typeof meta.confidence === "number";
}

export type { MajorComparison };
