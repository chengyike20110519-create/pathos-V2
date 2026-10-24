import type { UniversityDetail } from "@/domain/dataset";
import { MAJOR_PROFILES } from "@/domain/information/major";

export const normalizeProgramName = (name: string) => name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function programDefinition(name: string) {
  const normalized = normalizeProgramName(name);
  return MAJOR_PROFILES.find((major) => [major.nameEn, major.nameZh, ...major.aliases].some((alias) => normalizeProgramName(alias) === normalized));
}

export function programExploreHref(name: string, universityId: string) {
  return `/majors/explore?${new URLSearchParams({ name, universityId })}`;
}

export function schoolProgramNames(detail: UniversityDetail): string[] {
  const names = new Map<string, string>();
  const directory = detail.previewMetadata;
  // Reviewed major directories already define the offered programs. Historical
  // award-area labels and broad ranking subjects belong in highlights rather
  // than being added as extra current majors.
  const reviewedDirectory = directory?.allMajorsStatus?.status === "verified_official_undergraduate_majors"
    && (directory.allMajors?.length ?? 0) > 0;
  for (const name of [
    ...(directory?.allMajors ?? []).map((major) => major.name),
    ...(!reviewedDirectory ? detail.programs.map((program) => program.name) : []),
    ...(!reviewedDirectory ? (detail.programSpotlights ?? []).map((program) => program.name) : []),
  ]) {
    if (name?.trim()) names.set(normalizeProgramName(name), name.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
