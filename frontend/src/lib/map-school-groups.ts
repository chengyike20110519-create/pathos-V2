export interface ProjectedSchool { id: string; x: number; y: number }

/** Screen-space radius adapts to the map zoom so clusters stay legible. */
export function clusterRadiusForZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return 30;
  if (zoom <= 4.5) return 44;
  if (zoom >= 9) return 24;
  return Math.round(44 - ((zoom - 4.5) / 4.5) * 20);
}

/** Screen-space groups keep coincident campuses selectable even at max zoom.
 * A fixed anchor bounds group size; connected chains cannot swallow a city.
 * The active school is always kept as its own visible marker.
 */
export function groupProjectedSchools<T extends ProjectedSchool>(points: readonly T[], radius = 30, selectedId?: string | null) {
  const size = Math.max(1, radius);
  const groups: Array<{ x: number; y: number; anchorX: number; anchorY: number; members: T[] }> = [];
  const cells = new Map<string, number[]>();
  const seen = new Set<string>();
  for (const point of [...points].sort((a, b) => a.id.localeCompare(b.id))) {
    if (seen.has(point.id) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    seen.add(point.id);
    const cx = Math.floor(point.x / size), cy = Math.floor(point.y / size);
    let match: number | undefined;
    if (point.id !== selectedId) {
      for (let dx = -1; dx <= 1 && match === undefined; dx++) for (let dy = -1; dy <= 1 && match === undefined; dy++) {
        match = cells.get(`${cx + dx}:${cy + dy}`)?.find((index) => {
          const group = groups[index];
          return group.members[0].id !== selectedId && Math.hypot(group.anchorX - point.x, group.anchorY - point.y) <= size;
        });
      }
    }
    if (match === undefined) {
      const index = groups.length;
      groups.push({ x: point.x, y: point.y, anchorX: point.x, anchorY: point.y, members: [point] });
      const key = `${cx}:${cy}`;
      cells.set(key, [...(cells.get(key) ?? []), index]);
    } else {
      const group = groups[match], count = group.members.length;
      group.x = (group.x * count + point.x) / (count + 1);
      group.y = (group.y * count + point.y) / (count + 1);
      group.members.push(point);
    }
  }
  return groups;
}
