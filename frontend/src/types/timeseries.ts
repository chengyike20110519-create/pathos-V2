export type TimeSeriesMetric = "sat" | "gpa" | "acceptanceRate" | "tuitionUSD";

export interface FieldMeta {
  source: "IECG" | "IPEDS" | "College Scorecard" | "US News" | "QS" | "THE" | "school_official" | "editorial";
  asOf: string;
  verifiedBy: string;
  confidence: number;
}

export interface TimeSeriesPoint extends FieldMeta {
  semester: string;
  schoolId?: string;
  schoolName?: string;
  sat: number | null;
  gpa: number | null;
  acceptanceRate: number | null;
  tuitionUSD: number | null;
}

export interface MajorComparison {
  schoolId: string;
  schoolName: string;
  category: string;
  annualCostUSD: number | null;
  acceptanceRate: number | null;
  strengthScore: number | null;
  meta: FieldMeta;
}
