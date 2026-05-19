// ============================================================================
// @ava/db — package export smoke test.
//
// Verifies that every repository the public surface advertises is actually
// importable. Catches the "Module '@ava/db' has no exported member X" class
// of regressions before they reach apps/server typecheck.
//
// We mock @prisma/client so this test runs without requiring `prisma generate`
// (which needs network access to download engine binaries in CI).
// ============================================================================

import { describe, it, expect, vi } from "vitest";

vi.mock("@prisma/client", () => ({
  PrismaClient: class { constructor() { /* no-op stub */ } },
  Prisma: {},
}));

const db = await import("./index.js");

describe("@ava/db exports (smoke)", () => {
  const requiredRepos = [
    "SessionRepo",
    "EventRepo",
    "EvaluationRepo",
    "InterventionRepo",
    "ScoringConfigRepo",
    "SiteConfigRepo",
    "AnalyzerRunRepo",
    "BehaviorMappingRepo",
    "FrictionMappingRepo",
    "IntegrationStatusRepo",
    "TrainingDatapointRepo",
    "ShadowComparisonRepo",
    "JobRunRepo",
    "DriftSnapshotRepo",
    "DriftAlertRepo",
    "ExperimentRepo",
    "RolloutRepo",
    "InsightSnapshotRepo",
    "WebhookDeliveryRepo",
    "NetworkPatternRepo",
    "VisitorAddressRepo",
    "InterventionFeedbackRepo",
    "ModelVersionRepo",
    "RetrainTriggerRepo",
    // Phase 0.9 additions
    "SiteMapRepo",
    "SiteCatalogRepo",
    "SiteSelectorFingerprintRepo",
    "ConversationStateRepo",
    "RecommendationRepo",
    "RecommendationOutcomeRepo",
    // Thinking Layer 2026-05-19
    "VisitorMindRepo",
    "MoveOutcomeRepo",
    "MerchantCoachingRepo",
  ];

  it("exports every required repository namespace", () => {
    for (const name of requiredRepos) {
      expect(db, `missing export: ${name}`).toHaveProperty(name);
      expect(typeof (db as Record<string, unknown>)[name]).toBe("object");
    }
  });

  it("exposes the Prisma client singleton", () => {
    expect(db.prisma).toBeDefined();
  });
});
