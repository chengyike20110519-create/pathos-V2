import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import { evaluateSchemaReadiness, type SchemaReadiness } from "@/lib/schema-version";

export const dynamic = "force-dynamic";

function resolveMode(): string {
  const raw = process.env.PATHOS_DATA_MODE?.trim();
  if (raw) return raw;
  // Default: when PATHOS_DATA_MODE is unset, treat the deployment as
  // the backend BFF (matching resolveDataMode() in pathos-preview.ts).
  // This removes the historical "mode: unknown" from /api/health.
  return "backend";
}

// Read the applied migration ledger. A database provisioned before the
// ledger existed has no schema_migrations table at all (SQLSTATE 42P01);
// that is a readiness problem, not an outage, so we report it as zero
// applied migrations rather than letting the error bubble up.
async function readSchemaReadiness(
  pool: ReturnType<typeof getPool>,
): Promise<SchemaReadiness> {
  try {
    const res = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    return evaluateSchemaReadiness(res.rows.map((r) => r.version));
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "42P01") {
      return evaluateSchemaReadiness([]);
    }
    throw e;
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const pool = getPool();
    const uniCount = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM universities",
    );
    const detailCount = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM university_details",
    );
    const manifestRow = await pool.query<{ updated_at: string }>(
      "SELECT updated_at FROM manifest WHERE id = 1",
    );
    const schema = await readSchemaReadiness(pool);
    // This route is Render's healthCheckPath, so it reports liveness
    // only: the service is up whenever the database answers. Pending
    // migrations are reported in the payload but must NOT fail the
    // check, otherwise deploying new code against a not-yet-migrated
    // database would roll back a perfectly serviceable release.
    // Readiness has its own endpoint: /api/ready.
    return NextResponse.json({
      ok: true,
      status: schema.ready ? "ok" : "degraded",
      mode: resolveMode(),
      universities: uniCount.rows[0]?.n ?? 0,
      universityDetails: detailCount.rows[0]?.n ?? 0,
      manifestUpdatedAt: manifestRow.rows[0]?.updated_at ?? null,
      schema: {
        ready: schema.ready,
        applied: schema.applied,
        missing: schema.missing,
        unknown: schema.unknown,
        hint: schema.ready ? null : "run: npm run db:migrate",
      },
      nodeEnv: process.env.NODE_ENV ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, code: e.code, message: e.message },
        { status: e.status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "DB_UNREACHABLE",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
