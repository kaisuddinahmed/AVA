// ============================================================================
// Heatmap — Phase 3.8.
//
// SVG renderer for click density. Consumes raw {xPct, yPct, pageUrl} points
// from /api/analytics/clicks and:
//
//   - filters by selected page URL (defaults to the page with most clicks)
//   - bins points into a cols × rows grid
//   - emits one <rect> per non-empty cell, opacity scaled by intensity
//
// No external deps. Self-contained: includes a tiny page picker and a
// legend strip. Render inside a parent that constrains width (full-width
// cards are fine — the SVG scales).
// ============================================================================

import { useMemo, useState } from "react";
import { binPoints, intensityColor, countByPage, type ClickPoint } from "../lib/heatmap-bin";

interface RawClickPoint extends ClickPoint {
  pageUrl: string;
}

interface HeatmapProps {
  points: RawClickPoint[] | null;
  cols?: number;
  rows?: number;
  /** Render aspect ratio (width:height). Default 16:9 — matches typical desktop viewport. */
  aspectRatio?: number;
}

const DEFAULT_COLS = 36;
const DEFAULT_ROWS = 20;
const DEFAULT_ASPECT = 16 / 9;

export function Heatmap({ points, cols = DEFAULT_COLS, rows = DEFAULT_ROWS, aspectRatio = DEFAULT_ASPECT }: HeatmapProps) {
  const pages = useMemo(() => countByPage(points ?? []), [points]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

  const activePage = selectedPage ?? pages[0]?.pageUrl ?? null;

  const filtered = useMemo(() => {
    if (!points || !activePage) return [];
    return points.filter((p) => p.pageUrl === activePage);
  }, [points, activePage]);

  const bins = useMemo(() => binPoints(filtered, cols, rows), [filtered, cols, rows]);

  if (!points || points.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 28, opacity: 0.4 }}>🌡</div>
        <div style={{ fontSize: 12 }}>No click data yet — heatmap will appear once visitors interact</div>
      </div>
    );
  }

  const viewW = 1000;
  const viewH = Math.round(viewW / aspectRatio);
  const cellW = viewW / cols;
  const cellH = viewH / rows;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header — page picker + summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={labelStyle}>Page</span>
        <select
          value={activePage ?? ""}
          onChange={(e) => setSelectedPage(e.target.value || null)}
          style={selectStyle}
        >
          {pages.map((p) => (
            <option key={p.pageUrl} value={p.pageUrl}>
              {truncate(p.pageUrl, 60)} ({p.count})
            </option>
          ))}
        </select>
        <span style={{ ...labelStyle, marginLeft: "auto" }}>
          {bins.total} clicks · max density {bins.max}
        </span>
      </div>

      {/* Heatmap SVG */}
      <div style={{ width: "100%", position: "relative", background: "rgba(8,26,34,0.6)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--line)" }}>
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="auto"
          role="img"
          aria-label={`Click heatmap for ${activePage ?? "selected page"}`}
        >
          {/* Subtle grid */}
          <g opacity={0.06} stroke="#8aa3b0">
            {Array.from({ length: cols + 1 }).map((_, i) => (
              <line key={`v${i}`} x1={i * cellW} y1={0} x2={i * cellW} y2={viewH} strokeWidth={0.5} />
            ))}
            {Array.from({ length: rows + 1 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * cellH} x2={viewW} y2={i * cellH} strokeWidth={0.5} />
            ))}
          </g>
          {/* Cells */}
          {bins.cells.map((cell) => {
            const t = bins.max > 0 ? cell.count / bins.max : 0;
            return (
              <rect
                key={`${cell.row}-${cell.col}`}
                x={cell.col * cellW}
                y={cell.row * cellH}
                width={cellW}
                height={cellH}
                fill={intensityColor(t)}
              />
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
        <span>cold</span>
        <div style={{ flex: 1, height: 8, borderRadius: 2, background: "linear-gradient(to right, rgba(0,0,0,0), rgba(89,184,230,0.6), rgba(232,155,59,0.85), rgba(228,87,87,0.92))" }} />
        <span>hot</span>
      </div>
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────

const emptyStyle = {
  display: "flex" as const,
  flexDirection: "column" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  height: 160,
  color: "var(--muted)",
  gap: 8,
};

const labelStyle = {
  fontFamily: "var(--font-mono)" as const,
  fontSize: 10,
  color: "var(--muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const selectStyle = {
  flex: 1,
  maxWidth: 460,
  fontSize: 11,
  padding: "4px 8px",
  background: "rgba(8,26,34,0.7)",
  border: "1px solid var(--line)",
  borderRadius: 3,
  color: "var(--text)",
  fontFamily: "var(--font-mono)" as const,
};

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
