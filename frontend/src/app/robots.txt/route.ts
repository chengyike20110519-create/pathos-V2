import { NextResponse } from "next/server";

export const dynamic = "force-static";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://personal-os-zu9q.onrender.com").trim();

export function GET(): NextResponse {
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /account/

Sitemap: ${SITE_URL}/sitemap.xml
`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}