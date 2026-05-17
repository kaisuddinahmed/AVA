// ============================================================================
// heatmap-bin — Phase 3.8 unit tests (pure, no DOM).
// ============================================================================

import { describe, it, expect } from "vitest";
import { binPoints, intensityColor, countByPage } from "./heatmap-bin";

// ── binPoints ──────────────────────────────────────────────────────────────

describe("binPoints", () => {
  it("returns empty bins when input is empty", () => {
    const b = binPoints([], 10, 10);
    expect(b.cells).toEqual([]);
    expect(b.max).toBe(0);
    expect(b.total).toBe(0);
  });

  it("places points in the correct cell and counts duplicates", () => {
    const b = binPoints(
      [
        { xPct: 0.05, yPct: 0.05 }, // top-left cell
        { xPct: 0.05, yPct: 0.05 }, // dup
        { xPct: 0.95, yPct: 0.95 }, // bottom-right
      ],
      10,
      10,
    );
    expect(b.total).toBe(3);
    expect(b.cells).toHaveLength(2);
    const topLeft = b.cells.find((c) => c.row === 0 && c.col === 0);
    expect(topLeft?.count).toBe(2);
    const bottomRight = b.cells.find((c) => c.row === 9 && c.col === 9);
    expect(bottomRight?.count).toBe(1);
    expect(b.max).toBe(2);
  });

  it("clamps out-of-range values into edge cells (does not drop)", () => {
    const b = binPoints(
      [
        { xPct: -0.5, yPct: 0.5 }, // off-screen left
        { xPct: 1.7, yPct: 0.5 },  // off-screen right
        { xPct: 0.5, yPct: 1.99 }, // off-screen bottom
      ],
      10,
      10,
    );
    expect(b.total).toBe(3);
    expect(b.cells.find((c) => c.col === 0 && c.row === 5)).toBeTruthy();
    expect(b.cells.find((c) => c.col === 9 && c.row === 5)).toBeTruthy();
    expect(b.cells.find((c) => c.col === 5 && c.row === 9)).toBeTruthy();
  });

  it("drops NaN / Infinity points (does not crash)", () => {
    const b = binPoints(
      [
        { xPct: Number.NaN, yPct: 0.5 },
        { xPct: 0.5, yPct: Number.POSITIVE_INFINITY },
        { xPct: 0.5, yPct: 0.5 },
      ],
      4,
      4,
    );
    expect(b.total).toBe(1);
  });

  it("throws when cols/rows are non-positive", () => {
    expect(() => binPoints([], 0, 10)).toThrow(/cols and rows/);
    expect(() => binPoints([], 10, -1)).toThrow(/cols and rows/);
  });

  it("the value 1.0 lands in the last cell, not out-of-bounds", () => {
    const b = binPoints([{ xPct: 1, yPct: 1 }], 5, 5);
    expect(b.cells[0]).toEqual({ row: 4, col: 4, count: 1 });
  });
});

// ── intensityColor ─────────────────────────────────────────────────────────

describe("intensityColor", () => {
  it("returns fully transparent at t=0", () => {
    expect(intensityColor(0)).toBe("rgba(0, 0, 0, 0.00)");
  });

  it("returns a hot-red shade at t=1 with high alpha", () => {
    const c = intensityColor(1);
    expect(c).toMatch(/^rgba\(228, 87, 87, 0\.9\d\)$/);
  });

  it("clamps t outside [0,1]", () => {
    expect(intensityColor(-10)).toBe(intensityColor(0));
    expect(intensityColor(99)).toBe(intensityColor(1));
  });

  it("monotonic alpha rise across the gradient", () => {
    const alphas = [0.1, 0.3, 0.6, 0.9].map((t) => {
      const m = intensityColor(t).match(/, ([\d.]+)\)$/);
      return m ? Number(m[1]) : 0;
    });
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeGreaterThan(alphas[i - 1]!);
    }
  });
});

// ── countByPage ────────────────────────────────────────────────────────────

describe("countByPage", () => {
  it("aggregates counts per pageUrl and sorts desc", () => {
    const r = countByPage([
      { pageUrl: "/a" }, { pageUrl: "/a" }, { pageUrl: "/a" },
      { pageUrl: "/b" }, { pageUrl: "/b" },
      { pageUrl: "/c" },
    ]);
    expect(r).toEqual([
      { pageUrl: "/a", count: 3 },
      { pageUrl: "/b", count: 2 },
      { pageUrl: "/c", count: 1 },
    ]);
  });

  it("returns [] on empty input", () => {
    expect(countByPage([])).toEqual([]);
  });
});
