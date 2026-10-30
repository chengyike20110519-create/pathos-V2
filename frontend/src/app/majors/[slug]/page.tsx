import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageMotion from "@/components/shared/PageMotion";
import MajorDetailView from "@/components/major/MajorDetailView";
import { findMajorDefinition } from "@/domain/information/major";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const definition = findMajorDefinition(slug);
  if (!definition) return { title: "专业详情" };
  return {
    title: definition.nameZh + "专业档案",
    description: definition.summary,
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  if (!findMajorDefinition(slug)) notFound();
  return (
    <PageMotion>
      <MajorDetailView slug={slug} />
    </PageMotion>
  );
}
