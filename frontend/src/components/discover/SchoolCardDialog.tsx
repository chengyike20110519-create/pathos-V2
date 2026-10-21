"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { UniversitySummary } from "@/domain/dataset";
import { UniversityProfile } from "@/components/map/UniversityProfile";
import { useCompareStore } from "@/state/compare-store";
import styles from "./campus-discovery.module.css";

export default function SchoolCardDialog({ summary, onClose }: { summary: UniversitySummary; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const compare = useCompareStore();
  const router = useRouter();
  useEffect(() => {
    // Retain the original trigger across React Strict Mode's effect replay.
    // Otherwise the second effect captures a button inside the dialog.
    if (!triggerRef.current) triggerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    if (!ref.current?.open) ref.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => { if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true }); });
    };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label="校园漫游：学校档案查看器"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <UniversityProfile summary={summary} inCompare={compare.has(summary.id)}
      onAddToCompare={() => compare.add(summary.id)} onRemoveFromCompare={() => compare.remove(summary.id)}
      onViewProfile={() => router.push(`/university/${encodeURIComponent(summary.id)}`)} onClose={onClose} />
  </dialog>;
}
