import V2Workbench from "@/components/v2/V2Workbench";
export default function Page({ params }: { params: { slug: string } }) { return <V2Workbench mode="school" slug={params.slug} />; }
