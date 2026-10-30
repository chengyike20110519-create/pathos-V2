import V2Workbench from "@/components/v2/V2Workbench";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <V2Workbench mode="major" id={id} family="f" />; }
