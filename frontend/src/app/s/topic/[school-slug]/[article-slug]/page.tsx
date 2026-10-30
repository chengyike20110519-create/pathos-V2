import V2Workbench from "@/components/v2/V2Workbench";

export default async function Page({ params }: { params: Promise<{ "school-slug": string; "article-slug": string }> }) {
  const { "school-slug": schoolSlug, "article-slug": articleSlug } = await params;
  return <V2Workbench mode="topic" slug={`${schoolSlug}/${articleSlug}`} />;
}
