import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnswerCardView } from "@/components/topics/AnswerCardView";
import PageMotion from "@/components/shared/PageMotion";
import { findAnswerCardDefinition } from "@/domain/information/answer-card";
import { getAnswerCard } from "@/server/information/answer-card-service";

type PageProps = { params: Promise<{ slug: string }> };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://personal-os-zu9q.onrender.com").trim();

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const definition = findAnswerCardDefinition(slug);
  if (!definition) return { title: "主题未找到", robots: { index: false, follow: false } };
  const url = SITE_URL + "/topics/" + definition.slug;
  return {
    title: definition.title,
    description: definition.description,
    keywords: [...definition.keywords],
    alternates: { canonical: "/topics/" + definition.slug },
    robots: { index: true, follow: true },
    openGraph: {
      title: definition.title,
      description: definition.description,
      url,
      type: "article",
      locale: "zh_CN",
      siteName: "PathOS",
    },
    twitter: { card: "summary_large_image", title: definition.title, description: definition.description },
  };
}

export default async function TopicAnswerCardPage({ params }: PageProps) {
  const { slug } = await params;
  const card = await getAnswerCard(slug);
  if (!card) notFound();
  return (
    <PageMotion>
      <AnswerCardView card={card} siteUrl={SITE_URL} />
    </PageMotion>
  );
}
