// ============================================================================
// heatmap-bin — Phase 3.8.
//
// Pure helpers for the click-heatmap renderer. No DOM, no React, fully
// node-testable. Two responsibilities:
//   1. binPoints(points, cols, rows) → grid cells with counts + max/total
//   2. intensityColor(t01)            → CSS color for an intensity in [0,1]
//
// The renderer consumes binned cells (`Array<{col,row,count}>`) and the
// shared `max` so cell intensity can be normalised consistently.
// ============================================================================

export interface ClickPoint {
  /** Horizontal position as fraction of viewport width [0,1]. */
  xPct: number;
  /** Vertical position as fraction of viewport height [0,1]. */
  yPct: number;
}

export interface HeatmapCell {
  col: number;
  row: number;
  count: number;
}

export interface HeatmapBins {
  cols: number;
  rows: number;
  cells: HeatmapCell[];
  /** Largest count in any cell. 0 when no points. */
  max: number;
  /** Total points binned (after clipping). */
  total: number;
}

/**
 * Bin a set of points into a `cols × rows` grid. Points whose pct values
 * fall outside [0,1] are clipped (NOT dropped) so off-screen clicks still
 * land on the nearest edge cell. NaN / non-finite values are dropped.
 */
export function binPoints(points: readonly ClickPoint[], cols: number, rows: number): HeatmapBins {
  if (cols <= 0 || rows <= 0) {
    throw new Error(`binPoints: cols and rows must be positive (got ${cols}×${rows})`);
  }
  // Map<rowCol, count> keyed for stable iteration.
  const counts = new Map<string, number>();
  let total = 0;
  for (const p of points) {
    if (!Number.isFinite(p.xPct) || !Number.isFinite(p.yPct)) continue;
    const x = clamp01(p.xPct);
    const y = clamp01(p.yPct);
    // Inclusive lower bound, exclusive upper — clamp to [0, cols-1].
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y * rows)));
    const key = `${row},${col}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }

  const cells: HeatmapCell[] = [];
  let max = 0;
  for (const [key, count] of counts) {
    const [rowStr, colStr] = key.split(",");
    cells.push({ row: Number(rowStr), col: Number(colStr), count });
    if (count > max) max = count;
  }
  return { cols, rows, cells, max, total };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Heatmap gradient: t∈[0,1] → CSS rgba color.
 *   0.00 → fully transparent
 *   0.25 → cool blue (low density)
 *   0.55 → orange (medium)
 *   1.00 → red (hot)
 */
export function intensityColor(t01: number): string {
  const t = Math.max(0, Math.min(1, t01));
  // Stops in linear-RGB ish space. Alpha rises faster than color so empty
  // areas read as background instead of dim blue everywhere.
  if (t < 0.25) {
    // transparent → blue
    const k = t / 0.25;
    const r = lerp(0, 89, k);
    const g = lerp(0, 184, k);
    const b = lerp(0, 230, k);
    const a = lerp(0, 0.45, k);
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(2)})`;
  }
  if (t < 0.55) {
    // blue → orange
    const k = (t - 0.25) / 0.3;
    const r = lerp(89, 232, k);
    const g = lerp(184, 155, k);
    const b = lerp(230, 59, k);
    const a = lerp(0.45, 0.75, k);
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(2)})`;
  }
  // orange → red
  const k = (t - 0.55) / 0.45;
  const r = lerp(232, 228, k);
  const g = lerp(155, 87, k);
  const b = lerp(59, 87, k);
  const a = lerp(0.75, 0.92, k);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(2)})`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Convenience: aggregate raw click points by `pageUrl` for the page picker.
 * Returns entries sorted by count desc.
 */
export function countByPage<T extends { pageUrl: string }>(points: readonly T[]): Array<{ pageUrl: string; count: number }> {
  const map = new Map<string, number>();
  for (const p of points) {
    map.set(p.pageUrl, (map.get(p.pageUrl) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([pageUrl, count]) => ({ pageUrl, count }))
    .sort((a, b) => b.count - a.count);
}
