"use client";

import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, Building2, ChevronLeft, ChevronRight, Compass, ExternalLink, MapPin, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import FlipCard from "@/components/reactbits/FlipCard";
import { useDataSource } from "@/services/data-source-provider";
import type { CampusDiscoveryCard, CampusDiscoveryPage } from "@/domain/campus-discovery";
import type { UniversitySummary } from "@/domain/dataset";
import { CAMPUS_EDITION_SIZE, getCampusEdition, stepCampusRail } from "@/lib/campus-discovery-edition";
import { getSchoolNamePair } from "@/lib/school-name";
import styles from "./campus-discovery.module.css";

const SchoolCardDialog = dynamic(() => import("./SchoolCardDialog"), { ssr: false });
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CampusCard = memo(function CampusCard({ card, index, eager, onOpen, onTurn }: { card: CampusDiscoveryCard; index: number; eager: boolean; onOpen: (summary: UniversitySummary) => void; onTurn: (id: string, flipped: boolean) => void }) {
  const [flipped, setFlipped] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const frontButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const names = getSchoolNamePair(card.summary);
  const title = names.zh;
  const uid = useId();
  const turn = (next: boolean) => {
    if (next) void import("./SchoolCardDialog");
    setFlipped(next);
    onTurn(card.summary.id, next);
    requestAnimationFrame(() => (next ? backButton : frontButton).current?.focus({ preventScroll: true }));
  };
  return <li className={styles.cardItem} data-campus-card data-school-id={card.summary.id}>
    <FlipCard width={360} height={500} radius={24} background="rgb(var(--token-panel))" color="rgb(var(--token-ink))" stiffness={260} damping={30}
      flipped={flipped} onFlipChange={turn} draggable={false} flipOnClick={false} tilt glare shadow hoverScale={1.02} perspective={1050} tiltMax={6} glareOpacity={0.14}
      ariaLabel={`${title} 校园探索卡`} className={styles.flipCard}
      front={<div className={styles.front} onClick={() => turn(!flipped)}>
        {card.photo && !imageFailed ? <Image fill src={card.photo.url} alt={card.photo.label} sizes="(max-width: 600px) 82vw, 360px" priority={index === 0} loading={eager ? "eager" : "lazy"} className={styles.photo} onError={() => setImageFailed(true)} /> : <div className={styles.imageFallback}><Building2 size={42} strokeWidth={1} aria-hidden="true" /><p>{card.photo ? "校园影像暂时无法加载" : "校园影像待补充"}</p></div>}
        <div className={styles.photoShade} aria-hidden="true" />
        <div className={styles.photoTop}><span>PATHOS · CAMPUS</span><span>{String(index + 1).padStart(2, "0")}</span></div>
        <div className={styles.frontContent}>
          <p className={styles.location}><MapPin size={13} aria-hidden="true" />{[card.summary.city, card.summary.state].filter(Boolean).join(" · ") || "地点待补充"}</p>
          <h3 id={`${uid}-title`}>{title}</h3>
          <p className={styles.englishName} lang="en">{names.en}</p>
          <button ref={frontButton} type="button" className={styles.readButton} aria-label={`翻开${title}简介`} aria-expanded={flipped} aria-controls={`${uid}-overview`}><span>读读这所学校</span><ArrowUpRight size={17} aria-hidden="true" /></button>
        </div>
      </div>}
      back={<div className={styles.back} data-campus-back id={`${uid}-overview`} onClick={() => turn(!flipped)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); turn(false); } }}>
        <div className={styles.backTop}><span>认识这所学校</span><button ref={backButton} type="button" onClick={(event) => { event.stopPropagation(); turn(false); }} aria-label={`翻回${title}校园照片`}><RotateCcw size={15} aria-hidden="true" />看照片</button></div>
        <h3>{title}</h3><p className={styles.backEnglish} lang="en">{names.en}</p>
        <div className={styles.overview}>
            {card.motto && <div className={styles.motto}><span>校训</span><strong>{card.motto.text}</strong>{card.motto.textZh && <em>{card.motto.textZh}</em>}{card.motto.status === "candidate" && <small>候选资料 · 待官网复核</small>}</div>}
          <p>{card.overview?.text || "学校概括尚待核实。你仍可以打开信息卡，查看已收录的专业和基础资料。"}</p>
          {card.overview?.hasIndexedSources && <p className={styles.reviewNote}>{card.overview.indexOnly ? "简介依据官方检索摘要，尚待官网全文复核。" : "部分补充描述依据官方检索摘要，来源中已标明。"}</p>}
        </div>
        <div className={styles.backFooter}>
          <details className={styles.sources} onClick={(event) => event.stopPropagation()}><summary>简介与图片出处 <ExternalLink size={11} aria-hidden="true" /></summary><div>
            {card.overview?.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span>{source.accessMethod === "official_search_index" ? "官方检索摘要" : "官网正文"}</span></a>)}
            {card.photo && <a href={card.photo.sourceUrl} target="_blank" rel="noopener noreferrer">图片与许可 · {card.photo.publisher}</a>}
            {card.overview && <p>整理于 {card.overview.checkedOn} · 服务端审核资料</p>}
          </div></details>
          <button type="button" data-no-flip className={styles.openButton} onClick={(event) => { event.stopPropagation(); onOpen(card.summary); }}>打开大学信息卡<ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </div>} />
  </li>;
});

export default function CampusDiscovery({ embedded = false }: { embedded?: boolean }) {
  const source = useDataSource();
  const [edition, setEdition] = useState<ReturnType<typeof getCampusEdition> | null>(null);
  const [page, setPage] = useState<CampusDiscoveryPage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const [selected, setSelected] = useState<UniversitySummary | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set());
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [manualUntil, setManualUntil] = useState(0);
  const rail = useRef<HTMLOListElement>(null);
  const drag = useRef<{ pointerId: number; x: number; left: number; moved: boolean } | null>(null);
  const direction = useRef<1 | -1>(1);
  const uid = useId();
  const titleId = `${uid}-title`;
  const reading = focused || flippedIds.size > 0 || selected !== null;
  const interacting = hovered || pressed || reading;
  const running = autoEnabled && !interacting && inView && tabVisible && status === "ready";

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAutoEnabled(!preference.matches);
    const onPreference = () => setAutoEnabled(!preference.matches);
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
    preference.addEventListener("change", onPreference);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { preference.removeEventListener("change", onPreference); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    // A pointer can be released outside the rail (e.g. after touching a
    // button then moving away). Never leave the carousel permanently paused.
    const release = () => setPressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); window.removeEventListener("blur", release); };
  }, []);

  useEffect(() => {
    // Check the edition while open and on tab return, but never replace a
    // flipped card, focused control, dragged card or open university dialog.
    const check = () => {
      if (interacting || document.hidden) return;
      const next = getCampusEdition();
      setEdition((previous) => previous?.seed === next.seed ? previous : next);
    };
    check();
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [interacting]);

  useEffect(() => {
    if (!edition) return;
    const controller = new AbortController();
    setStatus("loading"); setActive(0); setAtEnd(false); setPage(null); setFlippedIds(new Set()); direction.current = 1;
    if (!source?.getCampusDiscovery) { setStatus("error"); return; }
    source.getCampusDiscovery({ seed: edition.seed, limit: CAMPUS_EDITION_SIZE }, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setPage(data); setStatus("ready"); rail.current?.scrollTo({ left: 0, behavior: "auto" }); }
    }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [source, edition, retry]);

  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width === node.clientWidth) return;
      width = node.clientWidth;
      const control = node.contains(document.activeElement) ? document.activeElement : node.querySelector('[aria-expanded="true"]');
      const anchor = control?.closest<HTMLElement>("[data-campus-card]");
      const first = node.querySelector<HTMLElement>("[data-campus-card]");
      // Keep the card being read fully in view when the layout becomes narrow.
      if (anchor && first) node.scrollLeft = anchor.offsetLeft - first.offsetLeft;
      setAtEnd(node.scrollLeft >= node.scrollWidth - node.clientWidth - 2);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    const node = rail.current;
    if (!node || !running) return;
    let frame = 0;
    let previous = 0;
    let start = 0;
    let position = node.scrollLeft;
    let written = position;
    const tick = (time: number) => {
      if (!start) start = time;
      // Preserve fractional pixels even on browsers that round scrollLeft.
      if (Math.abs(node.scrollLeft - written) > 1) position = node.scrollLeft;
      if (previous && time - start > 1500 && Date.now() > manualUntil) {
        const next = stepCampusRail(position, direction.current, Math.min(time - previous, 64), node.scrollWidth - node.clientWidth);
        position = next.position; direction.current = next.direction;
        node.scrollLeft = position; written = node.scrollLeft;
      }
      previous = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, manualUntil, page]);

  const onTurn = useCallback((id: string, flipped: boolean) => {
    setFlippedIds((previous) => { const next = new Set(previous); if (flipped) next.add(id); else next.delete(id); return next; });
  }, []);

  function scrollTo(index: number) {
    const elements = rail.current?.querySelectorAll<HTMLElement>("[data-campus-card]");
    if (!rail.current || !elements?.[index]) return;
    setManualUntil(Date.now() + 6000);
    rail.current.scrollTo({ left: elements[index].offsetLeft - elements[0].offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" });
  }
  function onScroll() {
    const list = rail.current;
    if (!list) return;
    const elements = list.querySelectorAll<HTMLElement>("[data-campus-card]");
    if (!elements.length) return;
    let closest = 0;
    for (let index = 1; index < elements.length; index += 1) {
      if (Math.abs(elements[index].offsetLeft - elements[0].offsetLeft - list.scrollLeft) < Math.abs(elements[closest].offsetLeft - elements[0].offsetLeft - list.scrollLeft)) closest = index;
    }
    setActive(closest);
    setAtEnd(list.scrollLeft >= list.scrollWidth - list.clientWidth - 2);
  }

  const Heading = embedded ? "h2" : "h1";
  return <section className={`${styles.root} ${embedded ? styles.embedded : ""}`} aria-labelledby={titleId} id="campus-discovery">
    <div className={styles.header}>
      <div className={styles.kicker}><Compass size={15} aria-hidden="true" /> CAMPUS, UNPLANNED <span>校园漫游</span></div>
      <div className={styles.titleRow}><div><Heading id={titleId}>先被一座校园打动<span>。</span></Heading><p className={styles.lede}>每天，只遇见几所学校。让校园慢慢经过，心动时停下来，翻开读一读。</p></div><Link href="/map" prefetch={false} className={styles.mapLink}>回到地图<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <div className={styles.toolbar}><p><span className={styles.liveDot} />{page ? `本期 ${page.cards.length} 所` : "每日校园精选"}<span className={styles.toolbarDivider}>/</span><span>{edition ? `${edition.date.slice(5).replace("-", ".")} · 每日换新` : "每日换新"}</span></p><button type="button" onClick={() => { setAutoEnabled((value) => !value); setManualUntil(0); }} disabled={status !== "ready"} aria-label={autoEnabled ? "暂停自动漫游" : "开始自动漫游"}>{autoEnabled ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{autoEnabled ? "暂停漫游" : "自动漫游"}</button></div>
    </div>
    {status === "loading" && <div className={styles.skeletonRail} aria-busy="true" role="status"><span className="sr-only">正在打开校园卡片…</span>{[0, 1, 2, 3].map((item) => <div key={item} className={styles.skeleton} />)}</div>}
    {status === "error" && <div className={styles.error} role="status"><Building2 size={28} strokeWidth={1.5} aria-hidden="true" /><h3>校园卡片暂时没有打开</h3><p>可能是数据服务连接中断。地图与其他功能仍可单独使用。</p><button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />重新加载</button></div>}
    {status === "ready" && page && !page.cards.length && <div className={styles.error}><h3>还没有可展示的学校</h3><Link href="/map">去地图看看</Link></div>}
    {status === "ready" && page && page.cards.length > 0 && <>
      <ol className={styles.rail} ref={rail} onScroll={onScroll} data-auto-enabled={autoEnabled} data-running={running} aria-label="本期校园卡片，可左右滑动，停留或阅读时自动暂停" tabIndex={0}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
        onWheel={() => setManualUntil(Date.now() + 6000)}
        onPointerDown={(event) => {
          setPressed(true);
        if (
          event.pointerType !== "mouse" ||
          event.button !== 0 ||
          (event.target as HTMLElement).closest(
            "button,a,summary,details,[data-campus-back],.flip-card",
          )
        ) return;
          drag.current = { pointerId: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const grip = drag.current;
          if (!grip || grip.pointerId !== event.pointerId) return;
          const delta = event.clientX - grip.x;
          if (!grip.moved && Math.abs(delta) < 6) return;
          grip.moved = true;
          event.currentTarget.dataset.dragging = "true";
          event.currentTarget.scrollLeft = grip.left - delta;
        }}
        onPointerUp={(event) => {
          setPressed(false); setManualUntil(Date.now() + 6000);
          const grip = drag.current;
          drag.current = null;
          delete event.currentTarget.dataset.dragging;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (grip?.moved) scrollTo(active);
        }}
        onPointerCancel={(event) => { setPressed(false); drag.current = null; delete event.currentTarget.dataset.dragging; }}
        onLostPointerCapture={(event) => { setPressed(false); drag.current = null; delete event.currentTarget.dataset.dragging; }}
        onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); scrollTo(Math.max(0, Math.min(page.cards.length - 1, active + (event.key === "ArrowRight" ? 1 : -1)))); }
      }}>
        {page.cards.map((card, index) => <CampusCard key={`${edition?.seed}:${card.summary.id}`} card={card} index={index} eager={index < 2} onOpen={setSelected} onTurn={onTurn} />)}
      </ol>
      <div className={styles.footer}><p className={styles.gesture}><span aria-hidden="true">↔</span>{!autoEnabled ? "已暂停 · 可自由滑动" : reading ? "阅读中，漫游已暂停" : hovered || pressed ? "停留时暂停 · 移开后继续" : "缓缓漫游 · 停留即可暂停"}</p><div className={styles.navigation}><span>{String(active + 1).padStart(2, "0")}<span> / {page.cards.length}</span></span><button type="button" onClick={() => scrollTo(Math.max(0, active - 1))} disabled={active === 0} aria-label="上一所学校"><ChevronLeft size={18} aria-hidden="true" /></button><button type="button" onClick={() => scrollTo(Math.min(page.cards.length - 1, active + 1))} disabled={atEnd} aria-label="下一所学校"><ChevronRight size={18} aria-hidden="true" /></button></div></div>
    </>}
    <p className={styles.note}>一张校园照片不是择校结论。感兴趣时，再打开信息卡了解专业、费用与数据来源。</p>
    {selected && <SchoolCardDialog summary={selected} onClose={() => setSelected(null)} />}
  </section>;
}
