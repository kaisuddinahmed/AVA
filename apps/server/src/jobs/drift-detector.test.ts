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
  const getDriftAggregatesSinceMock = vi.fn();
  const getAvgSignalsByOutcomeMock = vi.fn();
  const getOutcomeCountsMock = vi.fn();

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
    ShadowComparisonRepo: {
      getDriftAggregatesSince: getDriftAggregatesSinceMock.mockResolvedValue({
        total: 0,
        tierMatches: 0,
        decisionMatches: 0,
        avgCompositeDivergence: 0,
      }),
    },
    EvaluationRepo: {
      getAvgSignalsByOutcome: getAvgSignalsByOutcomeMock.mockResolvedValue({
        intentScore: null,
        frictionScore: null,
        clarityScore: null,
        receptivityScore: null,
        valueScore: null,
        compositeScore: null,
      }),
    },
    InterventionRepo: {
      getOutcomeCounts: getOutcomeCountsMock.mockResolvedValue({
        total: 0,
        converted: 0,
        dismissed: 0,
      }),
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
const {
  DriftAlertRepo,
  ShadowComparisonRepo,
  EvaluationRepo,
  InterventionRepo,
} = await import("@ava/db");
const driftAlertRepoMock = DriftAlertRepo as unknown as Record<
  "getActiveAlerts" | "hasRecentAlert" | "createAlert",
  ReturnType<typeof vi.fn>
>;
const shadowComparisonRepoMock = ShadowComparisonRepo as unknown as Record<
  "getDriftAggregatesSince",
  ReturnType<typeof vi.fn>
>;
const evaluationRepoMock = EvaluationRepo as unknown as Record<
  "getAvgSignalsByOutcome",
  ReturnType<typeof vi.fn>
>;
const interventionRepoMock = InterventionRepo as unknown as Record<
  "getOutcomeCounts",
  ReturnType<typeof vi.fn>
>;

describe("runDriftCheck — deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no samples so no anomalies
    shadowComparisonRepoMock.getDriftAggregatesSince.mockResolvedValue({
      total: 0,
      tierMatches: 0,
      decisionMatches: 0,
      avgCompositeDivergence: 0,
    });
    evaluationRepoMock.getAvgSignalsByOutcome.mockResolvedValue({
      intentScore: null,
      frictionScore: null,
      clarityScore: null,
      receptivityScore: null,
      valueScore: null,
      compositeScore: null,
    });
    interventionRepoMock.getOutcomeCounts.mockResolvedValue({
      total: 0,
      converted: 0,
      dismissed: 0,
    });
    driftAlertRepoMock.getActiveAlerts.mockResolvedValue([]);
    driftAlertRepoMock.hasRecentAlert.mockResolvedValue(false);
    driftAlertRepoMock.createAlert.mockResolvedValue({});
  });

  it("does not create an alert when hasRecentAlert returns true", async () => {
    // Trigger anomaly: sampleCount > 0 + low tier agreement
    shadowComparisonRepoMock.getDriftAggregatesSince
      .mockResolvedValueOnce({
        total: 100,
        tierMatches: 60,
        decisionMatches: 70,
        avgCompositeDivergence: 5,
      })
      .mockResolvedValue({
        total: 0,
        tierMatches: 0,
        decisionMatches: 0,
        avgCompositeDivergence: 0,
      });

    // Signal existing alert → no new one created
    driftAlertRepoMock.hasRecentAlert.mockResolvedValue(true);

    const result = await runDriftCheck(null);
    expect(driftAlertRepoMock.createAlert).not.toHaveBeenCalled();
    expect(result.alerts).toHaveLength(0);
  });

  it("creates an alert when hasRecentAlert returns false and anomaly detected", async () => {
    // 1h window only: total=100, tierMatches=60 (60% < 85% floor)
    shadowComparisonRepoMock.getDriftAggregatesSince
      .mockResolvedValueOnce({
        total: 100,
        tierMatches: 60,
        decisionMatches: 70,
        avgCompositeDivergence: 5,
      })
      .mockResolvedValue({
        total: 0,
        tierMatches: 0,
        decisionMatches: 0,
        avgCompositeDivergence: 0,
      });

    driftAlertRepoMock.hasRecentAlert.mockResolvedValue(false);

    await runDriftCheck(null);
    expect(driftAlertRepoMock.createAlert).toHaveBeenCalled();
  });
});

describe("runDriftCheck — summary health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shadowComparisonRepoMock.getDriftAggregatesSince.mockResolvedValue({
      total: 0,
      tierMatches: 0,
      decisionMatches: 0,
      avgCompositeDivergence: 0,
    });
    evaluationRepoMock.getAvgSignalsByOutcome.mockResolvedValue({
      intentScore: null,
      frictionScore: null,
      clarityScore: null,
      receptivityScore: null,
      valueScore: null,
      compositeScore: null,
    });
    interventionRepoMock.getOutcomeCounts.mockResolvedValue({
      total: 0,
      converted: 0,
      dismissed: 0,
    });
    driftAlertRepoMock.createAlert.mockResolvedValue({});
    driftAlertRepoMock.hasRecentAlert.mockResolvedValue(false);
  });

  it("is healthy when no critical alerts exist", async () => {
    driftAlertRepoMock.getActiveAlerts.mockResolvedValue([]);
    const result = await runDriftCheck(null);
    expect(result.summary.isHealthy).toBe(true);
    expect(result.summary.criticalAlertCount).toBe(0);
  });

  it("is NOT healthy when a critical alert exists", async () => {
    driftAlertRepoMock.getActiveAlerts.mockResolvedValue([
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
    driftAlertRepoMock.getActiveAlerts.mockResolvedValue([
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
    driftAlertRepoMock.createAlert.mockResolvedValue({});
    driftAlertRepoMock.hasRecentAlert.mockResolvedValue(false);
    driftAlertRepoMock.getActiveAlerts.mockResolvedValue([]);
    evaluationRepoMock.getAvgSignalsByOutcome.mockResolvedValue({
      intentScore: null,
      frictionScore: null,
      clarityScore: null,
      receptivityScore: null,
      valueScore: null,
      compositeScore: null,
    });
    interventionRepoMock.getOutcomeCounts.mockResolvedValue({
      total: 0,
      converted: 0,
      dismissed: 0,
    });
    shadowComparisonRepoMock.getDriftAggregatesSince.mockResolvedValue({
      total: 0,
      tierMatches: 0,
      decisionMatches: 0,
      avgCompositeDivergence: 5,
    });
  });

  it("fires tier_agreement_drop alert when rate < floor", async () => {
    // Only trigger 1h window: total=50, tierMatches=35 (70% < 85%)
    shadowComparisonRepoMock.getDriftAggregatesSince
      .mockResolvedValueOnce({
        total: 50,
        tierMatches: 35,
        decisionMatches: 40,
        avgCompositeDivergence: 5,
      })
      .mockResolvedValue({
        total: 0,
        tierMatches: 0,
        decisionMatches: 0,
        avgCompositeDivergence: 0,
      });

    const result = await runDriftCheck(null);
    const alertTypes = result.alerts.map((a) => a.alertType);
    expect(alertTypes).toContain("tier_agreement_drop");
  });

  it("fires divergence_spike alert when avgCompositeDivergence > 15", async () => {
    shadowComparisonRepoMock.getDriftAggregatesSince
      .mockResolvedValueOnce({
        total: 50,
        tierMatches: 45, // 90% ok
        decisionMatches: 42, // 84% ok
        avgCompositeDivergence: 20,
      })
      .mockResolvedValue({
        total: 0,
        tierMatches: 0,
        decisionMatches: 0,
        avgCompositeDivergence: 0,
      });

    const result = await runDriftCheck(null);
    const alertTypes = result.alerts.map((a) => a.alertType);
    expect(alertTypes).toContain("divergence_spike");
  });
});
