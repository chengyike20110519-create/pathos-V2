import { Pool, type PoolClient } from "pg";
import type { QueryConfig, QueryResult, QueryResultRow } from "pg";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new DatabaseNotConfiguredError();
  _pool = new Pool({
    connectionString: connStr,
    ssl: connStr.includes("supabase") || connStr.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
    // Supabase's shared pooler already multiplexes connections. A small
    // application pool avoids exhausting the free-tier connection budget;
    // the explicit env override remains available for a larger deployment.
    max: Number(process.env.PATHOS_DB_POOL_MAX ?? (/pgbouncer=true|pooler\.supabase\.com:6543/.test(connStr) ? 5 : 10)),
    // Keep one reusable application-side connection for the map/detail
    // workload. This avoids reopening a cold Supabase pooler connection
    // between nearby school-card requests while remaining tiny on free tier.
    min: Number(process.env.PATHOS_DB_POOL_MIN ?? 1),
    idleTimeoutMillis: Number(process.env.PATHOS_DB_IDLE_TIMEOUT_MS ?? 300_000),
    connectionTimeoutMillis: Number(process.env.PATHOS_DB_CONNECT_TIMEOUT_MS ?? 10_000),
    maxUses: Number(process.env.PATHOS_DB_MAX_USES ?? 5000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    // CLI import/audit scripts must be able to exit after releasing their
    // clients even though keep-alive is enabled for the web server.
    allowExitOnIdle: true,
  });
  _pool.on("error", (err) => {
    // pg attaches the full client to idle-connection errors. Do not log
    // connection parameters or protocol secrets with a recoverable timeout.
    console.error("[pathos db] pool error:", { code: (err as Error & { code?: string }).code, message: err.message });
  });
  return _pool;
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try { return await fn(client); } finally { client.release(); }
}

/**
 * Retries only transport-level failures. Supabase's shared pooler can briefly
 * reset an idle connection or fail DNS resolution; retrying those failures
 * keeps a transient network blip from becoming a user-visible 503 while
 * never hiding SQL/schema errors.
 */
export async function queryWithRetry<T extends QueryResultRow = QueryResultRow>(
  query: string | QueryConfig,
  values?: readonly unknown[],
  attempts = 3,
): Promise<QueryResult<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getPool().query<T>(query, values as unknown[] | undefined);
    } catch (error) {
      lastError = error;
      const code = typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
      const message = error instanceof Error ? error.message : String(error);
      const transient = ["08", "53", "57", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].some((prefix) => code?.startsWith(prefix) || code === prefix) || /connection (?:terminated|timeout)|timeout exceeded when trying to connect|connect ETIMEDOUT/i.test(message);
      if (!transient || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

export class DatabaseNotConfiguredError extends Error {
  readonly code = "DATABASE_NOT_CONFIGURED";
  readonly status = 503;
  readonly retryable = false;
  readonly featureStatus = "unavailable";
  constructor() {
    super("DATABASE_URL is not configured. Set it in environment variables.");
    this.name = "DatabaseNotConfiguredError";
  }
}
