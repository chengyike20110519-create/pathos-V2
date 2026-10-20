import type { FactEntityType } from "@/domain/information/fact";
import {
  createSchoolFactProfile,
  type SchoolFactProfile,
} from "@/domain/information/school-profile";
import { listApprovedFacts } from "@/server/information/fact-repository";

export async function aggregateSchoolProfile(
  entityId: string,
  academicYear?: string,
): Promise<SchoolFactProfile> {
  const trimmedId = entityId.trim();
  if (!trimmedId || trimmedId.length > 160) {
    throw new Error("invalid university id");
  }
  const facts = await listApprovedFacts({
    entityType: "university" satisfies FactEntityType,
    entityId: trimmedId,
    academicYear: academicYear?.trim() || undefined,
  });
  return createSchoolFactProfile(trimmedId, facts);
}
