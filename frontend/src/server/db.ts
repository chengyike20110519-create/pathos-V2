import { Pool, type PoolClient } from "pg";
import type { QueryConfig, QueryResult, QueryResultRow } from "pg";

let _pool: Pool | null = null;

// The live pool's unwrapped query entry point. It is re-created together with
// the pool in getPool() and cleared by resetPool(), so a retry after a
// transport failure always resolves against the freshly created pool.
type PooledQuery = (
  queryTextOrConfig: string | QueryConfig,
  values?: unknown[],
) => Promise<QueryResult<QueryResultRow>>;
let rawPooledQuery: PooledQuery | null = null;

async function resetPool(): Promise<void> {
  const pool = _pool;
  _pool = null;
  rawPooledQuery = null;
  if (pool) await pool.end().catch(() => undefined);
}

/**
 * Supabase's shared pooler can briefly reset an idle connection or fail DNS
 * resolution on real-world networks. Retrying only those transport-level
 * failures keeps a transient blip from becoming a user-visible 503 while
 * never hiding SQL/schema errors.
 */
function isTransientDbError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return (
    ["08", "53", "57", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].some(
      (prefix) => code?.startsWith(prefix) || code === prefix,
    ) ||
    /connection (?:terminated|timeout)|timeout exceeded when trying to connect|connect ETIMEDOUT/i.test(message)
  );
}

const TRANSPORT_RETRY_ATTEMPTS = 2;

async function withTransportRetry<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < TRANSPORT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === TRANSPORT_RETRY_ATTEMPTS - 1) throw error;
      await resetPool();
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function runPooledQuery(
  queryTextOrConfig: string | QueryConfig,
  values?: unknown[],
): Promise<QueryResult<QueryResultRow>> {
  if (!rawPooledQuery) getPool();
  return rawPooledQuery!(queryTextOrConfig, values);
}

export function getPool(): Pool {
  if (_pool) return _pool;
  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new DatabaseNotConfiguredError();
  const pool = new Pool({
    connectionString: connStr,
    ...(connStr.includes("pooler.supabase.com") ? { family: 4 } : {}),
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
    // Fail fast enough for the UI to show its retry action instead of leaving
    // a school card spinning through several pooler connection timeouts.
    connectionTimeoutMillis: Number(process.env.PATHOS_DB_CONNECT_TIMEOUT_MS ?? 5_000),
    maxUses: Number(process.env.PATHOS_DB_MAX_USES ?? 5000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    // CLI import/audit scripts must be able to exit after releasing their
    // clients even though keep-alive is enabled for the web server.
    allowExitOnIdle: true,
  });
  pool.on("error", (err) => {
    // pg attaches the full client to idle-connection errors. Do not log
    // connection parameters or protocol secrets with a recoverable timeout.
    console.error("[pathos db] pool error:", { code: (err as Error & { code?: string }).code, message: err.message });
  });

  // Route every pool-level query through the transport retry so the direct
  // getPool().query call sites (backend-preview, repositories, search) get
  // the same protection as queryWithRetry. Transaction-scoped client.query
  // via withClient is deliberately NOT retried: replaying a multi-statement
  // transaction is not safe. runPooledQuery re-resolves the raw entry point
  // on every attempt, so a retry after resetPool() runs on the new pool.
  const baseQuery = pool.query.bind(pool) as PooledQuery;
  rawPooledQuery = baseQuery;
  (pool as unknown as { query: PooledQuery }).query = (queryTextOrConfig, values) =>
    withTransportRetry(() => runPooledQuery(queryTextOrConfig, values));

  _pool = pool;
  return pool;
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try { return await fn(client); } finally { client.release(); }
}

/**
 * Transport-level retry now lives at the pool level (see getPool), so this
 * is a single pooled query kept as a named helper for the health check.
 */
export async function queryWithRetry<T extends QueryResultRow = QueryResultRow>(
  query: string | QueryConfig,
  values?: readonly unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(query, values as unknown[] | undefined);
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
