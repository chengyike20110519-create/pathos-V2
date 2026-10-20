import type { Metadata } from "next";
import { ResearchDeskView } from "@/components/research/ResearchDeskView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "我的研究台",
  description:
    "用研究问题组织学校、专业、指标、政策事件和证据来源，形成可持续追溯的大学研究过程。",
};

export default function ResearchPage() {
  return <ResearchDeskView />;
}
