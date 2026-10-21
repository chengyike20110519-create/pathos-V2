import type { Metadata } from "next";
import CampusDiscovery from "@/components/discover/CampusDiscovery";

export const metadata: Metadata = {
  title: "校园漫游",
  description: "每日六所校园，缓缓横向漫游。遇见喜欢的照片，停下来读学校简介，再打开大学信息卡。",
};

export default function DiscoverPage() {
  return <main><CampusDiscovery /></main>;
}
