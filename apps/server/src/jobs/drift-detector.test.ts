// ============================================================================
// Drift Detector Tests — deduplication and anomaly detection
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DriftSnapshotData } from "./drift-detector.js";

// ---------------------------------------------------------------------------
// We test detectAnomalies logic by re-importing via the module.
// The function is internal, so we test via runDriftCheck with mocked deps.
// For dedup, we test hasRecentAlert behavior directly.
// ---------------------------------------------------------------------------

vi.mock("@ava/db", () => {
  const hasRecentAlertMock = vi.fn();
  const createAlertMock = vi.fn();
  const createSnapshotMock = vi.fn();
  const getLatestSnapshotMock = vi.fn();
  const getActiveAlertsMock = vi.fn();

  return {
    prisma: {
      shadowComparison: {
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _avg: { compositeDivergence: 0 } }),
      },
      evaluation: {
        aggregate: vi.fn().mockResolvedValue({
          _avg: {
            intentScore: null,
            frictionScore: null,
            clarityScore: null,
            receptivityScore: null,
            valueScore: null,
            compositeScore: null,
          },
        }),
      },
      intervention: {
        count: vi.fn().mockResolvedValue(0),
      },
    },
    DriftSnapshotRepo: {
      createSnapshot: createSnapshotMock.mockResolvedValue({}),
      getLatestSnapshot: getLatestSnapshotMock.mockResolvedValue(null),
    },
    DriftAlertRepo: {
      hasRecentAlert: hasRecentAlertMock.mockResolvedValue(false),
      createAlert: createAlertMock.mockResolvedValue({}),
      getActiveAlerts: getActiveAlertsMock.mockResolvedValue([]),
    },
  };
});

vi.mock("../config.js", () => ({
  config: {
    drift: {
      tierAgreementFloor: 0.85,
      decisionAgreementFloor: 0.80,
      maxCompositeDivergence: 15,
      signalShiftThreshold: 10,
      conversionRateDropPercent: 0.25,
    },
  },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are set up
// ---------------------------------------------------------------------------
const { runDriftCheck } = await import("./drift-detector.js");
const { DriftAlertRepo } = await import("@ava/db");

describe("runDriftCheck — deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no samples so no anomalies
    const { prisma } = require("@ava/db");
    prisma.shadowComparison.count.mockResolvedValue(0);
    DriftAlertRepo.getActiveAlerts.mockResolvedValue([]);
    DriftAlertRepo.hasRecentAlert.mockResolvedValue(false);
    DriftAlertRepo.createAlert.mockResolvedValue({});
  });

  it("does not create an alert when hasRecentAlert returns true", async () => {
    const { prisma } = require("@ava/db");
    // Trigger anomaly: sampleCount > 0 + low tier agreement
    prisma.shadowComparison.count
      .mockResolvedValueOnce(100)   // total (first call for 1h window)
      .mockResolvedValueOnce(60)    // tierMatches (0.60 < 0.85 floor)
      .mockResolvedValueOnce(70)    // decisionMatches
      .mockResolvedValue(0);        // rest of windows

    prisma.shadowComparison.aggregate.mockResolvedValue({
      _avg: { compositeDivergence: 5 },
    });

    // Signal existing alert → no new one created
    DriftAlertRepo.hasRecentAlert.mockResolvedValue(true);

    const result = await runDriftCheck(null);
    expect(DriftAlertRepo.createAlert).not.toHaveBeenCalled();
    expect(result.alerts).toHaveLength(0);
  });

  it("creates an alert when hasRecentAlert returns false and anomaly detected", async () => {
    const { prisma } = require("@ava/db");
    // 1h window only: total=100, tierMatches=60 (60% < 85% floor)
    prisma.shadowComparison.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(60)
      .mockResolvedValueOnce(70)
      .mockResolvedValue(0);

    prisma.shadowComparison.aggregate.mockResolvedValue({
      _avg: { compositeDivergence: 5 },
    });

    DriftAlertRepo.hasRecentAlert.mockResolvedValue(false);

    await runDriftCheck(null);
    expect(DriftAlertRepo.createAlert).toHaveBeenCalled();
  });
});

describe("runDriftCheck — summary health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { prisma } = require("@ava/db");
    prisma.shadowComparison.count.mockResolvedValue(0);
    prisma.shadowComparison.aggregate.mockResolvedValue({
      _avg: { compositeDivergence: 0 },
    });
    DriftAlertRepo.createAlert.mockResolvedValue({});
    DriftAlertRepo.hasRecentAlert.mockResolvedValue(false);
  });

  it("is healthy when no critical alerts exist", async () => {
    DriftAlertRepo.getActiveAlerts.mockResolvedValue([]);
    const result = await runDriftCheck(null);
    expect(result.summary.isHealthy).toBe(true);
    expect(result.summary.criticalAlertCount).toBe(0);
  });

  it("is NOT healthy when a critical alert exists", async () => {
    DriftAlertRepo.getActiveAlerts.mockResolvedValue([
      {
        severity: "critical",
        alertType: "tier_agreement_drop",
        windowType: "1h",
        metric: "tierAgreementRate",
        resolved: false,
      },
    ]);
    const result = await runDriftCheck(null);
    expect(result.summary.isHealthy).toBe(false);
    expect(result.summary.criticalAlertCount).toBe(1);
  });

  it("returns correct activeAlertCount from repo", async () => {
    DriftAlertRepo.getActiveAlerts.mockResolvedValue([
      { severity: "warning" },
      { severity: "warning" },
      { severity: "critical" },
    ]);
    const result = await runDriftCheck(null);
    expect(result.summary.activeAlertCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// detectAnomalies logic — tested indirectly via full run with injected data
// ---------------------------------------------------------------------------
describe("runDriftCheck — anomaly thresholds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { prisma } = require("@ava/db");
    DriftAlertRepo.createAlert.mockResolvedValue({});
    DriftAlertRepo.hasRecentAlert.mockResolvedValue(false);
    DriftAlertRepo.getActiveAlerts.mockResolvedValue([]);
    prisma.evaluation.aggregate.mockResolvedValue({
      _avg: {
        intentScore: null,
        frictionScore: null,
        clarityScore: null,
        receptivityScore: null,
        valueScore: null,
        compositeScore: null,
      },
    });
    prisma.intervention.count.mockResolvedValue(0);
    prisma.shadowComparison.aggregate.mockResolvedValue({
      _avg: { compositeDivergence: 5 },
    });
  });

  it("fires tier_agreement_drop alert when rate < floor", async () => {
    const { prisma } = require("@ava/db");
    // Only trigger 1h window: total=50, tierMatches=35 (70% < 85%)
    prisma.shadowComparison.count
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(35)
      .mockResolvedValueOnce(40)
      .mockResolvedValue(0);

    const result = await runDriftCheck(null);
    const alertTypes = result.alerts.map((a) => a.alertType);
    expect(alertTypes).toContain("tier_agreement_drop");
  });

  it("fires divergence_spike alert when avgCompositeDivergence > 15", async () => {
    const { prisma } = require("@ava/db");
    prisma.shadowComparison.count
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(45)   // tierMatches=90% ok
      .mockResolvedValueOnce(42)   // decisionMatches=84% ok
      .mockResolvedValue(0);

    prisma.shadowComparison.aggregate
      .mockResolvedValueOnce({ _avg: { compositeDivergence: 20 } })  // 1h spike
      .mockResolvedValue({ _avg: { compositeDivergence: 0 } });

    const result = await runDriftCheck(null);
    const alertTypes = result.alerts.map((a) => a.alertType);
    expect(alertTypes).toContain("divergence_spike");
  });
});
