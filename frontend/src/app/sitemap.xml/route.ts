import { NextResponse } from "next/server";
import { ANSWER_CARD_PATHS } from "@/domain/information/answer-card";
import { getPool } from "@/server/db";
import { isInformationPlatformMode } from "@/lib/product-mode";

export const dynamic = "force-dynamic";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://personal-os-zu9q.onrender.com").trim();

const INFORMATION_PATHS = [
  "/",
  "/entry/map",
  "/calculator",
  "/entry/match",
  "/entry/assessment",
  "/entry/portfolio",
  "/trends",
  "/compare",
  "/majors",
  "/deadlines",
  "/costs",
  "/opportunities",
  "/news",
  "/research",
  ...ANSWER_CARD_PATHS,
  "/xuanxiao",
  "/about",
];

const COMMERCIAL_PATHS = [
  "/pricing",
  "/account/subscription",
];

const STATIC_PATHS = isInformationPlatformMode()
  ? INFORMATION_PATHS
  : [...INFORMATION_PATHS, ...COMMERCIAL_PATHS];

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface UniversitySitemapRow {
  id: string;
  updated_at: Date | string;
}

export async function GET(): Promise<NextResponse> {
  const urls: Array<{ loc: string; lastmod?: string; changefreq?: string; priority?: number }> = [];

  for (const path of STATIC_PATHS) {
    urls.push({
      loc: `${SITE_URL}${path}`,
      changefreq: path === "/" ? "daily" : "weekly",
      priority: path === "/" ? 1 : 0.7,
    });
  }

  try {
    const rows = await getPool().query<UniversitySitemapRow>(
      "SELECT id, updated_at FROM universities ORDER BY updated_at DESC",
    );
    for (const row of rows.rows) {
      const lastmod = row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString();
      urls.push({
        loc: `${SITE_URL}/university/${encodeURIComponent(row.id)}`,
        lastmod,
        changefreq: "weekly",
        priority: 0.6,
      });
    }
  } catch {
    // intentionally ignored; sitemap should never block on the DB
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => {
    const pieces = [`<loc>${xmlEscape(u.loc)}</loc>`];
    if (u.lastmod) pieces.push(`<lastmod>${u.lastmod}</lastmod>`);
    if (u.changefreq) pieces.push(`<changefreq>${u.changefreq}</changefreq>`);
    if (u.priority != null) pieces.push(`<priority>${u.priority.toFixed(1)}</priority>`);
    return `  <url>${pieces.join("")}</url>`;
  })
  .join("\n")}
</urlset>
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
