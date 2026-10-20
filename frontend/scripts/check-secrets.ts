/**
 * Secret-pattern scanner for frontend/.env.local.
 *
 * Runs before dev / build / start. Detects entries that look like
 * real production credentials (e.g., a populated postgresql:// URL
 * rather than the [password] placeholder shipped in .env.example).
 *
 * Behaviour:
 *   - Reads frontend/.env.local line by line.
 *   - Looks at secret-bearing keys (DATABASE_URL, PATHOS_BACKEND_BASE_URL).
 *   - Skips values that match the placeholder patterns below.
 *   - In dev mode: prints a loud WARNING and exits 0 (does not block).
 *   - In production mode (NODE_ENV=production): prints WARNING and
 *     exits 1, forcing the operator to fix the file or set secrets
 *     through the deployment env vars instead.
 *
 * Override (NOT recommended):
 *   - PATHOS_SKIP_SECRET_CHECK=1 (any mode)
 *   - --skip CLI flag
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILE = resolve(process.cwd(), ".env.local");

// Keys that should NEVER carry real values in the local checkout.
const SECRET_KEYS = ["DATABASE_URL", "PATHOS_BACKEND_BASE_URL"];

// Recognized placeholder patterns. Values matching any of these are OK.
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^\[[^\]]+\]$/i,                       // [password], [ref], etc.
  /^<[^>]+>$/i,                          // <set-via-ops>
  /^PLACEHOLDER/i,                       // PLACEHOLDER_xxx
  /^YOUR[_-].*/i,                        // YOUR_TOKEN_HERE
  /^SET[_-].*/i,                         // SET_VIA_OPS
  /^EXAMPLE$/i,
  // .env.example style template URL with inline [placeholder] tokens.
  /^postgresql?:\/\/[^/\s]*\[[^\]]+\][^@]*@/i,
  // Empty string after trimming.
  /^$/,
];

const isProduction = process.env.NODE_ENV === "production";
const skipCheck =
  process.env.PATHOS_SKIP_SECRET_CHECK === "1" ||
  process.argv.includes("--skip");

if (skipCheck) {
  console.log("[check-secrets] skipped (override flag set)");
  process.exit(0);
}

if (!existsSync(ENV_FILE)) {
  console.log("[check-secrets] .env.local not found - skipping");
  process.exit(0);
}

const lines = readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
type Finding = { line: number; key: string; preview: string };
const findings: Finding[] = [];

for (let idx = 0; idx < lines.length; idx += 1) {
  const raw = lines[idx];
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  const key = trimmed.slice(0, eq).trim();
  if (!SECRET_KEYS.includes(key)) continue;
  const value = trimmed.slice(eq + 1).trim();
  if (!value) continue;
  const isPlaceholder = PLACEHOLDER_PATTERNS.some((re) => re.test(value));
  if (isPlaceholder) continue;
  findings.push({
    line: idx + 1,
    key,
    preview: value.length > 30 ? `${value.slice(0, 30)}...` : value,
  });
}

if (findings.length === 0) {
  console.log("[check-secrets] OK - no real-looking credentials in .env.local");
  process.exit(0);
}

const banner = [
  "",
  "=========================================================",
  "[check-secrets] WARNING: .env.local may contain real secrets",
  "=========================================================",
  ...findings.map((f) => `  line ${f.line}: ${f.key} = ${f.preview}`),
  "",
  isProduction
    ? "Failing because NODE_ENV=production."
    : "Dev mode: warning only. Replace with placeholder values from .env.example.",
  "Override (not recommended): PATHOS_SKIP_SECRET_CHECK=1 or --skip",
  "See frontend/SECURITY.md for rotation + safe-handling procedure.",
  "=========================================================",
  "",
];

if (isProduction) {
  console.error(banner.join("\n"));
  process.exit(1);
}
console.warn(banner.join("\n"));
process.exit(0);
