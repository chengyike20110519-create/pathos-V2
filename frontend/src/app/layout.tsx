import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./page-motion.css";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { DataSourceProvider } from "@/services/data-source-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import CookieConsent from "@/components/CookieConsent";

// Site-wide canonical origin. Override via NEXT_PUBLIC_SITE_URL on
// Render so OG / Twitter cards / JSON-LD point at the deployed URL
// instead of localhost.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://personal-os-zu9q.onrender.com").trim();

export const metadata: Metadata = {
  title: { default: "PathOS — 面向学生的大学信息研究平台", template: "%s | PathOS" },
  description: "PathOS 提供学校速览、专业信息、费用核查、跨校比较与多年趋势分析，帮助学生快速读懂美国大学。",
  keywords: ["美国大学", "大学信息", "趋势分析", "学校比较", "PathOS"],
  authors: [{ name: "PathOS" }],
  robots: { index: true, follow: true },
  openGraph: {
    title: "PathOS — 面向学生的大学信息研究平台",
    description: "快速读懂美国大学，看清字段来源与多年趋势。",
    type: "website",
    locale: "zh_CN",
    siteName: "PathOS",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: SITE_URL },
  metadataBase: new URL(SITE_URL),
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ed" },
    { media: "(prefers-color-scheme: dark)", color: "#11161a" },
  ],
};

// Organization-level JSON-LD. Helps search engines surface the brand
// behind the data + the contact channel for the advisor offering.
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PathOS",
  url: SITE_URL,
  description: "面向学生的美国大学信息研究与趋势分析平台。",
  sameAs: [
    "https://github.com/MAGA2010/personal-OS",
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      areaServed: "CN",
      availableLanguage: ["zh-Hans"],
    },
  ],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "PathOS",
  url: SITE_URL,
  inLanguage: "zh-CN",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* Map tiles are fetched from Esri after the map client mounts.
            Establishing the connection early removes a full DNS/TLS
            round-trip from the first visible map paint. */}
        <link rel="preconnect" href="https://server.arcgisonline.com" />
        <link rel="dns-prefetch" href="//server.arcgisonline.com" />
        {/* No-flash theme bootstrap — runs before React mounts and
            * synchronously* writes the correct class / data-theme /
            * color-scheme on <html> based on localStorage. Without
            * this, a dark-mode reload briefly paints the light
            * theme before React hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-surface-base text-text-primary antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-cobalt focus:px-4 focus:py-2 focus:text-paper focus:no-underline focus:outline-none"
        >
          跳至主要内容
        </a>
        <NavBar />
        <DataSourceProvider>
          <div id="main-content" className="flex min-h-[calc(100vh-3.5rem)] flex-col">
            {children}
          </div>
        </DataSourceProvider>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
