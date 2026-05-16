// ============================================================================
// selector-drift.service — unit tests.
//
// Two surfaces under test:
//   (a) compareFingerprints — pure function, no I/O.
//   (b) checkDriftForSite   — runner that hits the repo + DriftAlertRepo
//                              (both mocked).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ava/db", () => ({
  SiteSelectorFingerprintRepo: {
    listForSite: vi.fn(),
    recordDrift: vi.fn().mockResolvedValue({}),
  },
  DriftAlertRepo: {
    hasRecentAlert: vi.fn(),
    createAlert: vi.fn().mockResolvedValue({}),
  },
}));

import { SiteSelectorFingerprintRepo, DriftAlertRepo } from "@ava/db";
import {
  compareFingerprints,
  checkDriftForSite,
} from "./selector-drift.service.js";

const listForSiteMock     = SiteSelectorFingerprintRepo.listForSite as ReturnType<typeof vi.fn>;
const recordDriftMock     = SiteSelectorFingerprintRepo.recordDrift as ReturnType<typeof vi.fn>;
const hasRecentAlertMock  = DriftAlertRepo.hasRecentAlert as ReturnType<typeof vi.fn>;
const createAlertMock     = DriftAlertRepo.createAlert as ReturnType<typeof vi.fn>;

beforeEach(() => {
  listForSiteMock.mockReset();
  recordDriftMock.mockReset().mockResolvedValue({});
  hasRecentAlertMock.mockReset().mockResolvedValue(false);
  createAlertMock.mockReset().mockResolvedValue({});
});

// ── Pure comparison ────────────────────────────────────────────────────────

describe("compareFingerprints", () => {
  it("score=1 when fingerprint hashes match exactly", () => {
    const r = compareFingerprints(
      { hash: "h1", selectors: { addToCart: ".btn-x" } },
      { hash: "h1", selectors: { addToCart: ".btn-z" } }, // even with different selectors
    );
    expect(r.score).toBe(1);
    expect(r.identicalHash).toBe(true);
  });

  it("score=1 when both hash AND selectors match exactly", () => {
    const r = compareFingerprints(
      { hash: "h1", selectors: { addToCart: ".btn-x", price: ".price" } },
      { hash: "h1", selectors: { addToCart: ".btn-x", price: ".price" } },
    );
    expect(r.score).toBe(1);
  });

  it("identifies missing / changed / added keys when hashes differ", () => {
    const r = compareFingerprints(
      { hash: "h1", selectors: { addToCart: ".btn", price: ".old-price", cartCount: ".badge" } },
      { hash: "h2", selectors: { addToCart: ".btn", price: ".new-price", quickView: ".q" } },
    );
    expect(r.identicalHash).toBe(false);
    expect(r.missingKeys).toContain("cartCount");
    expect(r.changedKeys).toContain("price");
    expect(r.addedKeys).toContain("quickView");
    // 1 agreed (addToCart) / 4 union (addToCart + price + cartCount + quickView) = 0.25
    expect(r.score).toBeCloseTo(0.25);
  });

  it("score=0 when no shared keys agree", () => {
    const r = compareFingerprints(
      { hash: "h1", selectors: { a: ".x" } },
      { hash: "h2", selectors: { a: ".y" } },
    );
    // 0 agreed / 1 union = 0
    expect(r.score).toBe(0);
  });

  it("typical theme reskin (half changed) lands in 0.4–0.7 warn band", () => {
    const baseline = { hash: "h1", selectors: { a: ".a", b: ".b", c: ".c", d: ".d" } };
    const current = { hash: "h2", selectors: { a: ".a", b: ".b", c: ".changed-c", d: ".changed-d" } };
    const r = compareFingerprints(baseline, current);
    // 2 agreed (a, b) / 4 union = 0.5
    expect(r.score).toBeCloseTo(0.5);
  });
});

// ── Runner — baselines and alerting ────────────────────────────────────────

function row(opts: Partial<{
  pageType: string;
  fingerprintHash: string;
  selectors: Record<string, string>;
  baselineHash: string | null;
  baselineSelectors: Record<string, string> | null;
}>) {
  return {
    id: "id_" + (opts.pageType ?? "pdp"),
    siteUrl: "https://shop.example",
    pageType: opts.pageType ?? "pdp",
    fingerprintHash: opts.fingerprintHash ?? "h-current",
    fingerprintData: "{}",
    selectors: JSON.stringify(opts.selectors ?? {}),
    baselineHash: opts.baselineHash === undefined ? "h-baseline" : opts.baselineHash,
    baselineSelectors: opts.baselineSelectors === undefined
      ? JSON.stringify({ addToCart: ".btn", price: ".p", cartCount: ".c" })
      : opts.baselineSelectors === null
        ? null
        : JSON.stringify(opts.baselineSelectors),
    baselineCapturedAt: new Date(),
    driftCount: 0,
    lastDriftAt: null,
    lastCheckedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("checkDriftForSite — split lifecycle (no baseline → no comparison)", () => {
  it("skips rows that have no baseline (no alert, no error)", async () => {
    listForSiteMock.mockResolvedValueOnce([
      row({ pageType: "pdp", baselineHash: null, baselineSelectors: null }),
    ]);
    const res = await checkDriftForSite("https://shop.example");
    expect(res.results[0]).toMatchObject({
      pageType: "pdp",
      similarity: null,
      alertEmitted: false,
      alertSuppressed: false,
    });
    expect(res.overallSimilarity).toBeNull();
    expect(createAlertMock).not.toHaveBeenCalled();
  });

  it("baseline matches current → no alert", async () => {
    listForSiteMock.mockResolvedValueOnce([
      row({
        pageType: "pdp",
        fingerprintHash: "h-baseline",
        selectors: { addToCart: ".btn", price: ".p", cartCount: ".c" },
        baselineHash: "h-baseline",
      }),
    ]);
    const res = await checkDriftForSite("https://shop.example");
    expect(res.results[0]!.similarity!.score).toBe(1);
    expect(res.results[0]!.alertEmitted).toBe(false);
    expect(createAlertMock).not.toHaveBeenCalled();
  });
});

describe("checkDriftForSite — alert emission", () => {
  it("emits a `warning` alert when similarity is in (criticalThreshold, warnThreshold)", async () => {
    // 2 agreed (addToCart, price) / 4 union (all 4 keys shared) = 0.5 → warning band.
    listForSiteMock.mockResolvedValueOnce([
      row({
        pageType: "pdp",
        fingerprintHash: "h-current",
        selectors: { addToCart: ".btn", price: ".p", cartCount: ".changed-c", banner: ".changed-b" },
        baselineHash: "h-baseline",
        baselineSelectors: { addToCart: ".btn", price: ".p", cartCount: ".c", banner: ".b" },
      }),
    ]);
    const res = await checkDriftForSite("https://shop.example");
    expect(res.results[0]!.alertEmitted).toBe(true);
    expect(createAlertMock).toHaveBeenCalledTimes(1);
    expect(createAlertMock.mock.calls[0]![0]).toMatchObject({
      siteUrl: "https://shop.example",
      alertType: "selector_drift",
      severity: "warning",
      windowType: "pdp",
      metric: "selectorSimilarity",
    });
    // Drift counter on the fingerprint row also bumped.
    expect(recordDriftMock).toHaveBeenCalledWith("https://shop.example", "pdp");
  });

  it("emits a `critical` alert when similarity is below criticalThreshold", async () => {
    listForSiteMock.mockResolvedValueOnce([
      row({
        pageType: "pdp",
        fingerprintHash: "h-current",
        selectors: { brand: ".b" }, // nothing in common with baseline
        baselineHash: "h-baseline",
        baselineSelectors: { addToCart: ".btn", price: ".p", cartCount: ".c" },
      }),
    ]);
    const res = await checkDriftForSite("https://shop.example");
    expect(res.results[0]!.alertEmitted).toBe(true);
    expect(createAlertMock.mock.calls[0]![0]!.severity).toBe("critical");
  });

  it("DOES NOT alert when similarity is above warnThreshold (most selectors stable)", async () => {
    listForSiteMock.mockResolvedValueOnce([
      row({
        pageType: "pdp",
        fingerprintHash: "h-current",
        // 4 baseline keys all agree + 1 added → 4 / 5 = 0.8, above default 0.7 warn.
        selectors: { addToCart: ".btn", price: ".p", cartCount: ".c", banner: ".b", newThing: ".x" },
        baselineHash: "h-baseline",
        baselineSelectors: { addToCart: ".btn", price: ".p", cartCount: ".c", banner: ".b" },
      }),
    ]);
    const res = await checkDriftForSite("https://shop.example");
    expect(res.results[0]!.alertEmitted).toBe(false);
    expect(createAlertMock).not.toHaveBeenCalled();
  });
});

describe("checkDriftForSite — 6h dedup window (CLAUDE.md hard rule)", () => {
  it("suppresses the second alert when one was raised in the last 6h", async () => {
    listForSiteMock.mockResolvedValue([
      row({
        pageType: "pdp",
        fingerprintHash: "h-current",
        selectors: { addToCart: ".btn" },
        baselineHash: "h-baseline",
        baselineSelectors: { addToCart: ".btn", price: ".p", cartCount: ".c", banner: ".b" },
      }),
    ]);
    hasRecentAlertMock.mockResolvedValueOnce(true);

    const res = await checkDriftForSite("https://shop.example");

    expect(res.results[0]!.alertEmitted).toBe(false);
    expect(res.results[0]!.alertSuppressed).toBe(true);
    expect(createAlertMock).not.toHaveBeenCalled();
    expect(recordDriftMock).not.toHaveBeenCalled();
  });

  it("uses pageType as the dedup discriminator so different pages alert independently", async () => {
    listForSiteMock.mockResolvedValueOnce([
      row({
        pageType: "pdp",
        fingerprintHash: "h-x",
        selectors: { addToCart: ".btn" },
        baselineHash: "h-baseline",
        baselineSelectors: { addToCart: ".btn", price: ".p", cartCount: ".c", banner: ".b" },
      }),
      row({
        pageType: "cart",
        fingerprintHash: "h-y",
        selectors: { checkout: ".chk" },
        baselineHash: "h-cart-baseline",
        baselineSelectors: { checkout: ".chk", subtotal: ".s", remove: ".r", banner: ".b" },
      }),
    ]);
    // PDP dedup says recent; cart says fresh.
    hasRecentAlertMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const res = await checkDriftForSite("https://shop.example");
    expect(res.results[0]!.alertSuppressed).toBe(true);
    expect(res.results[1]!.alertEmitted).toBe(true);
    expect(createAlertMock.mock.calls[0]![0]!.windowType).toBe("cart");
  });
});

describe("checkDriftForSite — overall similarity", () => {
  it("averages similarity across pageTypes that have a baseline (ignores ones that don't)", async () => {
    listForSiteMock.mockResolvedValueOnce([
      row({
        pageType: "pdp",
        fingerprintHash: "h-baseline",
        selectors: { addToCart: ".btn", price: ".p", cartCount: ".c" },
        baselineHash: "h-baseline",
      }), // score=1 (identical)
      row({
        pageType: "cart",
        fingerprintHash: "h-y",
        selectors: { brand: ".x" },
        baselineHash: "h-baseline",
        baselineSelectors: { addToCart: ".btn", price: ".p", cartCount: ".c" },
      }), // score=0
      row({
        pageType: "checkout",
        baselineHash: null,
        baselineSelectors: null,
      }), // skipped — no baseline
    ]);
    const res = await checkDriftForSite("https://shop.example");
    // Average of 1.0 and 0.0, ignoring the unbaselined row → 0.5
    expect(res.overallSimilarity).toBeCloseTo(0.5);
  });
});
