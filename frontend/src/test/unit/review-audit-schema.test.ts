import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

describe("review action audit migration", () => {
  const sql = readFileSync(
    resolve(ROOT, "db/migrations/010-review-actions.sql"),
    "utf8",
  );

  it("creates an append-only action table bound to a task and actor", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS review_actions/);
    expect(sql).toMatch(/review_task_id\s+TEXT NOT NULL REFERENCES review_tasks\(id\) ON DELETE RESTRICT/);
    expect(sql).toMatch(/actor_user_id\s+TEXT NOT NULL REFERENCES auth_users\(id\) ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/UPDATE review_actions/);
    expect(sql).not.toMatch(/DELETE FROM review_actions/);
  });

  it("records action and state transitions with constrained enums", () => {
    expect(sql).toMatch(/CHECK \(action IN \('approve', 'reject', 'recheck', 'stale', 'resolve'\)\)/);
    expect(sql).toMatch(/task_status_before/);
    expect(sql).toMatch(/task_status_after/);
    expect(sql).toMatch(/fact_status_before/);
    expect(sql).toMatch(/fact_status_after/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_review_actions_task/);
    expect(sql).toMatch(/INSERT INTO schema_migrations \(version\) VALUES \('010-review-actions'\)/);
  });
});
