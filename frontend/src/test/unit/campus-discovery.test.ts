import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeStage5Summary, parseStage5Summaries } from "@/schemas/stage5-preview.schema";
import { parseCampusDiscoveryPage } from "@/schemas/campus-discovery.schema";
import type { CampusDiscoveryCard } from "@/domain/campus-discovery";
import { getSchoolNamePair } from "@/lib/school-name";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/server/db", async (original) => ({ ...await original<typeof import("@/server/db")>(), getPool: () => ({ query }) }));
const raw = JSON.parse(readFileSync("data/preview/universities.json", "utf8"));
const cards: CampusDiscoveryCard[] = parseStage5Summaries(raw).map((item) => ({ summary: normalizeStage5Summary(item), photo: null, overview: null }));
const rows = raw.map((school: Record<string, unknown>) => ({
  id: school.id, name: school.name, chinese_name: school.nameZh, city: school.city, state: school.state,
  latitude: school.latitude, longitude: school.longitude, ranking_summary: school.rankingSummary,
  display_tier: "preview", preview_only: true, dataset_version: school.datasetVersion,
  ranking_tier: school.rankingTier,
}));

describe("campus discovery", () => {
  beforeEach(() => { vi.resetModules(); query.mockReset(); query.mockResolvedValue({ rows }); });

  it("always exposes both names without fabricating a Chinese translation", () => {
    expect(getSchoolNamePair({ name: "Yale University", nameZh: "耶鲁大学", chineseName: "耶鲁大学" })).toEqual({ zh: "耶鲁大学", en: "Yale University", missingChinese: false });
    expect(getSchoolNamePair({ name: "Example University", nameZh: "Example University", chineseName: "Example University" })).toEqual({ zh: "中文名称待补充", en: "Example University", missingChinese: true });
  });

  it("keeps the map marker label bilingual when a marker is selected", () => {
    const source = readFileSync("src/components/map/UniversityPoiLayer.tsx", "utf8");
    expect(source).toContain('const displayName = `${chineseName} · ${englishName}`');
    expect(source).toContain("label.textContent = displayName");
  });
  async function request(extra = "") {
    const { handleBackendPreviewRoute } = await import("@/server/backend-preview");
    return handleBackendPreviewRoute(new Request(`http://localhost/api/pathos/preview?endpoint=campus-discovery${extra}`), process.env);
  }

  it("projects light school and approved photo fields in one database query", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const page = parseCampusDiscoveryPage(await response.json());
    expect(page.cards).toHaveLength(12); expect(page.total).toBe(94); expect(page.nextOffset).toBe(12);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("review_status = 'approved'"); expect(sql).toContain("license_status = 'verified'");
    expect(sql).toContain("ORDER BY display_order, id LIMIT 1");
    expect(sql).not.toContain("university_details"); expect(sql).not.toContain("SELECT u.payload");
    expect(page.cards.every((card) => card.overview?.storage === "reviewed_file")).toBe(true);
  });

  it("coalesces concurrent pages and shuffles without another database round trip", async () => {
    await Promise.all([request(), request("&offset=12"), request("&seed=another-order")]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(["&offset=-1", "&offset=1.5", "&limit=99", "&limit=0", "&seed=%3Cscript%3E", "&offset=nope"])("rejects invalid input before touching the DB: %s", async (extra) => {
    const response = await request(extra); expect(response.status).toBe(400); expect(query).not.toHaveBeenCalled();
  });

  it("covers all 94 schools without duplicates across eight pages", async () => {
    const { pageDiscoveryCards } = await import("@/server/campus-discovery");
    const seen: string[] = [];
    for (let offset = 0; offset < 94; offset += 12) {
      const page = pageDiscoveryCards(cards, { offset, limit: 12, seed: "test-seed" });
      seen.push(...page.cards.map((card) => card.summary.id));
      if (offset === 84) expect(page.nextOffset).toBeNull();
    }
    expect(seen).toHaveLength(94); expect(new Set(seen).size).toBe(94);
    const other = pageDiscoveryCards(cards, { offset: 0, limit: 12, seed: "other-seed" });
    expect(other.cards.map((card) => card.summary.id)).not.toEqual(seen.slice(0, 12));
    expect(cards[0].summary.id).toBe(raw[0].id); // Sort never mutates the source.
  });

  it("serves six stable featured schools and six different schools the following day", async () => {
    const { pageDiscoveryCards } = await import("@/server/campus-discovery");
    const today = pageDiscoveryCards(cards, { offset: 0, limit: 6, seed: "campus-2026-10-21" });
    const again = pageDiscoveryCards(cards, { offset: 0, limit: 6, seed: "campus-2026-10-21" });
    const tomorrow = pageDiscoveryCards(cards, { offset: 0, limit: 6, seed: "campus-2026-10-22" });
    expect(today.cards).toHaveLength(6);
    expect(today.cards).toEqual(again.cards);
    const ids = new Set(today.cards.map((card) => card.summary.id));
    expect(tomorrow.cards.every((card) => !ids.has(card.summary.id))).toBe(true);
    const seen = new Set<string>();
    for (let day = 1; day <= 16; day += 1) {
      pageDiscoveryCards(cards, { offset: 0, limit: 6, seed: `campus-2026-10-${String(day).padStart(2, "0")}` }).cards.forEach((card) => seen.add(card.summary.id));
    }
    expect(seen.size).toBe(94);
  });

  it("keeps full-text limitations and corrected Chinese display names visible", async () => {
    const { readCampusDiscoveryCards } = await import("@/server/campus-discovery");
    const all = await readCampusDiscoveryCards();
    expect(all.find((card) => card.summary.id.endsWith(":brandeis-university"))).toMatchObject({ summary: { nameZh: "布兰迪斯大学" }, overview: { indexOnly: false, hasIndexedSources: false } });
    expect(all.find((card) => card.summary.id.endsWith(":columbia-university"))?.overview).toMatchObject({ indexOnly: false, hasIndexedSources: true });
    expect(all.find((card) => card.summary.id.endsWith(":brown-university"))?.overview).toMatchObject({ indexOnly: false, hasIndexedSources: false });
  });

  it("does not hide or cache backend failure behind static mock schools", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "ECONNRESET" }));
    expect((await request()).status).toBe(503);
    expect((await request()).status).toBe(200); expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe optional media URLs and malformed pagination", () => {
    const valid = { cards: [cards[0]], total: 94, offset: 0, nextOffset: 1, seed: "test" };
    expect(() => parseCampusDiscoveryPage(valid)).not.toThrow();
    expect(() => parseCampusDiscoveryPage({ ...valid, nextOffset: 0 })).toThrow();
    expect(() => parseCampusDiscoveryPage({ ...valid, cards: [{ ...cards[0], photo: { id: "image", url: "javascript:alert(1)", sourceUrl: "https://example.edu/photo", label: "photo", publisher: "official" } }] })).toThrow();
  });

  it("keeps flip controls independent of carousel swipes and nested keyboard events", () => {
    const source = readFileSync("src/components/reactbits/FlipCard.jsx", "utf8");
    expect(source).toContain("!interactive || disabled || e.button");
    expect(source).toContain("e.target !== e.currentTarget");
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("inert={shown || undefined}");
    const view = readFileSync("src/components/discover/CampusDiscovery.tsx", "utf8");
    expect(view).toContain("draggable={false} flipOnClick={false} tilt");
    expect(view).toContain("className={styles.front} onClick={() => turn(!flipped)}");
    expect(view).toContain("data-campus-back id={`${uid}-overview`} onClick={() => turn(!flipped)}");
    expect(view).toContain("stiffness={260} damping={30}");
    const flipCss = readFileSync("src/components/reactbits/FlipCard.css", "utf8");
    expect(flipCss).toContain("will-change: transform");
    expect(flipCss).toContain("isolation: isolate");
    expect(flipCss).toContain("transform: translateZ(0)");
    expect(view).not.toContain("data/reviewed");
  });
});
