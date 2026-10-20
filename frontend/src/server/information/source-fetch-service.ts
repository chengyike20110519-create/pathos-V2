import type { Source, SourceDocument } from "@/domain/information/source";
import type { SourceRegistry } from "@/server/information/source-registry";
import {
  fetchRegisteredSource,
  type SourceFetchDependencies,
  type SourceFetchResult,
} from "@/server/information/source-fetcher";
import {
  getLatestSourceDocument,
  recordSourceDocument,
} from "@/server/information/source-repository";

export interface FetchAndRecordResult {
  sourceId: string;
  sourceUrl: string;
  fetch: SourceFetchResult;
  document: SourceDocument | null;
}

export async function fetchAndRecordSource(
  source: Source,
  registry: SourceRegistry,
  dependencies: SourceFetchDependencies = {},
): Promise<FetchAndRecordResult> {
  const previous = await getLatestSourceDocument(source.id);
  const fetch = await fetchRegisteredSource(
    registry,
    source.url,
    {
      previousContentHash:
        previous?.fetchStatus === "succeeded" ? previous.contentHash : null,
    },
    dependencies,
  );

  const parserMetadata: Record<string, unknown> = {
    fetchErrorCode: fetch.kind === "failure" ? fetch.errorCode : null,
    requestedUrl: fetch.requestedUrl,
    finalUrl: fetch.finalUrl,
    redirectCount: fetch.redirectCount,
  };

  try {
    const document = await recordSourceDocument({
      sourceId: source.id,
      url: fetch.requestedUrl,
      httpStatus: fetch.httpStatus,
      contentHash: fetch.contentHash,
      fetchDurationMs: fetch.durationMs,
      responseBytes: fetch.responseBytes,
      fetchStatus: fetch.fetchStatus,
      errorCode: fetch.kind === "failure" ? fetch.errorCode : null,
      errorMessage: fetch.kind === "failure" ? fetch.errorMessage : null,
      parserMetadata,
      fetchOutcome: fetch.fetchOutcome,
      finalUrl: fetch.finalUrl,
      redirectCount: fetch.redirectCount,
      contentType: fetch.contentType,
    });
    return {
      sourceId: source.id,
      sourceUrl: source.url,
      fetch,
      document,
    };
  } catch (error) {
    // The fetch itself is still useful telemetry even when the audit insert
    // fails. Never pretend the document was persisted.
    return {
      sourceId: source.id,
      sourceUrl: source.url,
      fetch,
      document: null,
    };
  }
}
