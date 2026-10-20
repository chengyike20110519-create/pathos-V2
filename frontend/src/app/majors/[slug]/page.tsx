import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageMotion from "@/components/shared/PageMotion";
import MajorDetailView from "@/components/major/MajorDetailView";
import { findMajorDefinition } from "@/domain/information/major";

type PageProps = { params: { slug: string } };

export function generateMetadata({ params }: PageProps): Metadata {
  const definition = findMajorDefinition(params.slug);
  if (!definition) return { title: "专业详情" };
  return {
    title: definition.nameZh + "专业档案",
    description: definition.summary,
  };
}

export default function Page({ params }: PageProps) {
  if (!findMajorDefinition(params.slug)) notFound();
  return (
    <PageMotion>
      <MajorDetailView slug={params.slug} />
    </PageMotion>
  );
}
