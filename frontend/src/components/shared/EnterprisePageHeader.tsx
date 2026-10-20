import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./EnterprisePageHeader.module.css";

export type EnterprisePageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  stats?: readonly { label: string; value: ReactNode }[];
  sourceNote?: ReactNode;
};

export function EnterprisePageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  stats = [],
  sourceNote,
}: EnterprisePageHeaderProps) {
  return (
    <header className={styles.header} data-reveal="true">
      <div className={styles.inner}>
        <div className={styles.identity}>
          <p className={styles.eyebrow}>
            {Icon ? <Icon className={styles.icon} size={14} aria-hidden="true" /> : null}
            {eyebrow}
          </p>
          <h1 className={styles.title} aria-label={typeof title === "string" ? title : undefined}>
            {title}
          </h1>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {stats.length > 0 ? (
        <dl className={styles.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.stat}>
              <dt className={styles.statLabel}>{stat.label}</dt>
              <dd className={styles.statValue}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {sourceNote ? <p className={styles.sourceNote}>{sourceNote}</p> : null}
    </header>
  );
}
