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
  for (const name of [
    ...(detail.previewMetadata?.allMajors ?? []).map((major) => major.name),
    ...detail.programs.map((program) => program.name),
    ...(detail.programSpotlights ?? []).map((program) => program.name),
  ]) {
    if (name?.trim()) names.set(normalizeProgramName(name), name.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
