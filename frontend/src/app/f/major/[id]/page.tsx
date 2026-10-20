import V2Workbench from "@/components/v2/V2Workbench";
export default function Page({ params }: { params: { id: string } }) { return <V2Workbench mode="major" id={params.id} family="f" />; }
