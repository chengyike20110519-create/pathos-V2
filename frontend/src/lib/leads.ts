// Lead CRM helpers (Phase 1.6).
//
// subscription_leads is filled by three intake surfaces:
//   - /api/leads (footer CTA, /pricing form)
//   - /api/reports/generate (creates a lead row implicitly via plan)
//   - paid checkout when we wire one up
// The CRM here is the operator-facing view of those rows.
//
// Status taxonomy (canonical, used by /admin/leads filter chips):
//   new          -> just came in, no contact attempt yet
//   contacted    -> first call/WeChat reply sent
//   qualified    -> needs confirmed (timeline, budget, family buy-in)
//   converted    -> paid or upgraded to a paid plan
//   lost         -> explicitly declined or went cold
//   closed       -> archived after a long silence
//
// These are an application-level enum; the DB column is a free TEXT
// so historical rows that pre-date this taxonomy still load.

import { getPool } from "@/server/db";

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
  "closed",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PLANS = [
  "lead_intake",
  "single_report",
  "advisor_annual",
] as const;
export type LeadPlan = (typeof LEAD_PLANS)[number];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isLeadPlan(value: unknown): value is LeadPlan {
  return typeof value === "string" && (LEAD_PLANS as readonly string[]).includes(value);
}

export interface Lead {
  id: string;
  plan: string;
  contactName: string | null;
  phone: string | null;
  wechat: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  source: string | null;
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LeadStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  byPlan: Record<LeadPlan, number>;
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function rowToLead(row: Record<string, unknown>): Lead {
  const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? (row.meta as Record<string, unknown>)
    : {};
  return {
    id: String(row.id),
    plan: String(row.plan ?? "lead_intake"),
    contactName: row.contact_name == null ? null : String(row.contact_name),
    phone: row.phone == null ? null : String(row.phone),
    wechat: row.wechat == null ? null : String(row.wechat),
    email: row.email == null ? null : String(row.email),
    company: row.company == null ? null : String(row.company),
    notes: row.notes == null ? null : String(row.notes),
    source: row.source == null ? null : String(row.source),
    status: String(row.status ?? "new"),
    meta,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ""),
  };
}

interface ListArgs {
  status?: LeadStatus;
  plan?: LeadPlan;
  limit?: number;
  cursor?: string | null; // ISO created_at of the last row from the previous page
}

export interface ListResult {
  leads: Lead[];
  nextCursor: string | null;
}

// Cursor pagination on created_at DESC. We use id as the tie-breaker
// because two leads can be created in the same millisecond; without
// the secondary sort, paging could skip or duplicate rows.
export async function listLeads(args: ListArgs = {}): Promise<ListResult> {
  const limit = clampLimit(args.limit);
  const params: unknown[] = [];
  const where: string[] = [];
  if (args.status) {
    params.push(args.status);
    where.push(`status = $${params.length}`);
  }
  if (args.plan) {
    params.push(args.plan);
    where.push(`plan = $${params.length}`);
  }
  if (args.cursor) {
    params.push(args.cursor);
    // Compound keyset: (created_at, id) strictly less than the cursor.
    where.push(`(created_at, id) < ($${params.length}::timestamptz, 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')`);
  }
  const sql = `SELECT id, plan, contact_name, phone, wechat, email, company,
                      notes, source, status, meta, created_at, updated_at
                 FROM subscription_leads
                ${where.length ? "WHERE " + where.join(" AND ") : ""}
                ORDER BY created_at DESC, id DESC
                LIMIT ${limit + 1}`;
  const r = await getPool().query(sql, params);
  const rows = r.rows.map(rowToLead);
  const hasMore = rows.length > limit;
  const leads = hasMore ? rows.slice(0, limit) : rows;
  const last = leads[leads.length - 1];
  const nextCursor = hasMore && last ? last.createdAt : null;
  return { leads, nextCursor };
}

export async function getLead(id: string): Promise<Lead | null> {
  if (!id || id.length > 64) return null;
  const r = await getPool().query(
    `SELECT id, plan, contact_name, phone, wechat, email, company,
            notes, source, status, meta, created_at, updated_at
       FROM subscription_leads
      WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return row ? rowToLead(row) : null;
}

interface UpdateArgs {
  status?: LeadStatus;
  notes?: string | null;
}

export async function updateLead(id: string, args: UpdateArgs): Promise<Lead | null> {
  if (!id || id.length > 64) return null;
  if (args.status === undefined && args.notes === undefined) {
    return getLead(id);
  }
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  if (args.status !== undefined) {
    if (!isLeadStatus(args.status)) return null;
    params.push(args.status);
    sets.push(`status = $${params.length}`);
  }
  if (args.notes !== undefined) {
    params.push(args.notes);
    sets.push(`notes = $${params.length}`);
  }
  params.push(id);
  const r = await getPool().query(
    `UPDATE subscription_leads
        SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING id, plan, contact_name, phone, wechat, email, company,
                notes, source, status, meta, created_at, updated_at`,
    params,
  );
  const row = r.rows[0];
  return row ? rowToLead(row) : null;
}

export async function getLeadStats(): Promise<LeadStats> {
  const r = await getPool().query(
    `SELECT status, plan, COUNT(*)::int AS n
       FROM subscription_leads
      GROUP BY status, plan`,
  );
  const byStatus: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    converted: 0,
    lost: 0,
    closed: 0,
  };
  const byPlan: Record<LeadPlan, number> = {
    lead_intake: 0,
    single_report: 0,
    advisor_annual: 0,
  };
  let total = 0;
  for (const row of r.rows as Array<{ status: string; plan: string; n: number }>) {
    total += row.n;
    if (isLeadStatus(row.status)) byStatus[row.status] = (byStatus[row.status] ?? 0) + row.n;
    if (isLeadPlan(row.plan)) byPlan[row.plan] = (byPlan[row.plan] ?? 0) + row.n;
  }
  return { total, byStatus, byPlan };
}
