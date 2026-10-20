// Readiness probe, deliberately separate from /api/health.
//
// /api/health is Render's healthCheckPath and must stay liveness-only,
// so it cannot fail a deploy just because migrations are pending. This
// endpoint is the one that returns 503 when the database schema is
// behind the running code, which makes it safe to poll from ops
// checklists and post-deploy scripts without risking a rollback loop.
import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError, getPool } from "@/server/db";
import { evaluateSchemaReadiness } from "@/lib/schema-version";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const pool = getPool();
    let applied: string[] = [];
    try {
      const res = await pool.query<{ version: string }>(
        "SELECT version FROM schema_migrations",
      );
      applied = res.rows.map((r) => r.version);
    } catch (e) {
      // 42P01: schema_migrations does not exist yet, i.e. a database
      // provisioned before the migration ledger was introduced.
      if (!(typeof e === "object" && e !== null && (e as { code?: string }).code === "42P01")) {
        throw e;
      }
    }
    const schema = evaluateSchemaReadiness(applied);
    return NextResponse.json(
      {
        ok: schema.ready,
        status: schema.ready ? "ready" : "migrations_pending",
        schema: {
          ready: schema.ready,
          applied: schema.applied,
          missing: schema.missing,
          unknown: schema.unknown,
          hint: schema.ready ? null : "run: npm run db:migrate",
        },
        timestamp: new Date().toISOString(),
      },
      { status: schema.ready ? 200 : 503 },
    );
  } catch (e) {
    if (e instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        { ok: false, status: "db_not_configured", code: e.code, message: e.message },
        { status: e.status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        status: "db_unreachable",
        code: "DB_UNREACHABLE",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
