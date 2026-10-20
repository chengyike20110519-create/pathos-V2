import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DbResult = { rows: Record<string, unknown>[]; rowCount: number };
const queryMock = vi.hoisted(() =>
  vi.fn((_q: string, _p: unknown[]): Promise<DbResult> =>
    Promise.resolve({ rows: [], rowCount: 0 }),
  ),
);
function mockQuery(impl: (q: string, p: unknown[]) => Promise<DbResult>): void {
  queryMock.mockImplementation(impl);
}

vi.mock("@/server/db", () => ({
  getPool: () => ({ query: (q: string, p: unknown[]) => queryMock(q, p) as any }),
}));

import {
  FACT_APPLICANT_SCOPES,
  FACT_ENTITY_TYPES,
  FACT_NULL_REASONS,
  FACT_REVIEW_STATUSES,
  FACT_VALUE_TYPES,
  hasFactValue,
  isFactEntityType,
  isFactValueType,
  validateFactValue,
  type FactDraft,
} from "@/domain/information/fact";
import {
  SOURCE_AUTHORITIES,
  SOURCE_TYPES,
  isSourceAuthority,
  isSourceType,
  type SourceDocumentDraft,
  type SourceDraft,
} from "@/domain/information/source";
import {
  buildFactKey,
  listApprovedFacts,
  listFactRevisions,
  setFactReviewStatus,
  upsertFact,
} from "@/server/information/fact-repository";
import {
  recordSourceDocument,
  registerSource,
} from "@/server/information/source-repository";

const ROOT = resolve(__dirname, "../../..");
const NOW = new Date("2026-10-15T08:00:00Z");

function factDraft(extra: Partial<FactDraft> = {}): FactDraft {
  return {
    entityType: "university",
    entityId: "massachusetts-institute-of-technology",
    fieldKey: "admission.acceptance_rate",
    valueType: "percent",
    valueNumber: 4.5,
    academicYear: "2025-2026",
    applicantScope: "all",
    sourceId: "src_1",
    sourceUrl: "https://example.edu/admissions",
    retrievedAt: NOW,
    confidence: "high",
    ...extra,
  };
}

function sourceDraft(extra: Partial<SourceDraft> = {}): SourceDraft {
  return {
    name: "MIT Admissions",
    url: "https://example.edu/admissions",
    authority: "A",
    sourceType: "official_html",
    publisher: "MIT",
    licenseNote: "Public institutional page",
    ...extra,
  };
}

function upsertRow(revision: number): Record<string, unknown> {
  return {
    id: `frev_${revision}`,
    fact_id: "fact_1",
    revision_number: revision,
    entity_type: "university",
    entity_id: "massachusetts-institute-of-technology",
    field_key: "admission.acceptance_rate",
    value_type: "percent",
    value_number: "4.5",
    value_text: null,
    value_boolean: null,
    value_range_min: null,
    value_range_max: null,
    value_list: null,
    unit: "%",
    currency: null,
    academic_year: "2025-2026",
    effective_from: null,
    effective_to: null,
    applicant_scope: "all",
    source_id: "src_1",
    source_document_id: "doc_1",
    source_url: "https://example.edu/admissions",
    retrieved_at: NOW,
    reviewed_at: null,
    review_status: "pending",
    confidence: "high",
    null_reason: null,
    notes: null,
    change_reason: "annual update",
    created_at: NOW,
    current_revision: revision,
    fact_created_at: NOW,
    fact_updated_at: NOW,
  };
}

function sourceRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "src_1",
    name: "MIT Admissions",
    url: "https://example.edu/admissions",
    authority: "A",
    source_type: "official_html",
    publisher: "MIT",
    license_note: "Public institutional page",
    parser_name: "generic",
    rate_limit_seconds: 3600,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    ...extra,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  mockQuery(async () => ({ rows: [], rowCount: 0 }));
});

afterEach(() => {
  queryMock.mockReset();
});

describe("information taxonomy", () => {
  it("keeps source authority and source type enums closed", () => {
    for (const authority of SOURCE_AUTHORITIES) expect(isSourceAuthority(authority)).toBe(true);
    expect(isSourceAuthority("G")).toBe(false);
    expect(isSourceAuthority("official")).toBe(false);

    for (const type of SOURCE_TYPES) expect(isSourceType(type)).toBe(true);
    expect(isSourceType("website")).toBe(false);
    expect(isSourceType("")).toBe(false);
  });

  it("keeps fact enums closed", () => {
    for (const type of FACT_ENTITY_TYPES) expect(isFactEntityType(type)).toBe(true);
    for (const type of FACT_VALUE_TYPES) expect(isFactValueType(type)).toBe(true);
    expect(FACT_REVIEW_STATUSES).toEqual(["pending", "approved", "rejected", "stale"]);
    expect(FACT_APPLICANT_SCOPES).toEqual(["all", "international", "undergraduate", "graduate"]);
    expect(FACT_NULL_REASONS).toContain("not_reported");
    expect(FACT_NULL_REASONS).toContain("source_blocked");
    expect(FACT_NULL_REASONS).not.toContain("unknown");
  });

  it("validates values without silently coercing missing data", () => {
    expect(validateFactValue("percent", { valueNumber: 4.5 }).ok).toBe(true);
    expect(validateFactValue("percent", { valueNumber: 120 }).ok).toBe(false);
    expect(validateFactValue("range", { valueRange: { min: 2, max: 1 } }).ok).toBe(false);
    expect(validateFactValue("boolean", { valueText: "yes" }).ok).toBe(false);
    expect(validateFactValue("list", { valueList: [] }).ok).toBe(false);
    expect(hasFactValue({ valueNumber: null })).toBe(false);
  });
});

describe("source repository", () => {
  it("registers a source with a URL conflict target", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/INSERT INTO sources/);
      expect(q).toMatch(/ON CONFLICT \(url\) DO UPDATE/);
      expect(p[2]).toBe("https://example.edu/admissions");
      expect(p[3]).toBe("A");
      return { rows: [sourceRow()], rowCount: 1 };
    });
    const source = await registerSource(sourceDraft());
    expect(source.id).toBe("src_1");
    expect(source.authority).toBe("A");
  });

  it("rejects invalid source URLs and invalid fetch statuses", async () => {
    await expect(registerSource(sourceDraft({ url: "ftp://example.edu" }))).rejects.toThrow(/http or https/);
    const draft: SourceDocumentDraft = {
      sourceId: "src_1",
      url: "https://example.edu/admissions",
      fetchStatus: "unknown" as never,
      fetchOutcome: "failed",
    };
    await expect(recordSourceDocument(draft)).rejects.toThrow(/invalid source document status/);
  });

  it("requires a content hash for successful documents", async () => {
    const draft: SourceDocumentDraft = {
      sourceId: "src_1",
      url: "https://example.edu/admissions",
      fetchStatus: "succeeded",
      fetchOutcome: "changed",
    };
    await expect(recordSourceDocument(draft)).rejects.toThrow(/contentHash/);
  });

  it("records failed retrieval attempts without rewriting facts", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/INSERT INTO source_documents/);
      expect(p[7]).toBe("failed");
      expect(p[4]).toBeNull();
      return {
        rows: [{
          id: "doc_1",
          source_id: "src_1",
          url: "https://example.edu/admissions",
          fetched_at: NOW,
          http_status: 503,
          content_hash: null,
          fetch_duration_ms: 100,
          response_bytes: null,
          fetch_status: "failed",
          error_code: "UPSTREAM_503",
          error_message: "service unavailable",
          parser_metadata: {},
          created_at: NOW,
        }],
        rowCount: 1,
      };
    });
    const doc = await recordSourceDocument({
      sourceId: "src_1",
      url: "https://example.edu/admissions",
      fetchStatus: "failed",
      httpStatus: 503,
      fetchDurationMs: 100,
      errorCode: "UPSTREAM_503",
      errorMessage: "service unavailable",
      fetchOutcome: "failed",
    });
    expect(doc.fetchStatus).toBe("failed");
    expect(doc.contentHash).toBeNull();
  });
});

describe("fact repository", () => {
  it("builds a stable scoped fact key", () => {
    const a = buildFactKey(factDraft());
    const b = buildFactKey(factDraft({
      entityId: " massachusetts-institute-of-technology ",
    }));
    const c = buildFactKey(factDraft({ applicantScope: "international" }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("upserts a fact and writes revision 1 in one statement", async () => {
    mockQuery(async (q) => {
      expect(q).toMatch(/INSERT INTO facts/);
      expect(q).toMatch(/ON CONFLICT \(fact_key\) DO UPDATE/);
      expect(q).toMatch(/INSERT INTO fact_revisions/);
      return { rows: [upsertRow(1)], rowCount: 1 };
    });
    const result = await upsertFact(factDraft());
    expect(result.fact.currentRevision).toBe(1);
    expect(result.revision.revisionNumber).toBe(1);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("increments revision numbers on a scoped fact update", async () => {
    mockQuery(async (q) => {
      expect(q).toMatch(/current_revision = facts\.current_revision \+ 1/);
      return {
        rows: [{ ...upsertRow(2), change_reason: "CDS annual update" }],
        rowCount: 1,
      };
    });
    const result = await upsertFact(factDraft({
      valueNumber: 4.8,
      changeReason: "CDS annual update",
    }));
    expect(result.fact.currentRevision).toBe(2);
    expect(result.revision.revisionNumber).toBe(2);
    expect(result.revision.changeReason).toBe("CDS annual update");
  });

  it("rejects contradictory null reasons and invalid ranges", async () => {
    await expect(upsertFact(factDraft({
      nullReason: "not_reported",
    }))).rejects.toThrow(/cannot also carry a value/);
    await expect(upsertFact(factDraft({
      valueType: "range",
      valueNumber: undefined,
      valueRange: { min: 1500, max: 1400 },
    }))).rejects.toThrow(/min cannot exceed max/);
  });

  it("only exposes approved facts that are currently effective", async () => {
    mockQuery(async (q) => {
      expect(q).toMatch(/review_status = 'approved'/);
      expect(q).toMatch(/effective_to IS NULL OR effective_to >= NOW\(\)/);
      expect(q).toMatch(/entity_type = \$1/);
      expect(q).toMatch(/entity_id = \$2/);
      return { rows: [], rowCount: 0 };
    });
    const rows = await listApprovedFacts({
      entityType: "university",
      entityId: "mit",
    });
    expect(rows).toEqual([]);
  });

  it("records review state transitions on the current fact", async () => {
    mockQuery(async (q, p) => {
      expect(q).toMatch(/UPDATE facts/);
      expect(q).toMatch(/UPDATE fact_revisions/);
      expect(q).toMatch(/r\.revision_number = f\.current_revision/);
      expect(q).toMatch(/review_status = \$2/);
      expect(p[1]).toBe("approved");
      return {
        rows: [{
          ...sourceRow(),
          ...upsertRow(1),
          id: "fact_1",
          fact_key: "fact-key-1",
        }],
        rowCount: 1,
      };
    });
    const fact = await setFactReviewStatus("fact_1", "approved");
    expect(fact?.id).toBe("fact_1");
  });

  it("returns revisions in descending order", async () => {
    mockQuery(async (q) => {
      expect(q).toMatch(/FROM fact_revisions/);
      expect(q).toMatch(/ORDER BY revision_number DESC/);
      return { rows: [upsertRow(2), upsertRow(1)], rowCount: 2 };
    });
    const revisions = await listFactRevisions("fact_1");
    expect(revisions.map((r) => r.revisionNumber)).toEqual([2, 1]);
  });
});

describe("migration contract", () => {
  it("creates all six information-platform tables idempotently", () => {
    const sql = readFileSync(
      resolve(ROOT, "db/migrations/008-information-platform.sql"),
      "utf8",
    );
    for (const table of [
      "sources",
      "source_documents",
      "facts",
      "fact_revisions",
      "review_tasks",
      "information_events",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    }
    expect(sql).toMatch(/UNIQUE INDEX IF NOT EXISTS uq_source_documents_hash/);
    expect(sql).toMatch(/fact_key\s+TEXT NOT NULL UNIQUE/);
    expect(sql).toMatch(/UNIQUE \(fact_id, revision_number\)/);
    expect(sql).toMatch(/UNIQUE \(id, fact_id\)/);
    expect(sql).toMatch(/UNIQUE \(id, source_id\)/);
    expect(sql).toMatch(/FOREIGN KEY \(source_document_id, source_id\)\s+REFERENCES source_documents\(id, source_id\)/);
    expect(sql).toMatch(/FOREIGN KEY \(from_revision_id, fact_id\) REFERENCES fact_revisions\(id, fact_id\)/);
    expect(sql).toMatch(/FOREIGN KEY \(fact_id, source_id\) REFERENCES facts\(id, source_id\)/);
    expect(sql).toMatch(/INSERT INTO schema_migrations \(version\) VALUES \('008-information-platform'\)/);
  });
});
