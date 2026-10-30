import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createAnswerCard,
  isAnswerCardSlug,
  type AnswerCard,
  type PreviewProvenance,
} from "@/domain/information/answer-card";
import type { UniversitySummary } from "@/domain/dataset";
import {
  normalizeStage5Summary,
  parseStage5Summary,
} from "@/schemas/stage5-preview.schema";
import { listApprovedFacts } from "@/server/information/fact-repository";
import type { Fact } from "@/domain/information/fact";

interface TraceablePreviewBundle {
  universities: readonly UniversitySummary[];
  provenance: PreviewProvenance;
}

interface ManifestPayload {
  datasetVersion?: unknown;
  sourceCommit?: unknown;
  artifactHashes?: unknown;
}

function manifestString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function manifestArtifactHash(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const hash = (value as Record<string, unknown>)["universities.json"];
  return typeof hash === "string" && hash.trim() ? hash.trim() : null;
}

function compactStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function compactNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactCostSummary(value: unknown): UniversitySummary["costSummary"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const minimumUsd = compactNumber(raw.minimumUsd);
  const maximumUsd = compactNumber(raw.maximumUsd);
  if (minimumUsd == null && maximumUsd == null) return undefined;
  return {
    minimumUsd,
    maximumUsd,
    displayLabel: typeof raw.displayLabel === "string" ? raw.displayLabel : undefined,
    comparisonSafe: raw.comparisonSafe === true,
  };
}

function compactRankingSummary(value: unknown): UniversitySummary["rankingSummary"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const nationalRank = compactNumber(raw.nationalRank);
  return {
    nationalRank: nationalRank != null && nationalRank > 0 ? nationalRank : null,
    rankingTier: "other",
    rankingLabel: typeof raw.rankingLabel === "string" ? raw.rankingLabel : undefined,
  };
}

function compactPreviewSummary(
  raw: unknown,
  fallbackDatasetVersion: string,
): UniversitySummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : null;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : null;
  const nameZh = typeof value.nameZh === "string" && value.nameZh.trim()
    ? value.nameZh.trim()
    : name;
  const latitude = compactNumber(value.latitude);
  const longitude = compactNumber(value.longitude);
  if (!id || !name || !nameZh || latitude == null || longitude == null) return null;
  const rank = compactRankingSummary(value.rankingSummary);

  return {
    id,
    name,
    nameZh,
    chineseName: nameZh,
    aliases: compactStringArray(value.aliases),
    latitude,
    longitude,
    rankingSummary: rank,
    nationalRanking: rank?.nationalRank ?? undefined,
    costSummary: compactCostSummary(value.costSummary),
    topPrograms: compactStringArray(value.topPrograms),
    acceptanceRate: compactNumber(value.acceptanceRate),
    displayTier: "preview",
    previewOnly: value.previewOnly !== false,
    datasetVersion: typeof value.datasetVersion === "string" ? value.datasetVersion : fallbackDatasetVersion,
    sourceCommit: typeof value.sourceCommit === "string" ? value.sourceCommit : undefined,
    nullableFields: compactStringArray(value.nullableFields),
  };
}

function normalizePreviewSummaries(
  raw: unknown,
  fallbackDatasetVersion: string,
): UniversitySummary[] {
  if (!Array.isArray(raw)) throw new Error("preview universities must be an array");
  return raw.flatMap((item) => {
    try {
      const normalized = normalizeStage5Summary(parseStage5Summary(item));
      const compact = compactPreviewSummary(item, fallbackDatasetVersion);
      if (!compact) return [];
      // The shared Stage5 normalizer predates topic dashboards and omits the
      // compact program tags. Preserve them from the same artifact row.
      return [{ ...normalized, topPrograms: compact.topPrograms }];
    } catch {
      // The frozen local Preview artifact permits null region/tier values that
      // the public API repairs after ETL. Answer cards consume only the compact
      // fields below and retain the manifest hash for traceability.
      const summary = compactPreviewSummary(item, fallbackDatasetVersion);
      return summary ? [summary] : [];
    }
  });
}

export async function loadTraceablePreviewBundle(
  env: { PATHOS_PREVIEW_BUNDLE_DIR?: string } = process.env as { PATHOS_PREVIEW_BUNDLE_DIR?: string },
): Promise<TraceablePreviewBundle> {
  const bundleDir = path.resolve(/* turbopackIgnore: true */
    env.PATHOS_PREVIEW_BUNDLE_DIR?.trim() || path.join(process.cwd(), "data", "preview"),
  );
  const [manifestRaw, universitiesRaw] = await Promise.all([
    readFile(path.join(bundleDir, "manifest.json"), "utf8"),
    readFile(path.join(bundleDir, "universities.json"), "utf8"),
  ]);

  const manifest = JSON.parse(manifestRaw) as ManifestPayload;
  const datasetVersion = manifestString(manifest.datasetVersion);
  if (!datasetVersion) throw new Error("preview manifest has no datasetVersion");

  const universities = normalizePreviewSummaries(
    JSON.parse(universitiesRaw),
    datasetVersion,
  );
  return {
    universities,
    provenance: {
      datasetVersion,
      sourceCommit: manifestString(manifest.sourceCommit),
      artifactHash: manifestArtifactHash(manifest.artifactHashes),
    },
  };
}

function databaseNotice(error: unknown): string {
  if (error instanceof Error && error.message.includes("facts") && error.message.includes("exists")) {
    return "信息事实迁移尚未执行，approved facts 暂不可用；本页只显示可追溯 Preview 或显式未覆盖状态。";
  }
  return "approved facts 暂不可用；本页只显示可追溯 Preview 或显式未覆盖状态。";
}

export async function getAnswerCard(slug: string): Promise<AnswerCard | null> {
  if (!isAnswerCardSlug(slug)) return null;

  const notices: string[] = [];
  const [factResult, previewResult] = await Promise.all([
    listApprovedFacts()
      .then((facts: Fact[]) => ({ facts, available: true as const }))
      .catch((error: unknown) => {
        notices.push(databaseNotice(error));
        return { facts: [] as Fact[], available: false as const };
      }),
    loadTraceablePreviewBundle()
      .then((bundle) => ({ bundle, available: true as const }))
      .catch(() => {
        notices.push("Preview 数据集暂不可用；依赖 Preview 的答案分区保持未覆盖。");
        return { bundle: null, available: false as const };
      }),
  ]);

  return createAnswerCard(slug, {
    facts: factResult.facts,
    universities: previewResult.bundle?.universities ?? [],
    preview: previewResult.bundle?.provenance ?? null,
    approvedFactsAvailability: factResult.available ? "available" : "unavailable",
    previewAvailability: previewResult.available ? "available" : "unavailable",
    notices,
    now: new Date(),
  });
}
