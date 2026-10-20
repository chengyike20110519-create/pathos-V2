"use client";

import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import Image from "next/image";
import type { CampusImageRecord } from "@/domain/dataset";

export function CampusGallery({ images }: { images?: CampusImageRecord[] }) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const approved = (images ?? [])
    .filter((image) => image.reviewStatus === "approved" && image.licenseStatus === "verified")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, 5);

  if (!approved.length) {
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 bg-gradient-to-r from-cobalt/10 via-panel to-jade/10 px-4 py-2.5 text-[10px] text-ink/55" role="status" aria-label="暂无已审核校园图片">
        <span className="flex items-center gap-2"><ImageOff size={14} aria-hidden="true" /><span><strong className="block text-ink/70">暂无已审核校园图片</strong><span>图片来源与授权核验完成后会显示在这里</span></span></span>
        <span className="shrink-0 rounded-full border border-line/50 px-2 py-0.5">仅展示已审核来源</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 bg-line/20 p-1.5" aria-label="校园图片">
      {approved.map((image, index) => (
        <figure key={image.id} className={index === 0 ? "relative col-span-2 row-span-2 min-h-36 overflow-hidden rounded-lg" : "relative min-h-16 overflow-hidden rounded-lg"}>
          {failed[image.id] ? (
            <div className="grid h-full min-h-16 place-items-center bg-paper text-ink/35"><ImageOff size={14} aria-hidden="true" /></div>
          ) : (
            <Image
              fill
              src={image.thumbnailUrl || image.url}
              alt={image.label}
              loading={index === 0 ? "eager" : "lazy"}
              sizes={index === 0 ? "66vw" : "33vw"}
              className="h-full min-h-16 w-full object-cover transition duration-500 hover:scale-105"
              onError={() => setFailed((current) => ({ ...current, [image.id]: true }))}
            />
          )}
          <figcaption className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[10px] text-white/90">
            {image.label}
          </figcaption>
          <a href={image.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${image.label} 图片来源`} className="absolute right-1.5 top-1.5 rounded-full bg-black/45 p-1 text-white/85 hover:bg-black/70">
            <ExternalLink size={10} aria-hidden="true" />
          </a>
        </figure>
      ))}
    </div>
  );
}
