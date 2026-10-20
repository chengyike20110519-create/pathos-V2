/**
 * Apply pending SQL migrations from db/migrations in filename order.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *
 * Each file runs at most once; applied versions are recorded in the
 * schema_migrations table. Files are expected to be idempotent anyway,
 * so a re-run after a partial failure is safe.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_DIR = process.env.PATHOS_MIGRATIONS_DIR ?? path.resolve("./db/migrations");

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function main() {
  const entries = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (entries.length === 0) {
    console.log("no migrations found");
    return;
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL!.includes("supabase") || DATABASE_URL!.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const applied = new Set(
    (await client.query<{ version: string }>("SELECT version FROM schema_migrations")).rows
      .map((r) => r.version),
  );

  for (const file of entries) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      console.log(`skip  ${version} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`apply ${version} ...`);
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [version],
    );
    console.log(`done  ${version}`);
  }

  await client.end();
  console.log("migrations up to date");
}

main().catch((e) => { console.error(e); process.exit(1); });
