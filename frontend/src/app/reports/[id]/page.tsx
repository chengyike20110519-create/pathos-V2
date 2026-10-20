import type { Metadata } from "next";
import { ReportViewer } from "@/components/ReportViewer";

interface PageProps {
  params: { id: string };
  searchParams: { token?: string };
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const id = (params.id ?? "").slice(0, 32);
  return {
    title: `解读报告 ${id}`,
    description: "PathOS AI 解读报告：选校定位、风险点与下一步建议。",
    robots: { index: false, follow: false },
  };
}

export default function ReportPage({ params, searchParams }: PageProps) {
  const id = params.id ?? "";
  // No fallback to the report id: the id is not a credential.
  const token = searchParams.token ?? "";
  return <ReportViewer id={id} token={token} />;
}
