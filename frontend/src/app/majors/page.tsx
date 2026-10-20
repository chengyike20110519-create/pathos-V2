import type { Metadata } from "next";
import PageMotion from "@/components/shared/PageMotion";
import MajorIndexView from "@/components/major/MajorIndexView";

export const metadata: Metadata = {
  title: "专业档案",
  description: "PathOS 核心 12 个专业档案与数据支持的扩展方向：学科边界、相近专业差异、已收录学校与对比入口。",
};

export default function Page() {
  return (
    <PageMotion>
      <MajorIndexView />
    </PageMotion>
  );
}
