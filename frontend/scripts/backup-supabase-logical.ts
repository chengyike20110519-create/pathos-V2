import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DIRECT_URL or DATABASE_URL is required");

const outputDir = path.resolve(process.env.PATHOS_BACKUP_DIR ?? "./backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(outputDir, `pathos-logical-${stamp}.json`);

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 10_000,
  query_timeout: 120_000,
  statement_timeout: 120_000,
  ssl: databaseUrl.includes("supabase") || databaseUrl.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
await mkdir(outputDir, { recursive: true });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
  const tables = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const snapshot: { format: string; createdAt: string; tables: unknown[] } = {
    format: "pathos-logical-backup-v1",
    createdAt: new Date().toISOString(),
    tables: [],
  };
  for (const { table_name: tableName } of tables.rows) {
    console.error(`backup table ${tableName}`);
    const columns = await client.query(
      `SELECT column_name, data_type, udt_name, is_nullable, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );
    const quotedTable = `"${tableName.replace(/"/g, '""')}"`;
    const rows: unknown[] = [];
    const hasNumericId = columns.rows.some((column: { column_name: string; data_type: string }) =>
      column.column_name === "id" && ["integer", "bigint", "numeric"].includes(column.data_type));
    for (let offset = 0, lastId = 0; ; offset += 1) {
      const page = hasNumericId
        ? await client.query(`SELECT * FROM public.${quotedTable} WHERE id > $1 ORDER BY id LIMIT 1`, [lastId])
        : await client.query(`SELECT * FROM public.${quotedTable} LIMIT 1 OFFSET $1`, [offset]);
      rows.push(...page.rows);
      if (page.rows.length < 1) break;
      if (hasNumericId) lastId = Number((page.rows[0] as { id: number }).id);
    }
    snapshot.tables.push({ tableName, columns: columns.rows, rows });
  }
  await client.query("COMMIT");
  const body = JSON.stringify(snapshot, null, 2);
  await writeFile(outputPath, body, { mode: 0o600 });
  const sha256 = createHash("sha256").update(body).digest("hex");
  await writeFile(`${outputPath}.sha256`, `${sha256}  ${path.basename(outputPath)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ outputPath, sha256, tableCount: snapshot.tables.length }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "logical backup failed");
  process.exitCode = 1;
});
