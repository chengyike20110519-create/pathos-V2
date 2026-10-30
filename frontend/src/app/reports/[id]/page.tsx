import type { Metadata } from "next";
import { ReportViewer } from "@/components/ReportViewer";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = (rawId ?? "").slice(0, 32);
  return {
    title: `解读报告 ${id}`,
    description: "PathOS AI 解读报告：选校定位、风险点与下一步建议。",
    robots: { index: false, follow: false },
  };
}

export default async function ReportPage({ params, searchParams }: PageProps) {
  const { id = "" } = await params;
  // No fallback to the report id: the id is not a credential.
  const { token = "" } = await searchParams;
  return <ReportViewer id={id} token={token} />;
}
