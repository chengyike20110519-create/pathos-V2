import Link from "next/link";
import { Compass, Crosshair, Radio, ScanLine } from "lucide-react";
import type { ReactNode } from "react";
import PageMotion from "@/components/shared/PageMotion";
import styles from "./EntryChrome.module.css";

type EntryChromeProps = {
  sectionLabel: string;
  systemLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "space" | "data" | "editorial" | "ai";
};

export function EntryChrome({
  sectionLabel,
  systemLabel,
  children,
  footer,
  tone = "space",
}: EntryChromeProps) {
  return (
    <main
      className={styles.root}
      data-feature-entry
      data-entry-tone={tone}
    >
      <div className={styles.cornerFrame} aria-hidden="true">
        <span className={styles.cornerTopLeft} />
        <span className={styles.cornerTopRight} />
        <span className={styles.cornerBottomLeft} />
        <span className={styles.cornerBottomRight} />
      </div>

      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.brand} aria-label="返回 PathOS 首页">
            <span className={styles.brandMark}>
              <Compass size={17} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className={styles.brandName}>PathOS</span>
            <span className={styles.brandDetail}>STUDY ABROAD INTELLIGENCE</span>
          </Link>
          <div className={styles.status} aria-label="入口环境状态">
            <Crosshair size={12} strokeWidth={1.4} aria-hidden="true" />
            <Radio size={12} strokeWidth={1.4} aria-hidden="true" />
            <span>LINK / READY</span>
          </div>
        </div>

        <div className={styles.sectionMeta}>
          <span>{sectionLabel}</span>
          <span>{systemLabel}</span>
        </div>
      </header>

      {/* Entry stages are single-screen, so PageMotion runs without its
          scroll progress bar and back-to-top affordance. */}
      <PageMotion className={styles.content} chrome={false}>
        {children}
      </PageMotion>

      <footer className={styles.footer}>
        <div className={styles.footerStatus}>
          <ScanLine size={14} strokeWidth={1.35} aria-hidden="true" />
          <span>SELECT / CONTINUE</span>
        </div>
        {footer}
      </footer>
    </main>
  );
}
