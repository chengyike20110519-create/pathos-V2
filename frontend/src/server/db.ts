import { Pool, type PoolClient } from "pg";

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
    idleTimeoutMillis: Number(process.env.PATHOS_DB_IDLE_TIMEOUT_MS ?? 60_000),
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
