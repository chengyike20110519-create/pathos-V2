export const CAMPUS_EDITION_SIZE = 6;
const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One shared edition per Shanghai calendar day, independent of device timezone. */
export function getCampusEdition(now = Date.now()) {
  const day = Math.floor((now + SHANGHAI_OFFSET_MS) / DAY_MS);
  const date = new Date(day * DAY_MS).toISOString().slice(0, 10);
  return { seed: `campus-${date}`, date, nextAt: (day + 1) * DAY_MS - SHANGHAI_OFFSET_MS };
}

export function campusEditionDay(seed: string): number | null {
  if (!/^campus-\d{4}-\d{2}-\d{2}$/.test(seed)) return null;
  const date = seed.slice(7);
  const stamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? stamp / DAY_MS : null;
}

/** A bounded, gentle return journey; no cloned interactive cards or jump cuts. */
export function stepCampusRail(position: number, direction: 1 | -1, elapsedMs: number, max: number) {
  if (max <= 0) return { position: 0, direction: 1 as const };
  const next = Math.max(0, Math.min(max, position + direction * 28 * Math.max(0, elapsedMs) / 1000));
  return { position: next, direction: (next >= max ? -1 : next <= 0 ? 1 : direction) as 1 | -1 };
}
