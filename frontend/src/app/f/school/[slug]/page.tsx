import V2Workbench from "@/components/v2/V2Workbench";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <V2Workbench mode="school" slug={slug} family="f" />; }
