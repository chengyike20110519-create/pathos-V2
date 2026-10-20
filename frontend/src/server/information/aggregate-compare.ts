import { listApprovedFacts } from "@/server/information/fact-repository";
import type { Fact } from "@/domain/information/fact";

export interface AggregateComparisonFactsResult {
  entityIds: string[];
  factsByUniversity: Record<string, Fact[]>;
}

export function parseComparisonIds(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

export async function aggregateComparisonFacts(
  entityIds: readonly string[],
  academicYear?: string,
): Promise<AggregateComparisonFactsResult> {
  const ids = entityIds.slice(0, 4).map(id => id.trim());
  if (ids.length === 0 || ids.some(id => !id || id.length > 160)) {
    throw new Error("invalid comparison entity ids");
  }
  const groups = await Promise.all(ids.map(entityId =>
    listApprovedFacts({
      entityType: "university",
      entityId,
      academicYear: academicYear?.trim() || undefined,
    }),
  ));
  const factsByUniversity: Record<string, Fact[]> = {};
  ids.forEach((entityId, index) => {
    factsByUniversity[entityId] = groups[index];
  });
  return { entityIds: ids, factsByUniversity };
}
