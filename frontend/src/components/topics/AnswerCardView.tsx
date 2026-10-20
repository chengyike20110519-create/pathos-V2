import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleSlash,
  Database,
  ExternalLink,
  FileSearch,
  ShieldCheck,
} from "lucide-react";

import {
  ANSWER_CARD_DEFINITIONS,
  answerCardJsonLd,
  type AnswerCard,
  type AnswerEvidence,
} from "@/domain/information/answer-card";

const GRADE_META: Record<AnswerEvidence["grade"], { label: string; className: string }> = {
  approved_fact: {
    label: "Approved fact",
    className: "border-jade/30 bg-jade/10 text-jade",
  },
  preview: {
    label: "Traceable preview",
    className: "border-cobalt/30 bg-cobalt/10 text-cobalt",
  },
};

function sourceDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shortHash(value: string | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function EvidenceChip({ evidence }: { evidence: AnswerEvidence }) {
  const meta = GRADE_META[evidence.grade];
  const detail = evidence.grade === "approved_fact"
    ? [
        evidence.fieldKey,
        sourceDate(evidence.retrievedAt) ? "采集 " + sourceDate(evidence.retrievedAt) : null,
        evidence.confidence,
      ].filter(Boolean).join(" · ")
    : [
        evidence.datasetVersion,
        shortHash(evidence.sourceCommit) ? "commit " + shortHash(evidence.sourceCommit) : null,
        shortHash(evidence.artifactHash) ? "artifact " + shortHash(evidence.artifactHash) : null,
      ].filter(Boolean).join(" · ");

  const content = (
    <>
      <span className={meta.className + " rounded-control border px-2 py-0.5 text-[10px] font-semibold"}>
        {meta.label}
      </span>
      {detail ? <span className="min-w-0 truncate text-[10px] text-text-muted">{detail}</span> : null}
    </>
  );

  if (!evidence.sourceUrl) return <span className="flex min-w-0 items-center gap-1.5">{content}</span>;
  return (
    <a
      href={evidence.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-1.5 text-left transition hover:opacity-80"
    >
      {content}
      <ExternalLink size={10} className="shrink-0 text-text-muted" aria-hidden="true" />
    </a>
  );
}

export function AnswerCardView({ card, siteUrl }: { card: AnswerCard; siteUrl: string }) {
  const definition = card.definition;
  const relatedTopics = Object.values(ANSWER_CARD_DEFINITIONS).filter(
    (item) => item.slug !== definition.slug,
  );
  const jsonLd = answerCardJsonLd(card, siteUrl);
  const jsonLdHtml = JSON.stringify(jsonLd)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />

      <header className="border-b border-border-soft bg-surface-1/85" data-reveal>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-control border border-cobalt/25 bg-cobalt/10 px-2.5 py-1 text-[11px] font-semibold text-cobalt">
            <FileSearch size={13} aria-hidden="true" />
            Answer card
          </span>
          <span className="rounded-control border border-border-soft bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
            {card.dataAsOf ? "数据口径 " + card.dataAsOf : "数据口径待建立"}
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {definition.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{definition.question}</p>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">{definition.description}</p>
      </header>

      <article className="mt-6 rounded-card border border-border-soft bg-surface-1 p-4 shadow-sm sm:p-6" data-reveal>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-cobalt text-paper">
            <BadgeCheck size={19} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">PathOS 答案</h2>
            <p className="mt-1.5 text-sm leading-6 text-text-secondary">{card.answer}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-control border border-border-soft bg-surface-muted/40 p-3">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-text-tertiary">
              <Database size={12} aria-hidden="true" />
              Approved facts
            </dt>
            <dd className="mt-1 text-sm font-semibold text-text-primary">
              {card.availability.approvedFacts === "available" ? "可用" : "暂不可用"}
            </dd>
          </div>
          <div className="rounded-control border border-border-soft bg-surface-muted/40 p-3">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-text-tertiary">
              <ShieldCheck size={12} aria-hidden="true" />
              Preview dataset
            </dt>
            <dd className="mt-1 text-sm font-semibold text-text-primary">
              {card.availability.preview === "available" ? "可追溯" : "暂不可用"}
            </dd>
          </div>
          <div className="rounded-control border border-border-soft bg-surface-muted/40 p-3">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-text-tertiary">
              <CalendarClock size={12} aria-hidden="true" />
              生成时间
            </dt>
            <dd className="mt-1 text-sm font-semibold text-text-primary">
              {new Date(card.generatedAt).toISOString().slice(0, 10) + " UTC"}
            </dd>
          </div>
        </dl>
      </article>

      {card.sections.map((section) => (
        <section key={section.id} className="mt-8" aria-labelledby={"section-" + section.id} data-reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id={"section-" + section.id} className="text-lg font-semibold text-text-primary">
                {section.title}
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{section.statement}</p>
            </div>
            <span className="rounded-control border border-border-soft bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
              {section.evidenceCount} 个证据源
            </span>
          </div>

          {section.items.length === 0 ? (
            <p className="mt-3 rounded-card border border-dashed border-border-soft bg-surface-1 px-4 py-6 text-xs leading-5 text-text-secondary">
              {section.statement}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border-soft overflow-hidden rounded-card border border-border-soft bg-surface-1">
              {section.items.map((item) => (
                <li key={item.id} className="p-4 transition hover:bg-surface-muted/30">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      {item.href ? (
                        <Link href={item.href} className="text-sm font-semibold text-text-primary transition hover:text-cobalt">
                          {item.label}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-text-primary">{item.label}</span>
                      )}
                      {item.detail ? <p className="mt-1 text-xs text-text-secondary">{item.detail}</p> : null}
                    </div>
                    {item.value ? (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-text-secondary">{item.value}</span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    {item.evidence.map((evidence, index) => (
                      <EvidenceChip
                        key={(evidence.factId ?? evidence.grade) + ":" + index}
                        evidence={evidence}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="mt-8 rounded-card border border-border-soft bg-surface-1 p-4 sm:p-5" aria-labelledby="answer-limits" data-reveal>
        <h2 id="answer-limits" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <CircleSlash size={15} className="text-persimmon" aria-hidden="true" />
          结论边界
        </h2>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-text-secondary">
          {card.limitations.map((limitation) => (
            <li key={limitation} className="rounded-control bg-surface-muted/40 px-3 py-2">{limitation}</li>
          ))}
        </ul>
      </section>

      <nav className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="内部链接" data-reveal>
        {definition.relatedLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-card border border-border-soft bg-surface-1 p-4 transition hover:border-cobalt/40"
          >
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-text-primary">
              {link.label}
              <ArrowRight size={14} className="text-text-muted transition group-hover:text-cobalt" aria-hidden="true" />
            </span>
            <span className="mt-1 block text-xs text-text-secondary">{link.description}</span>
          </Link>
        ))}
      </nav>

      <section className="mt-8" aria-labelledby="related-answer-cards" data-reveal>
        <h2 id="related-answer-cards" className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">
          相关主题
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {relatedTopics.map((topic) => (
            <Link
              key={topic.slug}
              href={"/topics/" + topic.slug}
              className="inline-flex h-control items-center rounded-control border border-border-soft bg-surface-1 px-3 text-xs font-medium text-text-secondary transition hover:border-cobalt/40 hover:text-cobalt"
            >
              {topic.title}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
