import type { CampusDiscoveryPage, CampusDiscoverySource } from "@/domain/campus-discovery";
import { parseUniversitySummaryList } from "./dataset.schema";
import { ValidationError } from "./validators";

function invalid(): never {
  throw new ValidationError([{ path: "campus-discovery", message: "Invalid campus discovery response" }]);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value;
}
function https(value: unknown): string {
  const raw = text(value);
  try { const url = new URL(raw); if (url.protocol === "https:" && !url.username && !url.password) return raw; } catch { /* reject */ }
  return invalid();
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}

export function parseCampusDiscoveryPage(raw: unknown): CampusDiscoveryPage {
  const root = object(raw);
  const total = integer(root.total);
  const offset = integer(root.offset);
  const seed = text(root.seed);
  if (!Array.isArray(root.cards) || root.cards.length > 12) return invalid();
  const seen = new Set<string>();
  const cards = root.cards.map((rawCard) => {
    const card = object(rawCard);
    const [summary] = parseUniversitySummaryList([card.summary]);
    if (seen.has(summary.id)) return invalid();
    seen.add(summary.id);
    let photo = null;
    if (card.photo !== null) {
      const item = object(card.photo);
      photo = { id: text(item.id), url: https(item.url), label: text(item.label), sourceUrl: https(item.sourceUrl), publisher: text(item.publisher) };
    }
    let overview = null;
    if (card.overview !== null) {
      const item = object(card.overview);
      if (item.storage !== "reviewed_file" && item.storage !== "supabase" || typeof item.hasIndexedSources !== "boolean" || typeof item.indexOnly !== "boolean" || !Array.isArray(item.sources) || !item.sources.length) return invalid();
      const sources: CampusDiscoverySource[] = item.sources.map((rawSource) => {
        const source = object(rawSource);
        if (source.accessMethod !== "live_official_page" && source.accessMethod !== "official_search_index") return invalid();
        return { url: https(source.url), title: text(source.title), accessMethod: source.accessMethod };
      });
      const description = text(item.text);
      const checkedOn = text(item.checkedOn);
      if (description.length > 600 || !/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) return invalid();
      if (item.indexOnly !== sources.every((source) => source.accessMethod === "official_search_index") || item.hasIndexedSources !== sources.some((source) => source.accessMethod === "official_search_index")) return invalid();
      overview = { text: description, checkedOn, storage: item.storage as "reviewed_file" | "supabase", hasIndexedSources: item.hasIndexedSources, indexOnly: item.indexOnly, sources };
    }
    let motto = null;
    if (card.motto !== undefined && card.motto !== null) {
      const item = object(card.motto);
      if (typeof item.text !== "string" || (item.status !== "confirmed" && item.status !== "candidate")) return invalid();
      if (item.sourceUrl !== null && item.sourceUrl !== undefined) https(item.sourceUrl);
      motto = { text: item.text, textZh: typeof item.textZh === "string" ? item.textZh : null, status: item.status as "confirmed" | "candidate", sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null };
    }
    return { summary, photo, overview, motto };
  });
  const end = offset + cards.length;
  if (cards.length && end > total) return invalid();
  const nextOffset = root.nextOffset === null ? null : integer(root.nextOffset);
  if (nextOffset !== (end < total ? end : null)) return invalid();
  if (nextOffset !== null && !cards.length) return invalid();
  return { cards, total, offset, nextOffset, seed };
}
