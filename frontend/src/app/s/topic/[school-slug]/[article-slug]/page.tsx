import V2Workbench from "@/components/v2/V2Workbench";

export default function Page({ params }: { params: { "school-slug": string; "article-slug": string } }) {
  return <V2Workbench mode="topic" slug={`${params["school-slug"]}/${params["article-slug"]}`} />;
}
