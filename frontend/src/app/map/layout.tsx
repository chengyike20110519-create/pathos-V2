import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "留学地图",
  description: "交互式美国留学专题地图 — 四项区域指标 + 学校 POI 探索",
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
