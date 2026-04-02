import { AnalyzerRunRepo, BehaviorMappingRepo, FrictionMappingRepo, IntegrationStatusRepo, } from "@ava/db";
import { OnboardingResultsQuerySchema, OnboardingStartSchema, } from "../validation/schemas.js";
import { startOnboardingRun } from "../onboarding/onboarding.service.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
const TOTAL_BEHAVIOR_PATTERNS = 614;
const TOTAL_FRICTION_SCENARIOS = 325;
/**
 * POST /api/onboarding/start
 * Starts onboarding for a site and creates an analyzer run record.
 */
export async function startOnboarding(req, res) {
    try {
        const parsed = OnboardingStartSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.issues,
            });
            return;
        }
        const result = await startOnboardingRun(parsed.data);
        res.status(201).json(result);
    }
    catch (error) {
        log.error("[API] Start onboarding error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        const statusCode = message === "Site config not found" ? 404 : 500;
        res.status(statusCode).json({ error: message });
    }
}
/**
 * GET /api/onboarding/:runId/status
 * Returns current onboarding status and high-level coverage metrics.
 */
export async function getOnboardingStatus(req, res) {
    try {
        const runId = String(req.params.runId);
        const run = await AnalyzerRunRepo.getAnalyzerRun(runId);
        if (!run) {
            res.status(404).json({ error: "Analyzer run not found" });
            return;
        }
        const [latestStatus, behaviorMapped, frictionMapped, highConfidenceBehavior, highConfidenceFriction,] = await Promise.all([
            IntegrationStatusRepo.getLatestIntegrationStatusByRun(runId),
            BehaviorMappingRepo.countDistinctBehaviorPatterns(run.siteConfigId, run.id),
            FrictionMappingRepo.countDistinctFrictions(run.siteConfigId, run.id),
            BehaviorMappingRepo.countHighConfidenceBehaviors(run.siteConfigId, run.id),
            FrictionMappingRepo.countHighConfidenceFrictions(run.siteConfigId, run.id),
        ]);
        res.json({
            run: {
                id: run.id,
                status: run.status,
                phase: run.phase,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                behaviorCoverage: run.behaviorCoverage,
                frictionCoverage: run.frictionCoverage,
                avgConfidence: run.avgConfidence,
                errorMessage: run.errorMessage,
            },
            site: {
                id: run.siteConfig.id,
                siteUrl: run.siteConfig.siteUrl,
                platform: run.siteConfig.platform,
                integrationStatus: run.siteConfig.integrationStatus,
            },
            progress: latestStatus?.progress ?? 0,
            metrics: {
                behaviorMapped,
                behaviorTarget: TOTAL_BEHAVIOR_PATTERNS,
                frictionMapped,
                frictionTarget: TOTAL_FRICTION_SCENARIOS,
                highConfidenceBehavior,
                highConfidenceFriction,
            },
            latestStatus,
        });
    }
    catch (error) {
        log.error("[API] Get onboarding status error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /api/onboarding/:runId/results
 * Returns mapping outputs and coverage for a completed/active run.
 */
export async function getOnboardingResults(req, res) {
    try {
        const runId = String(req.params.runId);
        const parsed = OnboardingResultsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({
                error: "Validation failed",
                details: parsed.error.issues,
            });
            return;
        }
        const { limit } = parsed.data;
        const run = await AnalyzerRunRepo.getAnalyzerRunWithMappings(runId, {
            behaviorLimit: limit,
            frictionLimit: limit,
        });
        if (!run) {
            res.status(404).json({ error: "Analyzer run not found" });
            return;
        }
        const [behaviorMapped, frictionMapped, latestStatus, lowConfidenceBehaviors, lowConfidenceFrictions,] = await Promise.all([
            BehaviorMappingRepo.countDistinctBehaviorPatterns(run.siteConfigId, run.id),
            FrictionMappingRepo.countDistinctFrictions(run.siteConfigId, run.id),
            IntegrationStatusRepo.getLatestIntegrationStatusByRun(runId),
            BehaviorMappingRepo.listLowConfidenceBehaviorMappings(run.siteConfigId, 0.75, 20),
            FrictionMappingRepo.listLowConfidenceFrictionMappings(run.siteConfigId, 0.75, 20),
        ]);
        res.json({
            run: {
                id: run.id,
                status: run.status,
                phase: run.phase,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                behaviorCoverage: run.behaviorCoverage,
                frictionCoverage: run.frictionCoverage,
                avgConfidence: run.avgConfidence,
                summary: run.summary,
            },
            site: {
                id: run.siteConfig.id,
                siteUrl: run.siteConfig.siteUrl,
                platform: run.siteConfig.platform,
                integrationStatus: run.siteConfig.integrationStatus,
            },
            coverage: {
                behaviorMapped,
                behaviorTarget: TOTAL_BEHAVIOR_PATTERNS,
                behaviorMissing: Math.max(0, TOTAL_BEHAVIOR_PATTERNS - behaviorMapped),
                frictionMapped,
                frictionTarget: TOTAL_FRICTION_SCENARIOS,
                frictionMissing: Math.max(0, TOTAL_FRICTION_SCENARIOS - frictionMapped),
            },
            mappings: {
                behavior: run.behaviorMappings,
                friction: run.frictionMappings,
            },
            feedback: {
                lowConfidenceBehaviorMappings: lowConfidenceBehaviors,
                lowConfidenceFrictionMappings: lowConfidenceFrictions,
            },
            latestStatus,
        });
    }
    catch (error) {
        log.error("[API] Get onboarding results error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=onboarding.api.js.map