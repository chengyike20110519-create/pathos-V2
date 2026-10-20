import type { UniversityQuery } from "@/domain/dataset";

type Viewport = NonNullable<UniversityQuery["viewport"]>;
export const INITIAL_MAP_VIEWPORT: Viewport = { west: -130, south: 20, east: -60, north: 55 };

/** Outward rounding keeps edge schools while making nearby pans cacheable. */
export function cacheableViewport(bounds: Viewport): Viewport {
  return { west: Math.max(-180, Math.floor(bounds.west / 5) * 5),
    east: Math.min(180, Math.ceil(bounds.east / 5) * 5),
    south: Math.max(-90, Math.floor(bounds.south / 5) * 5),
    north: Math.min(90, Math.ceil(bounds.north / 5) * 5) };
}

export function viewportContains(outer: Viewport, inner: Viewport): boolean {
  if (inner.south < outer.south || inner.north > outer.north) return false;
  const intervals = (box: Viewport) => box.west <= box.east ? [[box.west, box.east]] : [[box.west, 180], [-180, box.east]];
  return intervals(inner).every(([west, east]) => intervals(outer).some(([left, right]) => west >= left && east <= right));
}

/** Normalize MapLibre world copies into the API's WGS84 coordinate range. */
export function mapViewport(bounds: {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}): NonNullable<UniversityQuery["viewport"]> {
  const west = bounds.getWest();
  const east = bounds.getEast();
  const wrap = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
  const fullWorld = east - west >= 360;
  return {
    west: fullWorld ? -180 : wrap(west),
    east: fullWorld ? 180 : wrap(east),
    south: Math.max(-90, bounds.getSouth()),
    north: Math.min(90, bounds.getNorth()),
  };
}
