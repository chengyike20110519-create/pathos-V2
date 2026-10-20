"use client";

// PathOS Stage 7B-A.1 — Unified Map Toolbar
//
// One and only one floating toolbar that sits at the top-right of the
// map. Consolidates:
//   • RegionalLayerControl (region heatmap selector)
//   • StateSelector        (drill-down to a single state)
//   • ViewModeBadge        (州级 / 城市级 / 城市详情 indicator)
// into a single `flex flex-wrap` row. The legacy 5-button row that
// used to sit at the top of the page (and the mobile sub-bar) is
// gone — see the Stage 7B-A.1 plan for the full rationale.

import { useState, useRef, useEffect } from "react";
import { ChevronDown, BookOpen, List, X } from "lucide-react";
import dynamic from "next/dynamic";
import { RegionalLayerControl } from "@/components/map/regional/RegionalLayerControl";
import type { RegionalMetricId } from "@/regional/types";
const MapProgramFilter = dynamic(() => import("./MapProgramFilter"), { ssr: false, loading: () => <p role="status" className="absolute right-0 top-full mt-2 rounded-lg border border-line bg-panel p-3 text-xs text-ink">正在打开专业筛选…</p> });

export interface StateOption {
  fipsCode: string;
  name: string;
  nameEn: string;
}

export interface MapToolbarProps {
  /** Regional heatmap selector — null means no heatmap. */
  activeRegionalMetric: RegionalMetricId | null;
  setActiveRegionalMetric: (next: RegionalMetricId | null) => void;

  /** State drill-down. */
  cityDrilldownEnabled: boolean;
  selectedStateFips: string | null;
  onSelectState: (fipsCode: string) => void;
  stateOptions: ReadonlyArray<StateOption>;

  /** Status indicator (州级色块图 / 城市级 N 所大学 / 城市详情). */
  viewModeLabel: string;
  selectedProgram?: string | null;
  onProgramChange?: (program: string | null) => void;
  listOpen?: boolean;
  schoolCount?: number;
  onToggleList?: () => void;
  onClearState?: () => void;
  onBottomChange?: (bottom: number) => void;
}

/** Collapse the state dropdown on outside click. */
function useOutsideClose(
  ref: React.RefObject<HTMLElement>,
  onClose: () => void,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    function handle(ev: MouseEvent): void {
      const el = ref.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onClose, active]);
}

export function MapToolbar({
  activeRegionalMetric,
  setActiveRegionalMetric,
  cityDrilldownEnabled,
  selectedStateFips,
  onSelectState,
  stateOptions,
  viewModeLabel,
  selectedProgram,
  onProgramChange,
  listOpen,
  schoolCount,
  onToggleList,
  onClearState,
  onBottomChange,
}: MapToolbarProps): JSX.Element {
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = toolbarRef.current;
    if (!element || !onBottomChange) return;
    const update = () => onBottomChange(element.offsetTop + element.offsetHeight + 12);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onBottomChange]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClose(dropdownRef, () => setDropdownOpen(false), dropdownOpen);
  const [programOpen, setProgramOpen] = useState(false);
  const programRef = useRef<HTMLDivElement>(null);
  useOutsideClose(programRef, () => setProgramOpen(false), programOpen);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setDropdownOpen(false); setProgramOpen(false); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const selectedName = selectedStateFips
    ? stateOptions.find((s) => s.fipsCode === selectedStateFips)?.name ?? selectedStateFips
    : null;

  return (
    <div
      ref={toolbarRef}
      data-testid="map-toolbar"
      role="toolbar"
      aria-label="地图工具栏"
       className={`absolute right-3 top-3 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 ${
         dropdownOpen ? "z-map-tooltip" : "z-map-toolbar"
       } ${programOpen ? "z-map-tooltip" : ""}`}
    >
      {/* 1. Regional heatmap selector — the only entry point. */}
      <RegionalLayerControl
        value={activeRegionalMetric}
        onChange={setActiveRegionalMetric}
      />

      {/* 2. State drill-down selector. */}
      <div
        ref={dropdownRef}
        className="static min-w-0 sm:relative"
      >
        <button
          type="button"
          data-testid="state-selector-button"
          onClick={() => { setDropdownOpen((v) => !v); setProgramOpen(false); }}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          title="按州缩小地图范围"
          className={`flex min-h-9 max-w-[140px] items-center gap-1 rounded-control border px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:min-h-0 ${
            selectedStateFips
              ? "border-cobalt/35 bg-cobalt text-white"
              : "border-border-soft bg-surface-1/95 text-text-secondary hover:bg-surface-1 hover:text-text-primary"
          }`}
        >
          <span className="truncate">{selectedName ?? "选择州"}</span>
          <ChevronDown size={11} aria-hidden="true" className="shrink-0" />
        </button>
        {dropdownOpen && (
          <div
            data-testid="state-selector-dropdown"
            role="listbox"
            aria-label="选择州筛选学校"
             className="absolute right-0 top-full z-map-control mt-1 max-h-[320px] w-[240px] overflow-y-auto rounded-card border border-border-soft bg-surface-1 shadow-pop backdrop-blur-sm max-[359px]:left-0 max-[359px]:right-auto max-[359px]:w-full"
          >
            <div className="border-b border-border-soft px-3 py-2 text-[10px] font-semibold text-text-secondary">
              选择州筛选学校
            </div>
            <div className="py-1">
              {stateOptions.map((st) => (
                <button
                  key={st.fipsCode}
                  type="button"
                  role="option"
                  aria-selected={selectedStateFips === st.fipsCode}
                  onClick={() => {
                    onSelectState(st.fipsCode);
                    setDropdownOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs transition-colors hover:bg-cobalt/10 ${
                    selectedStateFips === st.fipsCode
                      ? "bg-cobalt/10 font-medium text-cobalt"
                      : "text-text-primary"
                  }`}
                >
                  <span className="w-6 text-center text-[10px] text-text-muted">
                    {st.fipsCode}
                  </span>
                  <span>{st.name}</span>
                  <span className="ml-auto text-[10px] text-text-muted">
                    {st.nameEn}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedStateFips && onClearState && <button type="button" onClick={onClearState} aria-label="清除州筛选" title="清除州筛选" className="grid h-9 w-9 place-items-center rounded-control border border-line bg-panel text-ink/60 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:h-7 sm:w-7"><X size={12} /></button>}
      {onProgramChange && <div ref={programRef} className="static min-w-0 sm:relative">
        <button type="button" data-testid="program-filter-button" aria-expanded={programOpen} onClick={() => { setProgramOpen(!programOpen); setDropdownOpen(false); }}
          title="按专业筛选学校"
          className={`flex min-h-9 max-w-[180px] items-center gap-1.5 rounded-control border px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:min-h-0 ${selectedProgram ? "border-cobalt/35 bg-cobalt text-white" : "border-line bg-panel/95 text-ink"}`}><BookOpen size={12} aria-hidden="true" /><span className="truncate">{selectedProgram || "按专业找学校"}</span><ChevronDown size={11} aria-hidden="true" /></button>
        {programOpen && <MapProgramFilter selected={selectedProgram ?? null} onSelect={(program) => { onProgramChange(program); setProgramOpen(false); }} />}
      </div>}
      {onToggleList && <button type="button" onClick={onToggleList} aria-pressed={!!listOpen} aria-label={listOpen ? "收起学校列表" : "打开学校列表"} title={listOpen ? "收起学校列表" : "打开学校列表"} className={`flex min-h-9 items-center gap-1.5 rounded-control border px-2.5 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:min-h-0 ${listOpen ? "border-cobalt/35 bg-cobalt text-white" : "border-line bg-panel/95 text-ink"}`}><List size={12} aria-hidden="true" />{listOpen ? "收起列表" : "学校列表"}{typeof schoolCount === "number" && <span className={listOpen ? "text-white/70" : "text-ink/45"}>· {schoolCount}</span>}</button>}

      {/* 3. View-mode indicator (status pill, not interactive). */}
      <span
        data-testid="map-toolbar-view-mode"
        aria-live="polite"
        className="pointer-events-none hidden rounded-control border border-border-soft bg-surface-1/95 px-2.5 py-1 text-[11px] font-medium text-text-secondary backdrop-blur sm:inline"
      >
        {viewModeLabel}
      </span>
    </div>
  );
}
