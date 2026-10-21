"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { updateSearchParam } from "@/lib/url-params";
import type { MetricId, MapViewState, MapFilters, UniversityPOI, MapRegion, NewsArticle, RegionMetric } from "@/lib/types";
import type maplibregl from "maplibre-gl";
import { METRIC_DEFINITIONS, METRIC_ORDER } from "@/config/metrics.config";
import { useDataSource } from "@/services/data-source-provider";
import {
  useDatasetManifest,
  useRegionMetrics,
  useUniversitySummaries,
} from "@/hooks/use-data-source";
import { RegionMetricSet, type RegionMetricRecord, type UniversitySummary } from "@/domain/dataset";
import { summaryToLegacyUniversityPOI } from "@/lib/legacy-mappers";
import { getSchoolNamePair } from "@/lib/school-name";
import { mapViewport, cacheableViewport, viewportContains, INITIAL_MAP_VIEWPORT } from "@/lib/map-viewport";
import { STATE_NAME_ZH, STATE_NAME_EN, abbrFromFips } from "@/config/states.config";
import type { MapCanvasProps } from "./MapCanvas";
// Stage 7B-A.1: legacy <MetricTabs> 5-button entry REMOVED from the
// map header (both desktop and mobile sub-bar). It was the OLD
// regional heatmap entry point, and clicking it updated only
// `viewState.activeMetricId` (a city-level metric) — never
// `activeRegionalMetric` — leaving the regional choropleth
// permanently invisible. The new single-source-of-truth hook
// `useRegionalMetric` replaces it. `MetricTabs.tsx` itself is
// preserved in the tree for any future side-panel use; it is no
// longer imported here.
//
// Stage 7B-A.1 Closing Patch v3 (V3-F) — Lazy import of MapCanvas.
//
// V3-F round 1: switched to a *static* `import { MapCanvas }` from
// "./MapCanvas" — eliminating the `<Lazy>` Suspense boundary at MapShell
// level. The static import compiles cleanly (tsc/lint/vitest pass) but
// re-introduces the document-level hydration mismatch in real browsers:
// Next.js RSC still treats `MapCanvas` as a serialised boundary inside
// MapShell's client body, so when MapShell mounts on the client it tries
// to hydrate a subtree that the server never emitted.
//
// V3-F round 2 (current): restore the `next/dynamic({ssr:false})` wrapper.
// The earlier plan argument was that the `<Lazy>` Suspense boundary was
// the root cause of the Strict-Mode warnings — but the *real* fix for
// those warnings is the `MapRuntimeClient` mounted gate (V3-A), which
// already prevents MapShell from ever rendering during SSR. The Lazy
// boundary now lives safely *inside* a client-only subtree, where Strict
// Mode cannot observe it during the first hydration pass.
//
// Without MapRuntimeClient, this code path *would* cause the hook-order
// warning it once did. With MapRuntimeClient gating MapShell on the
// client only, the Lazy boundary defers the maplibre bundle but never
// participates in the server-vs-client first-render compare. Hydration
// of MapShell itself happens only after `mounted === true`, by which
// time React's reconciler accepts the Lazy boundary as a normal
// client-only subtree mount.
import dynamic from "next/dynamic";
const MapCanvas = dynamic<MapCanvasProps>(
  () => import("./MapCanvas").then((m) => m.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-label="正在加载留学地图" className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#11151f] text-[#eef1f5]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(200,207,218,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(200,207,218,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="relative w-[min(320px,calc(100%-2rem))] rounded-2xl border border-[#eef1f526] bg-[#171d27]/95 p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#bd5a3e] text-sm font-semibold text-white">P</span>
            <div>
              <p className="text-sm font-semibold">正在打开留学地图</p>
              <p className="mt-0.5 text-[11px] text-[#c8cfda]/65">先准备地图，再加载学校摘要</p>
            </div>
            <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-[#c8cfda]/25 border-t-[#dd8568]" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-2 text-[11px] text-[#c8cfda]/55">
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#dd8568]" />连接地图服务</div>
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c8cfda]/45" />准备学校位置</div>
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#c8cfda]/25" />等待可交互状态</div>
          </div>
        </div>
      </div>
    ),
  },
);
import {
  isParentModeAvailable,
  useViewStateBridge,
} from "@/hooks/use-view-state-bridge";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import {
  DataEmptyState,
  PreviewErrorState,
} from "@/components/shared/data-states";
import { useCompareStore } from "@/state/compare-store";
import { RegionalStateLayer } from "./regional/RegionalStateLayer";
// Stage 7B-A.1: RegionalLayerControl is now mounted exclusively
// inside the new unified MapToolbar (see ./MapToolbar.tsx). Direct
// usage here was removed to eliminate the second heatmap entry and
// the cross-row collision with the StateSelector.
import { RegionalLegend } from "./regional/RegionalLegend";
import { RegionalHoverTooltip } from "./regional/RegionalHoverTooltip";
import { REGIONAL_METRIC_IDS, type RegionalMetricId, type RegionalMetricRecord } from "@/regional/types";
import { getRegionalCounters, getRegionalDatasetMetadata } from "@/regional/load";
import { useRegionalMetric } from "@/regional/useRegionalMetric";
import { useSelectedRegionUrl } from "@/regional/useSelectedRegionUrl";
import { MapToolbar } from "./MapToolbar";
import { useTheme } from "@/lib/theme";

// MapCanvas is imported statically at the top of this file (V3-F).
// The previous `next/dynamic({ssr:false})` wrapper that used to live
// here was removed because it introduced a `<Lazy>` Suspense boundary
// inside MapShell — React 18 Strict Mode double-render saw that as
// hook-count drift. MapShell is now guaranteed client-only via the
// MapRuntimeClient mounted gate, so the dynamic-import deferral no
// longer serves a purpose, and a static import gives React a single
// stable component shape.

import { UniversityPoiLayer } from "./UniversityPoiLayer";
import type { UniversityProfileProps } from "./UniversityProfile";
const UniversityProfile = dynamic<UniversityProfileProps>(
  () => import("./UniversityProfile").then((module) => module.UniversityProfile),
  { ssr: false, loading: () => <div role="status" className="rounded-xl border border-line bg-panel p-5 text-sm text-ink">正在打开学校卡…</div> },
);
const MapSchoolList = dynamic(() => import("./MapSchoolList"), { ssr: false });
import { UniversityHoverTooltip } from "./UniversityHoverTooltip";
// These layers/panels are only needed after the user drills into a city or
// opens the region sidebar. Keep them out of the first map bundle so the
// initial map can paint from the compact school summaries sooner.
const RegionDetailPanel = dynamic(() => import("./RegionDetailPanel").then((module) => module.RegionDetailPanel), { ssr: false });
const CityLayer = dynamic(() => import("./CityLayer").then((module) => module.CityLayer), { ssr: false });
const CityDetailPanel = dynamic(() => import("./CityDetailPanel").then((module) => module.CityDetailPanel), { ssr: false });
const CaliforniaRoadLayer = dynamic(() => import("./CaliforniaRoadLayer").then((module) => module.CaliforniaRoadLayer), { ssr: false });
import { CityChoroplethLayer } from "./CityChoroplethLayer";
import { buildCityAggregates, getCitiesByState, getStateCenter, getCityMetricDisplay, getCityMetricValue } from "@/lib/city-utils";
const ComparePanel = dynamic(() => import("./ComparePanel"), { ssr: false });
import { ResizablePanel } from "@/components/shared/ResizablePanel";
import { BottomSheet } from "@/components/shared/BottomSheet";
import {
  Compass,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronRight,
  ExternalLink,
  MapPin,
  DollarSign,
  Shield,
  GraduationCap,
  ChevronUp,
  ChevronDown,
  Calculator,
  Sparkles,
  Users,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// MapShell — top-level map module orchestrator
// ═══════════════════════════════════════════════════════════════════
//
// Responsibilities:
//  1. Holds the single source of truth for map view state
//     (active metric, selected university, panel visibility).
//  2. Renders the choropleth map canvas with overlays (controls, legend).
//  3. Renders a collapsible sidebar that shows region detail when a
//     region is selected, or the news/article feed by default.
//
// TODO: Persist view state in URL search params (nuqs / next-usequerystate)
// TODO: Connect region detail queries to Supabase when available
// TODO: Replace hardcoded news/articles with live CMS / DB feed
// TODO: Wire metric switching to MapCanvas paint expression updates (Phase 2)

// ── Initial View State ────────────────────────────────────────────

const DEFAULT_VIEW_STATE: Required<MapViewState> = {
  longitude: -98.5,
  latitude: 39.8,
  zoom: 3.5,
  bearing: 0,
  pitch: 0,
  activeMetricId: "income",
  selectedUniversityId: null,
  selectedCampusPoiId: null,
  mode: "map",
  panelOpen: true,
  // Conservative North America envelope used until MapLibre reports its
  // exact first viewport. This still avoids an unbounded all-schools query.
  viewport: INITIAL_MAP_VIEWPORT,
};

// ── Default Filters ───────────────────────────────────────────────

const DEFAULT_FILTERS: MapFilters = {
  rankingTier: null,
  maxCostRmb: null,
  minSafetyScore: null,
  countries: [],
  directFlightOnly: false,
  cssaOnly: false,
};

// ── Region Detail Shape (sidebar when user clicks a choropleth region) ──
// TODO: Replace with real MapRegion from Supabase query

interface SelectedRegionDetail {
  region: MapRegion;
  /** Top universities in this region, ordered by ranking. */
  universities: UniversityPOI[];
}

// ── Props ─────────────────────────────────────────────────────────

interface MapShellProps {
  /** Additional CSS classes applied to the outermost shell wrapper. */
  className?: string;
  /** Called with a snapshot of view state whenever it changes. */
  onViewStateChange?: (state: MapViewState) => void;
  /** Called when the user selects a university POI (pin click). */
  onUniversitySelect?: (poi: UniversityPOI | null) => void;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export function MapShell({
  className,
  onViewStateChange,
  onUniversitySelect,
}: MapShellProps) {
  // ── View State ──────────────────────────────────────────────────

  const [viewState, setViewState] =
    useState<Required<MapViewState>>(DEFAULT_VIEW_STATE);

  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // ── Hover state for the floating POI tooltip ─────────────────────
  const [hoveredUniversityId, setHoveredUniversityId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (event: PointerEvent | MouseEvent) => {
      // Limit to within the map container if possible.
      setHoverPos({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // ── Saved-set state (schools in portfolio) for marker accent ────
  const [savedUniversityIds, setSavedUniversityIds] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("pathos_portfolio");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{ id: string }>;
      if (Array.isArray(parsed)) setSavedUniversityIds(parsed.map((p) => p.id));
    } catch { /* ignore */ }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "pathos_portfolio") return;
      try {
        const raw = window.localStorage.getItem("pathos_portfolio");
        const parsed = raw ? (JSON.parse(raw) as Array<{ id: string }>) : [];
        if (Array.isArray(parsed)) setSavedUniversityIds(parsed.map((p) => p.id));
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ── Demo data toggle (separate from real choropleth) ────────────
  const [demoLayerEnabled, setDemoLayerEnabled] = useState<boolean>(true);
  // When region metrics are blocked, the real choropleth paints as a
  // uniform light fill. The "demo layer" overlay provides a labeled
  // illustrative fill so users can still see what the metric layer
  // WOULD look like, without confusing it with verified data.

  // ── Stage 7B-A.1: Regional Heatmap (state-level, 4 verified metrics) ───
  // Single source of truth: `activeRegionalMetric` from
  // `useRegionalMetric`. URL query `?region=...` is the canonical
  // persistent form. All consumers (LayerControl / RegionalStateLayer /
  // RegionalLegend / RegionalHoverTooltip) read this hook. The legacy
  // local `activeRegionalMetric` useState is REMOVED — it had no URL
  // sync and could diverge from the URL, leaving the legend off while
  // the user thought a metric was active.
  const regionalDataset = useMemo(() => getRegionalDatasetMetadata(), []);
  const regionalCounters = useMemo(() => getRegionalCounters(), []);
  const [activeRegionalMetric, setActiveRegionalMetric] = useRegionalMetric();
  const [regionalHover, setRegionalHover] = useState<{
    record: RegionalMetricRecord | null;
  }>({ record: null });

  const themeSnapshot = useTheme();
  const themeMode: "light" | "dark" = themeSnapshot.resolved;

  // ── Data via data-source hooks ───────────────────────────────────
  const dataSource = useDataSource();
  // The first map paint is global only when no state is selected. Once the
  // user opens a state, refresh the compact map set for that state instead
  // of carrying every university row through the rest of the session.
  const [selectedStateFips, setSelectedStateFips] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("state");
  });
  const [selectedProgram, setSelectedProgram] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("program")?.slice(0, 240) || null);
  useEffect(() => {
    const sync = () => setSelectedProgram(new URLSearchParams(window.location.search).get("program")?.slice(0, 240) || null);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    const center = selectedStateFips ? getStateCenter(selectedStateFips) : null;
    if (map && center) map.flyTo({ center, zoom: map.getContainer().clientWidth < 768 ? 4.6 : 5.4, duration: 450 });
  }, [selectedStateFips]);
  const manifestState = useDatasetManifest(dataSource);
  const [requestedViewport, setRequestedViewport] = useState(DEFAULT_VIEW_STATE.viewport);
  useEffect(() => {
    const next = viewState.viewport;
    if (!next || selectedStateFips) return;
    const timer = setTimeout(() => setRequestedViewport((previous) =>
      previous && viewportContains(previous, next) ? previous : cacheableViewport(next)), 250);
    return () => clearTimeout(timer);
  }, [viewState.viewport, selectedStateFips]);
  const summariesState = useUniversitySummaries(
    dataSource,
    {
      ...(selectedProgram ? { program: selectedProgram } : {}),
      ...(selectedStateFips ? {
          // The database keeps the normalized state name while the URL and
          // map geometry use FIPS. Send both forms so the filter remains
          // compatible with the imported Supabase rows.
          states: [abbrFromFips(selectedStateFips) ?? selectedStateFips],
        } : selectedProgram ? { limit: 250 } : requestedViewport
        ? { viewport: requestedViewport, limit: 250 }
        : {}),
    },
    { skip: !selectedStateFips && !selectedProgram && !viewState.viewport },
  );
  const regionMetricsState = useRegionMetrics(dataSource, {
    metricId: viewState.activeMetricId,
    granularity: "state",
  });

  const activeManifest =
    manifestState.state.status === "ready"
      ? manifestState.state.data
      : null;
  const parentReadinessKnown = activeManifest !== null;
  const parentModeAvailable =
    parentReadinessKnown &&
    isParentModeAvailable(activeManifest);

  // Phase 6: URL state bridge. Parent mode follows real manifest
  // readiness; persisted parent URLs safely downgrade once backend
  // readiness is known. While loading, the control remains hidden.
  const viewStateBridge = useViewStateBridge({
    parentModeAvailable: parentReadinessKnown
      ? parentModeAvailable
      : true,
  });

  // ── Sidebar State ───────────────────────────────────────────────

 /** Null = showing news feed; non-null = showing region detail for this FIPS code. */
  const [selectedUniversityId, setSelectedUniversityId] = useState<string | null>(null);
  const [schoolListOpen, setSchoolListOpen] = useState(() => typeof window !== "undefined" && !!new URLSearchParams(window.location.search).get("program"));
  const [schoolListScope, setSchoolListScope] = useState<string[] | null>(null);
  const [listHoveredId, setListHoveredId] = useState<string | null>(null);
  const [toolbarBottom, setToolbarBottom] = useState(112);
  const [mapGuideOpen, setMapGuideOpen] = useState(false);
  useEffect(() => {
    setSchoolListScope(null);
    setListHoveredId(null);
    setSelectedUniversityId(null);
  }, [selectedStateFips, selectedProgram]);
  // Stage 7B-A.3.1: `selectedRegionFips` is the single source of truth
  // for which state is currently highlighted on the map and shown in
  // the right sidebar. State is mirrored to the `?state=` URL param
  // via the useSelectedRegionUrl hook so Back/Forward/Refresh work.
  const [selectedRegionFipsLocal, setSelectedRegionFipsLocal] = useState<string | null>(null);
  const [cityDrilldownEnabled, setCityDrilldownEnabled] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [pillsOpen, setPillsOpen] = useState(false);
  const compare = useCompareStore();
  const compareIds = compare.ids;
  const [compareOpen, setCompareOpen] = useState(false);

  const [regionDetail, setRegionDetail] =
    useState<SelectedRegionDetail | null>(null);

  // Stage 7B-A.3.1: URL two-way sync for `?state=`. The hook keeps a
  // ref in sync with the URL and exposes a setter that updates the
  // URL and propagates the value via `onExternalChange`. The local
  // `selectedRegionFipsLocal` state mirrors the URL value so React
  // components can re-render in response to URL changes.
  const { syncFromUrl, setSelectedRegionFips } = useSelectedRegionUrl(
    useCallback((next: string | null) => {
      setSelectedRegionFipsLocal(next);
      // URL hydration and Back/Forward must restore the toolbar label as
      // well as the selected outline/sidebar.
      setSelectedStateFips(next);
    }, []),
  );
  // On first mount, sync the initial selected region from the URL
  // (handles deep-linked `/map?state=06`).
  useEffect(() => {
    syncFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The sidebar + selected outline read from this local mirror.
  const selectedRegionFips = selectedRegionFipsLocal;

  // ── Derived State ───────────────────────────────────────────────

  const activeMetricDef = METRIC_DEFINITIONS[viewState.activeMetricId];

  const allUniversities = useMemo<UniversityPOI[]>(
    () =>
      summariesState.state.status === "ready"
        ? summariesState.state.data.map((s) => summaryToLegacyUniversityPOI(s))
        : [],
    [summariesState.state],
  );

  // Phase 5: deep-link to the dedicated /university/[id] page when the
  // user wants the full profile (e.g. via the card's primary CTA or a
  // future "compare" entry point). Selection on the map still surfaces
  // the lightweight card; opening the detail route is an explicit step.
  const router = useRouter();
  const openUniversityProfile = useCallback(
    (poi: UniversityPOI) => {
      setSelectedUniversityId(null);
      router.push(`/university/${encodeURIComponent(poi.id)}`);
    },
    [router],
  );

  const regionMetricSet = useMemo<RegionMetricSet>(
    () =>
      new RegionMetricSet(
        regionMetricsState.state.status === "ready"
          ? regionMetricsState.state.data
          : [],
      ),
    [regionMetricsState.state],
  );

  // (Stage 7B-A) The legacy `legendMetadata` useMemo was removed
  // together with the deprecated `MapLegend` overlay. RegionalLegend
  // (bottom-right when a layer is active) is now the sole authoritative
  // legend in the map viewport. The previous `MapLegend` component
  // file remains in the tree only as a no-longer-mounted export
  // retained for any future regional-legend re-use.

  // Build the selector from the canonical POI adapter output. Preview v1
  // summaries expose the state abbreviation but may omit `stateFips`;
  // `summaryToLegacyUniversityPOI` derives the verified FIPS code without
  // introducing fixture data. Reading the raw optional field here produced
  // a single synthetic "00" option in backend mode.
  // State navigation must remain available even when a state has no
  // schools loaded yet. Geography labels are reference configuration;
  // school records still come exclusively from the API.
  const STATE_OPTIONS = useMemo(() => Object.entries(STATE_NAME_ZH)
    .map(([fipsCode, name]) => ({ fipsCode, name, nameEn: STATE_NAME_EN[fipsCode] ?? fipsCode }))
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn)), []);

  const selectedUniversity = useMemo(
    () => allUniversities.find((u) => u.id === selectedUniversityId) ?? null,
    [allUniversities, selectedUniversityId],
  );

  // The canonical summary backing the profile panel (always read from
  // the data-source hook — never from the legacy mapper).
  const selectedSummary = useMemo<UniversitySummary | null>(() => {
    if (!selectedUniversityId) return null;
    if (summariesState.state.status !== "ready") return null;
    return summariesState.state.data.find((s) => s.id === selectedUniversityId) ?? null;
  }, [selectedUniversityId, summariesState.state]);

  const hoveredSummary = useMemo<UniversitySummary | null>(() => {
    if (!hoveredUniversityId) return null;
    if (summariesState.state.status !== "ready") return null;
    return summariesState.state.data.find((s) => s.id === hoveredUniversityId) ?? null;
  }, [hoveredUniversityId, summariesState.state]);

  const cityAggregates = useMemo(
    () => buildCityAggregates(allUniversities),
    [allUniversities],
  );

  const visibleCities = useMemo(
    () =>
      cityDrilldownEnabled && selectedStateFips
        ? getCitiesByState(selectedStateFips, cityAggregates)
        : [],
    [cityAggregates, cityDrilldownEnabled, selectedStateFips],
  );

  const selectedCity = useMemo(
    () =>
      cityDrilldownEnabled
        ? cityAggregates.find((city) => city.id === selectedCityId) ?? null
        : null,
    [cityAggregates, cityDrilldownEnabled, selectedCityId],
  );

  // ── Handlers ────────────────────────────────────────────────────

  const flyTo = useCallback((longitude: number, latitude: number, zoom = 5.5) => {
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom, duration: 1000 });
  }, []);

  const flyToDefault = useCallback(() => {
    mapRef.current?.flyTo({ center: [-98.5, 39.8], zoom: 3.5, duration: 900 });
  }, []);

  const selectSchoolOnMap = useCallback((school: UniversitySummary) => {
    setSelectedUniversityId(school.id);
    setListHoveredId(null);
    const map = mapRef.current;
    if (!map || school.longitude === null || school.latitude === null) return;
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    if (mobile) setSchoolListOpen(false);
    // Finish the sidebar layout change before calculating the camera path;
    // resizing midway through flyTo can leave markers at the old width.
    setViewState((previous) => ({ ...previous, panelOpen: false }));
    requestAnimationFrame(() => {
      if (mapRef.current !== map) return;
      map.resize();
      map.flyTo({ center: [school.longitude!, school.latitude!], zoom: Math.max(map.getZoom(), 7), duration: 400,
        offset: mobile ? [0, -map.getContainer().clientHeight * 0.24] : [0, 0] });
    });
  }, []);

  const clearMapFilters = useCallback(() => {
    setSelectedProgram(null);
    updateSearchParam("program", null);
    setSelectedRegionFips(null);
    setSelectedStateFips(null);
    setSelectedCityId(null);
    setSelectedUniversityId(null);
    setSchoolListScope(null);
    setRequestedViewport(INITIAL_MAP_VIEWPORT);
    flyToDefault();
  }, [setSelectedRegionFips, flyToDefault]);

  const handleMetricChange = useCallback(
    (metricId: MetricId) => {
      const next = { ...viewState, activeMetricId: metricId };
     setViewState(next);
      setSelectedUniversityId(null);
     onViewStateChange?.(next);
    },
    [viewState, onViewStateChange],
  );

  const handlePanelToggle = useCallback(() => {
    const next = { ...viewState, panelOpen: !viewState.panelOpen };
    setViewState(next);
    onViewStateChange?.(next);
  }, [viewState, onViewStateChange]);

   const addToCompare = useCallback((id: string) => {
    const ok = compare.add(id);
    if (ok) setCompareOpen(true);
  }, [compare]);

  const removeFromCompare = useCallback((id: string) => {
    compare.remove(id);
    if (compare.ids.length <= 1) setCompareOpen(false);
  }, [compare]);

  const clearCompare = useCallback(() => {
    compare.clear();
    setCompareOpen(false);
  }, [compare]);

  const handleRegionClick = useCallback(
    (fipsCode: string) => {
      setSelectedRegionFips(fipsCode);
      setSelectedUniversityId(null);
      setSelectedCityId(null);

      if (cityDrilldownEnabled) {
        setSelectedStateFips(fipsCode);
        const center = getStateCenter(fipsCode);
        if (center) flyTo(center[0], center[1], 4.35);
      }

      const stateMetrics = regionMetricSet
        .recordsForFips(fipsCode)
        .filter((r) => r.granularity === "state");
      if (stateMetrics.length > 0) {
        const nameZh = STATE_NAME_ZH[fipsCode.padStart(2, "0").slice(-2)] ?? fipsCode;
        const nameEn = STATE_NAME_EN[fipsCode.padStart(2, "0").slice(-2)] ?? fipsCode;
        setRegionDetail({
          region: {
            fipsCode: fipsCode,
            name: nameZh,
            nameEn,
            granularity: "state",
            universityCount: allUniversities.filter(
              (u) => (u as unknown as { stateFips?: string }).stateFips === fipsCode
            ).length,
            metrics: stateMetrics.map((r) => ({
              fipsCode: r.fipsCode,
              granularity: r.granularity,
              metricId: r.metricId as RegionMetric["metricId"],
              value: r.value,
              rawValue: r.rawValue,
              displayValue: r.displayValue,
              year: r.year,
            })),
          },
          universities: allUniversities.filter(
            (u) => (u as unknown as { stateFips?: string }).stateFips === fipsCode
          ),
        });
        return;
      }
      // No region metrics available — show empty detail rather than
      // fabricating data. The region-metrics endpoint will populate this
      // once the backend exposes it.
      setRegionDetail(null);
    },
    [allUniversities, cityDrilldownEnabled, flyTo, regionMetricSet, setSelectedRegionFips],
  );
  const handleCityClick = useCallback((cityId: string) => {
    setSelectedCityId(cityId);
    setSelectedUniversityId(null);
    setSelectedRegionFips(null);
    setRegionDetail(null);
    // Fly to the selected city
    const city = cityAggregates.find(c => c.id === cityId);
    if (city) {
      flyTo(city.longitude, city.latitude, 9.5);
    }
  }, [cityAggregates, flyTo, setSelectedRegionFips]);

  const handleBackToState = useCallback(() => {
    setSelectedCityId(null);
    setSelectedUniversityId(null);
    if (selectedStateFips) {
      const center = getStateCenter(selectedStateFips);
      if (center) flyTo(center[0], center[1], 4.35);
    }
  }, [flyTo, selectedStateFips]);

  const handleStateSelect = useCallback((fips: string) => {
    // Selecting a state narrows schools; it must not silently enable
    // a second, unverified city metric layer over those school markers.
    setCityDrilldownEnabled(false);
    setSelectedStateFips(fips);
    setSelectedCityId(null);
    setSelectedRegionFips(fips);
  }, [setSelectedRegionFips]);

  const handleDrilldownToggle = useCallback(() => {
    setCityDrilldownEnabled((enabled) => {
      const next = !enabled;
      if (!next) {
        setSelectedStateFips(null);
        setSelectedCityId(null);
        flyToDefault();
      } else if (selectedRegionFips) {
        setSelectedStateFips(selectedRegionFips);
        const center = getStateCenter(selectedRegionFips);
        if (center) flyTo(center[0], center[1], 4.35);
      }
      return next;
    });
  }, [flyTo, flyToDefault, selectedRegionFips]);

 const handleSidebarClose = useCallback(() => {
   setSelectedRegionFips(null);
   setSelectedStateFips(null);
   setSelectedCityId(null);
   setRegionDetail(null);
    setSelectedUniversityId(null);
 }, [setSelectedRegionFips, setSelectedStateFips, setSelectedCityId, setSelectedUniversityId]);

  // ── Render ──────────────────────────────────────────────────────

  const primaryError =
    summariesState.state.status === "error"
      ? summariesState
      : null;

  if (primaryError?.state.status === "error") {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-paper px-4 ${className ?? ""}`}
        role="region"
        aria-label="留学地图错误状态"
      >
        <PreviewErrorState
          code={primaryError.state.code}
          onRetry={() => {
            manifestState.reload();
            summariesState.reload();
          }}
          className="w-full max-w-lg"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full overflow-hidden bg-paper ${className ?? ""}`}
      role="region"
      aria-label="留学地图交互面板"
    >
      {/* ── Map Panel ─────────────────────────────────────────────── */}
      <div className="relative flex flex-1 flex-col min-w-0">
        {/* Compact header bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[#eef1f526] bg-[#11151f] px-5 py-2 text-[#eef1f5]">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-none bg-[#bd5a3e] text-white">
            <Compass aria-hidden="true" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-current truncate">
              留学地图
            </h1>
            <p className="text-xs text-[#c8cfda] truncate">
              悬停看校名 · 点击看学校与专业 · 地图仅显示已收录院校
            </p>
          </div>

          {/* (Stage 7B-A.1) The legacy <MetricTabs> 5-button row was
              removed from the desktop header. The new authoritative
              regional entry is the single <RegionalLayerControl>
              inside the map toolbar (bottom-right of this file). */}

          {/* Parent is shown only when the active manifest allows it. */}
          {parentReadinessKnown && parentModeAvailable ? (
            <div className="hidden shrink-0 md:block">
              <ViewModeToggle
                mode={viewStateBridge.state.viewMode}
                onChange={viewStateBridge.setViewMode}
              />
            </div>
          ) : null}

          {/* Calculator link */}
          <a href="/match"
            aria-label="智能选校"
            title="智能选校：根据你的偏好筛选学校"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-none text-[#c8cfda] transition-colors hover:bg-[#eef1f512] hover:text-[#dd8568] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dd8568]"
          >
            <Sparkles size={18} />
          </a>
          <a href="/calculator"
            aria-label="预算计算器"
            title="预算计算器：估算留学成本"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-none text-[#c8cfda] transition-colors hover:bg-[#eef1f512] hover:text-[#dd8568] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dd8568]"
          >
            <Calculator size={18} />
          </a>
          {/* Panel toggle button */}
          <button
            type="button"
            onClick={handlePanelToggle}
            aria-label={viewState.panelOpen ? "关闭侧边栏" : "打开侧边栏"}
            title={viewState.panelOpen ? "关闭地图侧边栏" : "打开地图侧边栏"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-none text-[#c8cfda] transition-colors hover:bg-[#eef1f512] hover:text-[#dd8568] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dd8568]"
          >
            {viewState.panelOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
        </header>

        {/* (Stage 7B-A.1) The mobile <MetricTabs> sub-bar was removed —
            it duplicated the regional entry. Mobile users reach the
            regional control via the unified MapToolbar in the map
            area, which is responsive (same DOM, different layout). */}

        {/* Map canvas — fills remaining space */}
        <div className="relative flex flex-col flex-1 min-h-0">
          {(summariesState.state.status === "loading" || summariesState.refreshing || summariesState.refreshError) && (
            <div role="status" className="absolute bottom-4 left-4 z-30 max-w-[280px] rounded-lg border border-line/60 bg-panel/95 px-3 py-2 text-xs text-ink shadow-lg">
              {summariesState.refreshError ? <>更新失败，保留上次结果。<button onClick={summariesState.reload} className="ml-2 text-cobalt underline">重试</button></> : summariesState.refreshing ? "正在更新范围，保留上次学校位置…" : "正在加载学校位置…"}
            </div>
          )}
          <MapCanvas
            className="flex-1 min-h-0"
            activeMetricId={viewState.activeMetricId}
            onRegionClick={handleRegionClick}
            onMapEmptyClick={() => setSelectedUniversityId(null)}
            onViewStateChange={(next) => {
              setViewState((previous) => ({ ...previous, ...next }));
              onViewStateChange?.(next);
            }}
            onMapInit={(map) => {
              mapRef.current = map;
              // Deep links must focus their state before markers become
              // interactive. A phone's narrow US overview cannot show both coasts.
              const center = selectedStateFips ? getStateCenter(selectedStateFips) : null;
              if (center) map.jumpTo({ center, zoom: map.getContainer().clientWidth < 768 ? 4.6 : 5.4 });
              setViewState((previous) => ({
                ...previous,
                viewport: mapViewport(map.getBounds()),
              }));
            }}
          >
             {/* Keep the regional fill below all point layers so school
                markers remain visible when a heatmap is enabled. */}
             <RegionalStateLayer
               activeMetricId={activeRegionalMetric}
               themeMode={themeMode}
               onHover={(_geoId, record) => setRegionalHover({ record })}
               onClick={(geoId) => setSelectedRegionFips(geoId)}
             />
             <UniversityPoiLayer
               universities={
                 summariesState.state.status === "ready"
                   ? summariesState.state.data
                   : []
               }
               onSelect={(id) => {
                 if (id && compareOpen) {
                   addToCompare(id);
                 } else {
                   const summary = summariesState.state.status === "ready" ? summariesState.state.data.find((school) => school.id === id) : null;
                   if (summary) selectSchoolOnMap(summary);
                   else setSelectedUniversityId(id);
                 }
               }}
               onClusterSelect={(ids) => { setSchoolListScope(ids); setSchoolListOpen(true); setSelectedUniversityId(null); setHoveredUniversityId(null); }}
               onHover={(id) => setHoveredUniversityId(id)}
               highlightedId={hoveredUniversityId ?? listHoveredId}
               selectedId={selectedUniversityId}
               pinMinZoom={cityDrilldownEnabled ? 5.0 : 0}
               compareIds={compareIds}
               savedIds={savedUniversityIds}
             />
             {cityDrilldownEnabled && selectedStateFips === "06" && (
               <CaliforniaRoadLayer enabled cities={visibleCities} />
             )}
             {cityDrilldownEnabled && selectedStateFips && (
               <CityLayer
                 visibleCities={visibleCities}
                 activeMetricId={viewState.activeMetricId}
                 onCityClick={handleCityClick}
                 selectedCityId={selectedCityId}
               />
             )}
           </MapCanvas>
          {schoolListOpen && <MapSchoolList key={`${selectedStateFips}:${selectedProgram}:${schoolListScope?.join(",") ?? "all"}`}
            schools={summariesState.state.status === "ready" ? summariesState.state.data : []}
            selectedId={selectedUniversityId} scope={schoolListScope} refreshing={summariesState.refreshing || summariesState.state.status === "loading"}
            program={selectedProgram} topOffset={toolbarBottom} onSelect={selectSchoolOnMap} onHover={setListHoveredId}
            onClearProgram={() => { setSelectedProgram(null); updateSearchParam("program", null); setSchoolListScope(null); }}
            onClose={() => { setSchoolListOpen(false); setListHoveredId(null); }} onResetScope={() => setSchoolListScope(null)} onClearFilters={clearMapFilters} />}
          {!schoolListOpen && summariesState.hasLoaded && summariesState.state.status === "ready" && summariesState.state.data.length === 0 && !summariesState.refreshing && !summariesState.refreshError &&
            <div role="status" className="absolute bottom-5 left-3 z-map-toolbar max-w-[min(320px,calc(100%-1.5rem))] rounded-xl border border-line bg-panel/95 p-4 text-xs leading-6 text-ink shadow-panel lg:left-16">
              <p>{selectedProgram ? "当前专业与地区组合暂无已收录学校。" : selectedStateFips ? "该州当前尚未收录学校。" : "当前地图范围暂无已收录学校。"}这不代表没有学校。</p>
              <button onClick={clearMapFilters} className="mt-2 rounded-lg border border-line px-3 py-1.5 text-cobalt">清除筛选，查看全部学校</button>
            </div>}
          {/* ── Hover tooltip (follows cursor; pointer-events:none) ── */}
          <UniversityHoverTooltip
            summary={hoveredUniversityId === selectedUniversityId ? null : hoveredSummary}
            x={hoverPos.x}
            y={hoverPos.y}
          />
          { (compareOpen || compareIds.length > 0) && (
            <ComparePanel
              universities={allUniversities}
              selectedIds={compareIds}
              onRemove={removeFromCompare}
              onClear={clearCompare}
              onClose={() => { compare.clear(); setCompareOpen(false); }}
            />
          )}
          <div className={`absolute bottom-4 left-3 z-map-toolbar lg:left-16 ${schoolListOpen ? "hidden" : ""}`}>
            {mapGuideOpen && (
              <section id="map-guide" aria-label="地图使用说明" className="mb-2 w-[min(290px,calc(100vw-2rem))] rounded-xl border border-line/70 bg-panel/95 p-3 text-xs text-ink shadow-panel backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">地图怎么用</h2>
                    <p className="mt-0.5 text-[10px] text-ink/45">先定位，再看学校卡片</p>
                  </div>
                  <button type="button" aria-label="关闭地图使用说明" onClick={() => setMapGuideOpen(false)} className="rounded-md px-1.5 py-0.5 text-ink/45 hover:bg-line/20 hover:text-ink">×</button>
                </div>
                <ol className="mt-3 space-y-2 text-[11px] leading-relaxed text-ink/70">
                  <li className="flex gap-2"><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-cobalt text-[9px] font-semibold text-white">1</span><span><strong className="text-ink">单个圆点</strong>：点击后打开大学信息卡。</span></li>
                  <li className="flex gap-2"><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-cobalt text-[9px] font-semibold text-white">2</span><span><strong className="text-ink">数字圆点</strong>：代表附近多所学校，点击后先看学校列表。</span></li>
                  <li className="flex gap-2"><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-cobalt text-[9px] font-semibold text-white">3</span><span><strong className="text-ink">按专业找学校</strong>：筛选后可从列表逐所打开信息卡。</span></li>
                </ol>
                <p className="mt-3 border-t border-line/50 pt-2 text-[10px] text-ink/45">信息卡里可继续查看专业目录、已核验亮点和来源。</p>
              </section>
            )}
            <button type="button" aria-expanded={mapGuideOpen} aria-controls="map-guide" onClick={() => setMapGuideOpen((open) => !open)} title="查看地图使用说明" className="flex items-center gap-1.5 rounded-full border border-line/70 bg-panel/95 px-3 py-2 text-[11px] font-medium text-ink/70 shadow-panel backdrop-blur transition-colors hover:border-cobalt/40 hover:text-cobalt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
              <HelpCircle size={13} aria-hidden="true" /> 怎么用
            </button>
          </div>
          {/* ── Edge-docked profile (desktop right, mobile bottom sheet) ──
              Replaces the legacy centered blocking modal. The map stays
              draggable; the user can keep exploring while the panel is
              open. Escape closes; clicking map empty space closes (the
              MapCanvas `map.on("click")` handler routes that to
              `setSelectedUniversityId(null)` when no POI was hit). We
              intentionally do NOT render a full-bleed transparent
              backdrop here — that intercepts mousedown / wheel /
              touch and locks the user out of MapLibre drag/zoom. */}
          {selectedSummary && (
            <>
              {/* Desktop right-docked popover. Stage 7B-A.3: shifted
                  down from top-3 to top-14 to clear the unified
                  MapToolbar (which itself sits at top-3). The profile
                  is therefore no longer in the same top-right corner
                  anchor; the toolbar remains reachable when the
                  profile is open. */}
              <div className="absolute right-3 top-14 z-map-profile hidden h-[calc(100%-4.25rem)] w-[min(420px,calc(100%-1.5rem))] lg:block" style={{ top: Math.max(56, toolbarBottom), height: `calc(100% - ${Math.max(56, toolbarBottom) + 12}px)` }}>
                <UniversityProfile
                  summary={selectedSummary}
                  inCompare={compareIds.includes(selectedSummary.id)}
                  onAddToCompare={() => addToCompare(selectedSummary.id)}
                  onRemoveFromCompare={() => removeFromCompare(selectedSummary.id)}
                  onViewProfile={() => openUniversityProfile({ id: selectedSummary.id } as UniversityPOI)}
                  onClose={() => setSelectedUniversityId(null)}
                />
              </div>
              {/* Mobile bottom sheet */}
              <div className="lg:hidden">
                <BottomSheet
                  key={selectedSummary.id}
                  defaultSnap="half"
                  title="学校详情"
                  onEscape={() => setSelectedUniversityId(null)}
                >
                  <UniversityProfile
                    summary={selectedSummary}
                    inCompare={compareIds.includes(selectedSummary.id)}
                    onAddToCompare={() => addToCompare(selectedSummary.id)}
                    onRemoveFromCompare={() => removeFromCompare(selectedSummary.id)}
                    onViewProfile={() => openUniversityProfile({ id: selectedSummary.id } as UniversityPOI)}
                    onClose={() => setSelectedUniversityId(null)}
                  />
                </BottomSheet>
              </div>
            </>
          )}
          {/* Regional legend (bottom-right when active) */}
          {activeRegionalMetric && (
            <div className={`absolute right-4 z-map-legend w-[calc(100%-2rem)] max-w-[320px] max-[359px]:w-[calc(100%-4rem)] ${
              selectedSummary || selectedRegionFips || selectedCity ? "bottom-28 lg:bottom-12" : "bottom-12"
            }`}>
              <RegionalLegend
                activeMetricId={activeRegionalMetric}
                themeMode={themeMode}
                verifiedCount={Math.round(regionalCounters.verifiedCount / REGIONAL_METRIC_IDS.length)}
                totalCount={51}
                sourceWorkbookSha256={regionalDataset.sourceWorkbookSha256}
              />
            </div>
          )}

          {/* Stage 7R: regional hover tooltip */}
          <RegionalHoverTooltip
            hoveredRecord={selectedSummary || hoveredSummary ? null : regionalHover.record}
            pointer={hoverPos}
          />

          {/* Stage 7B-A.1: single unified MapToolbar — the only map overlay
              toolbar. Replaces the legacy right-3 top-3 z-10 flex row that
              stacked RegionalLayerControl + StateSelector + visibility badge
              + drill-down helper side-by-side and overflowed at mobile widths.
              The toolbar renders all three controls in one flex-wrap row
              (z-map-toolbar=22) and never grows past the viewport edge. */}
          <MapToolbar
            onBottomChange={setToolbarBottom}
            activeRegionalMetric={activeRegionalMetric}
            setActiveRegionalMetric={setActiveRegionalMetric}
            cityDrilldownEnabled={cityDrilldownEnabled}
            selectedStateFips={selectedStateFips}
            onSelectState={handleStateSelect}
            selectedProgram={selectedProgram}
            onProgramChange={(program) => { setSelectedProgram(program); updateSearchParam("program", program); setSchoolListScope(null); setSchoolListOpen(true); }}
            listOpen={schoolListOpen}
            schoolCount={summariesState.state.status === "ready" ? summariesState.state.data.length : allUniversities.length}
            onToggleList={() => { setSchoolListOpen((open) => !open); setSchoolListScope(null); setListHoveredId(null); }}
            onClearState={() => { setSelectedRegionFips(null); setSelectedStateFips(null); setSchoolListScope(null); flyToDefault(); }}
            stateOptions={STATE_OPTIONS}
            viewModeLabel={
              selectedCity
                ? "城市详情"
                : cityDrilldownEnabled && selectedStateFips
                  ? (STATE_OPTIONS.find(s => s.fipsCode === selectedStateFips)?.name || selectedStateFips) +
                    " 城市级 · " +
                    visibleCities.reduce((s, c) => s + c.universityCount, 0) +
                    " 所大学"
                  : `已收录 ${allUniversities.length} 所学校`
            }
          />

          {cityDrilldownEnabled && selectedStateFips && visibleCities.length > 0 && (
            <div className="absolute left-16 top-4 z-map-control hidden w-[280px] rounded-xl border border-line bg-white/92 p-3 text-xs shadow-panel backdrop-blur lg:block">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">城市级数据</div>
                  <div className="text-[11px] text-ink/48">{activeMetricDef.label} · {visibleCities.length} 个城市 · {visibleCities.reduce((s,c)=>s + c.universityCount, 0)} 所大学</div>
                </div>
                <span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-[10px] font-medium text-cobalt">City Layer</span>
              </div>
              <ol className="space-y-1.5">
                {[...visibleCities]
                  .sort((a, b) => getCityMetricValue(b, viewState.activeMetricId) - getCityMetricValue(a, viewState.activeMetricId))
                  .slice(0, 5)
                  .map((city, index) => (
                    <li key={city.id}>
                      <button
                        type="button"
                        onClick={() => handleCityClick(city.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                          selectedCity?.id === city.id
                            ? "border-cobalt/35 bg-cobalt/8"
                            : "border-line/60 bg-white/70 hover:border-cobalt/25 hover:bg-cobalt/[0.03]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="mr-1 text-ink/36">#{index + 1}</span>
                          <span className="font-medium text-ink">{city.nameZh}</span>
                          <span className="ml-1 text-ink/40">{city.universityCount}所</span>
                        </span>
                        <span className="shrink-0 font-semibold text-ink">{getCityMetricDisplay(city, viewState.activeMetricId)}</span>
                      </button>
                    </li>
                  ))}
              </ol>
              <p className="mt-2 rounded-lg bg-paper px-2 py-1.5 text-[10px] leading-relaxed text-ink/44">
                当前为城市聚合数据层；真实市级收入/道路/边界可继续接入 ACS city metrics 与 city roads GeoJSON。
              </p>
            </div>
          )}
          {/* (Stage 7B-A) Duplicate MapLegend removed — RegionalLegend
              at bottom-right (line ~795) is the authoritative single
              legend. MapLegend is no longer rendered anywhere; its
              component file remains in tree only as a deprecated
              export kept for potential future use. */}
        </div>
      </div>

      {/* Tablet and phone region detail uses the same non-modal sheet as
          university profiles. This avoids squeezing a 360px desktop sidebar
          beside a tablet-sized map while preserving the canonical state list. */}
      {viewState.panelOpen && !selectedSummary && (selectedRegionFips || selectedCity) && (
        <div className="lg:hidden">
          <BottomSheet
            storageKey="pathos:map:region-snap"
            title={
              selectedCity
                ? selectedCity.nameZh
                : STATE_NAME_ZH[selectedRegionFips!] ?? selectedRegionFips!
            }
            onEscape={handleSidebarClose}
            data-testid="region-detail-bottom-sheet"
          >
            <div className="flex h-full flex-col overflow-hidden">
              {selectedCity ? (
                <CityDetailPanel
                  city={selectedCity}
                  onBack={handleBackToState}
                  onUniversitySelect={setSelectedUniversityId}
                  selectedUniversityId={selectedUniversityId}
                  onAddToCompare={addToCompare}
                />
              ) : (
                <RegionDetailPanel
                  stateFips={selectedRegionFips!}
                  activeMetricId={viewState.activeMetricId}
                  activeRegionalMetric={activeRegionalMetric}
                  universities={allUniversities}
                  onClose={handleSidebarClose}
                  onUniversitySelect={setSelectedUniversityId}
                  selectedUniversityId={selectedUniversityId}
                />
              )}
            </div>
          </BottomSheet>
        </div>
      )}

      {/* ── Sidebar Panel (resizable on desktop; hidden on tablet/mobile) ── */}
      {viewState.panelOpen && (
        <div className="hidden lg:block">
          <ResizablePanel
            edge="right"
            storageKey="pathos:map:sidebar"
            defaultWidth={360}
            minSize={280}
            maxSize={520}
            className="h-full border-l border-line bg-panel"
          >
            {selectedCity ? (
              <CityDetailPanel
                city={selectedCity}
                onBack={handleBackToState}
                onUniversitySelect={setSelectedUniversityId}
                selectedUniversityId={selectedUniversityId}
                onAddToCompare={addToCompare}
              />
            ) : selectedRegionFips ? (
              // Stage 7B-A.3.1: drive the right panel from
              // `selectedRegionFips` directly. The previous gate
              // `selectedRegionFips && regionDetail` would fall through
              // to the empty state whenever the Preview Bundle marked
              // `region-metrics:disabled` (regionMetricSet empty →
              // regionDetail null). We now always render the
              // RegionDetailPanel when a state is selected, computing
              // the universities list from the canonical
              // `allUniversities` filter on `stateFips`, not from the
              // region-metrics endpoint.
              <RegionDetailPanel
                stateFips={selectedRegionFips}
                activeMetricId={viewState.activeMetricId}
                activeRegionalMetric={activeRegionalMetric}
                universities={allUniversities}
                onClose={handleSidebarClose}
                onUniversitySelect={setSelectedUniversityId}
              />
            ) : (
              <SidebarEmptyState />
            )}
          </ResizablePanel>
        </div>
      )}
    </div>
  );
}

function SidebarEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-ink/5 text-ink/20 mb-3">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="10" r="3" />
          <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink/60">点击地图上的州或城市</p>
      <p className="mt-1 text-xs text-ink/40">查看区域指标详情和附近大学</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RegionDetailSidebar — shown when a choropleth region is clicked
// ═══════════════════════════════════════════════════════════════════

function RegionDetailSidebar({
  detail,
  activeMetricId,
  onClose,
}: {
  detail: SelectedRegionDetail;
  activeMetricId: MetricId;
  onClose: () => void;
}) {
  const { region, universities } = detail;
  const activeMetric = region.metrics.find((m) => m.metricId === activeMetricId);
  const metricDef = METRIC_DEFINITIONS[activeMetricId];

  return (
    <>
      {/* Sidebar header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">
            {region.name}
          </h2>
          <p className="text-xs text-ink/48">{region.nameEn}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭区域详情"
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink/44 transition-colors hover:bg-line/40 hover:text-ink"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Metric summary cards */}
      <div className="border-b border-line px-4 py-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/44">
          指标概览
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {region.metrics.slice(0, 6).map((m) => {
            const def = METRIC_DEFINITIONS[m.metricId];
            const isActive = m.metricId === activeMetricId;
            return (
              <div
                key={m.metricId}
                className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? "border-cobalt/30 bg-cobalt/5"
                    : "border-line/60 bg-white/60"
                }`}
              >
                <div className="text-ink/48">{def.label}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink">
                  {m.displayValue}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* University list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/44">
          该区域大学
          <span className="ml-1.5 rounded bg-ink/8 px-1.5 py-0.5 text-[10px]">
            {universities.length}
          </span>
        </h3>
        {universities.length === 0 ? (
          <p className="text-xs text-ink/40 italic">数据补充中</p>
        ) : (
          <ul className="space-y-2" role="list">
            {universities.map((uni) => (
              <li
                key={uni.id}
                className="rounded-lg border border-line/70 bg-white px-3 py-2.5 text-xs transition-colors hover:border-cobalt/30 hover:bg-cobalt/[0.03]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">
                      {getSchoolNamePair(uni).zh}
                      <span className="block text-[10px] text-ink/45" lang="en">{getSchoolNamePair(uni).en}</span>
                    </div>
                    <div className="truncate text-ink/52">{uni.name}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-ink/8 px-1.5 py-0.5 text-[10px] font-medium text-ink/56">
                    {uni.rankingBand}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ink/48">
                  <span className="inline-flex items-center gap-1">
                    <DollarSign size={10} />
                    {typeof uni.annualCostRmb === "number" && uni.annualCostRmb > 0
                      ? `¥${(uni.annualCostRmb / 10000).toFixed(1)}万/年`
                      : "学费数据补充中"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Shield size={10} />
                    {typeof uni.safetyScore === "number" && uni.safetyScore > 0
                      ? `${uni.safetyScore}分`
                      : "数据补充中"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// NewsFeedSidebar — default sidebar content with articles feed
// ═══════════════════════════════════════════════════════════════════

function NewsFeedSidebar({ articles }: { articles: NewsArticle[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">留学资讯</h2>
        <p className="text-xs text-ink/48">点击查看详情 · 共 {articles.length} 条</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {articles.length === 0 ? (
          <DataEmptyState title="数据补充中" description="暂无资讯" className="m-4" />
        ) : (
          <ul className="divide-y divide-line/60" role="list">
            {articles.map((article) => {
              const isExpanded = expandedId === article.id;
              return (
                <li key={article.id}>
                  <div className="px-4 py-3 transition-colors hover:bg-ink/[0.03]">
                    <button
                      onClick={() => toggleExpand(article.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="flex-1 text-xs font-medium leading-snug text-ink">
                          {article.title}
                        </h3>
                        <ChevronDown
                          size={12}
                          className={"shrink-0 mt-0.5 text-ink/24 transition-transform " + (isExpanded ? "rotate-180" : "")}
                        />
                      </div>
                      <p className={"mt-1 text-[11px] leading-relaxed text-ink/52 " + (isExpanded ? "" : "line-clamp-2")}>
                        {article.summary}
                      </p>
                    </button>
                    {isExpanded && (
                      <div className="mt-2 animate-fade-in">
                        <p className="text-[11px] leading-relaxed text-ink/60 whitespace-pre-line">
                          {article.summary}
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-cobalt/10 px-2.5 py-1 text-[11px] font-medium text-cobalt transition-colors hover:bg-cobalt/20"
                          >
                            <ExternalLink size={11} />
                            查看原文
                          </a>
                          <span className="text-[10px] text-ink/36">来源: {article.source}</span>
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-ink/36">
                      <span>{article.source}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={article.publishedAt}>
                        {formatRelativeDate(article.publishedAt)}
                      </time>
                      <span
                        className="ml-auto rounded-full bg-ink/6 px-1.5 py-0.5 text-[10px]"
                        aria-label={`分类: ${article.category}`}
                      >
                        {NEWS_CATEGORY_LABELS[article.category] ?? article.category}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}


// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

const NEWS_CATEGORY_LABELS: Record<string, string> = {
  admissions: "招生",
  visa: "签证",
  ranking: "排名",
  life: "生活",
  career: "就业",
  policy: "政策",
};

/** Simple relative date formatter (Chinese labels).
 *  TODO: Replace with a proper i18n date library (dayjs / date-fns). */
function formatRelativeDate(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;

  const months = Math.floor(days / 30);
  return `${months}个月前`;
}
