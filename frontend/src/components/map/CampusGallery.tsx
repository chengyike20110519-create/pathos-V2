"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Image from "next/image";
import type { CampusImageRecord } from "@/domain/dataset";
import styles from "./UniversityProfile.module.css";

export function CampusGallery({ images, children }: { images?: CampusImageRecord[]; children?: ReactNode }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const approved = (images ?? []).filter((image) => image.reviewStatus === "approved" && image.licenseStatus === "verified").sort((a, b) => a.displayOrder - b.displayOrder).slice(0, 5);
  const image = approved[active % Math.max(approved.length, 1)];

  return <div className={styles.cover} aria-label="校园影像">
    {image && !failed[image.id] && <Image key={image.id} fill src={image.thumbnailUrl || image.url} alt={image.label} loading="eager" sizes="(min-width: 1024px) 420px, 100vw" className={styles.coverImage} onError={() => setFailed((current) => ({ ...current, [image.id]: true }))} />}
    <div className={styles.coverShade} aria-hidden="true" />
    {image && !failed[image.id] && <div className={styles.galleryControls}>
      <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${image.label} 图片来源`} title={`${image.label} · ${image.publisher}`}>校园影像<ExternalLink size={11} aria-hidden="true" /></a>
      {approved.length > 1 && <><button type="button" aria-label="上一张校园照片" onClick={() => setActive((current) => (current - 1 + approved.length) % approved.length)}><ChevronLeft size={13} aria-hidden="true" /></button><span aria-live="polite">{active % approved.length + 1} / {approved.length}</span><button type="button" aria-label="下一张校园照片" onClick={() => setActive((current) => (current + 1) % approved.length)}><ChevronRight size={13} aria-hidden="true" /></button></>}
    </div>}
    {image && failed[image.id] && <p className={styles.coverFallback}>校园图片暂不可用</p>}
    {children}
  </div>;
}
