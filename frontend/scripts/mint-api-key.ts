/**
 * Admin CLI: mint a new API key for the data API (opportunity A).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... tsx scripts/mint-api-key.ts \
 *     --label "IECG internal dashboard" --scopes "universities.read,reports.write"
 *
 * Prints the plaintext secret ONCE and writes the SHA-256 hash into
 * the api_keys table. There is no way to recover the plaintext
 * afterwards; the secret must be saved at mint time.
 */
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1); }

interface Args {
  label: string;
  scopes: string;
  rateLimit: number;
  monthlyQuota: number;
}

function parseArgs(): Args {
  const out: Partial<Args> & Record<string, unknown> = { scopes: "universities.read", rateLimit: 60, monthlyQuota: 10000 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--label") { out.label = v; i++; }
    else if (k === "--scopes") { out.scopes = v; i++; }
    else if (k === "--rate-limit") { out.rateLimit = Number.parseInt(v ?? "60", 10); i++; }
    else if (k === "--monthly-quota") { out.monthlyQuota = Number.parseInt(v ?? "10000", 10); i++; }
  }
  if (!out.label) {
    console.error("--label is required");
    process.exit(1);
  }
  return out as Args;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function main() {
  const args = parseArgs();
  const secret = `pk_${randomBytes(24).toString("base64url")}`;
  const prefix = secret.slice(0, 8);
  const hash = sha256(secret);
  const id = `key_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Idempotent table creation so this script can be run before
  // db:reset has been called.
  await client.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id              TEXT PRIMARY KEY,
      owner_label     TEXT NOT NULL,
      key_prefix      TEXT NOT NULL,
      key_hash        TEXT NOT NULL UNIQUE,
      scopes          TEXT NOT NULL DEFAULT 'universities.read',
      rate_limit      INTEGER NOT NULL DEFAULT 60,
      monthly_quota   INTEGER NOT NULL DEFAULT 10000,
      calls_this_month INTEGER NOT NULL DEFAULT 0,
      quota_reset_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
      status          TEXT NOT NULL DEFAULT 'active',
      last_used_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(
    `INSERT INTO api_keys (id, owner_label, key_prefix, key_hash, scopes, rate_limit, monthly_quota)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, args.label, prefix, hash, args.scopes, args.rateLimit, args.monthlyQuota],
  );
  await client.end();

  console.log("\n=== API Key Created ===");
  console.log(`id:        ${id}`);
  console.log(`label:     ${args.label}`);
  console.log(`scopes:    ${args.scopes}`);
  console.log(`rate/min:  ${args.rateLimit}`);
  console.log(`quota/mo:  ${args.monthlyQuota}`);
  console.log(`\nsecret:    ${secret}`);
  console.log("\n>>> SAVE THE SECRET NOW. The hash is stored in the DB, but the plaintext is shown only this once. <<<\n");
}

main().catch((e) => { console.error(e); process.exit(1); });