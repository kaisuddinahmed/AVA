// ============================================================================
// @ava/db — Database layer
// Re-exports Prisma client singleton and all repository functions
// ============================================================================

// Prisma client
export { prisma } from "./client.js";
export type { PrismaClient } from "./client.js";

// Repositories
export * as SessionRepo from "./repositories/session.repo.js";
export * as EventRepo from "./repositories/event.repo.js";
export * as EvaluationRepo from "./repositories/evaluation.repo.js";
export * as InterventionRepo from "./repositories/intervention.repo.js";
export * as ScoringConfigRepo from "./repositories/scoring-config.repo.js";
export * as SiteConfigRepo from "./repositories/site-config.repo.js";
export * as AnalyzerRunRepo from "./repositories/analyzer-run.repo.js";
export * as BehaviorMappingRepo from "./repositories/behavior-mapping.repo.js";
export * as FrictionMappingRepo from "./repositories/friction-mapping.repo.js";
export * as IntegrationStatusRepo from "./repositories/integration-status.repo.js";
export * as TrainingDatapointRepo from "./repositories/training-datapoint.repo.js";
export * as ShadowComparisonRepo from "./repositories/shadow-comparison.repo.js";
export * as JobRunRepo from "./repositories/job-run.repo.js";
export * as DriftSnapshotRepo from "./repositories/drift-snapshot.repo.js";
export * as DriftAlertRepo from "./repositories/drift-alert.repo.js";
export * as ExperimentRepo from "./repositories/experiment.repo.js";
export * as RolloutRepo from "./repositories/rollout.repo.js";
export * as InsightSnapshotRepo from "./repositories/insight-snapshot.repo.js";
export * as WebhookDeliveryRepo from "./repositories/webhook-delivery.repo.js";
