import { BehaviorMappingRepo, FrictionMappingRepo, } from "@ava/db";
import { BEHAVIOR_TARGET_COUNT, FRICTION_TARGET_COUNT, } from "./catalog-retriever.js";
export const FULL_ACTIVE_THRESHOLDS = {
    behaviorCoveragePct: 85,
    frictionCoveragePct: 80,
    avgConfidence: 0.75,
};
export async function verifyIntegrationReadiness(input) {
    const [behaviorMappingsRaw, frictionMappingsRaw] = await Promise.all([
        BehaviorMappingRepo.listBehaviorMappingsByRun(input.analyzerRunId, 1000),
        FrictionMappingRepo.listFrictionMappingsByRun(input.analyzerRunId, 1000),
    ]);
    const behaviorMappings = behaviorMappingsRaw;
    const frictionMappings = frictionMappingsRaw;
    const highConfidenceBehavior = behaviorMappings.filter((mapping) => mapping.confidence >= 0.75);
    const highConfidenceFriction = frictionMappings.filter((mapping) => mapping.confidence >= 0.75);
    const behaviorCoveragePct = (highConfidenceBehavior.length / BEHAVIOR_TARGET_COUNT) * 100;
    const frictionCoveragePct = (highConfidenceFriction.length / FRICTION_TARGET_COUNT) * 100;
    const combined = [...behaviorMappings, ...frictionMappings];
    const avgConfidence = combined.length > 0
        ? combined.reduce((sum, item) => sum + item.confidence, 0) / combined.length
        : 0;
    const criticalJourneys = {
        addToCart: input.trackingHooks.selectors.addToCart.length > 0,
        cart: input.trackingHooks.selectors.cartCount.length > 0 ||
            input.trackingHooks.selectors.cartTotal.length > 0,
        checkout: input.trackingHooks.selectors.checkoutButton.length > 0,
        payment: input.trackingHooks.selectors.checkoutButton.length > 0 &&
            input.trackingHooks.eventMappings.some((mapping) => mapping.category === "checkout"),
    };
    const criticalJourneysPassed = Object.values(criticalJourneys).every(Boolean);
    const passesFullActive = behaviorCoveragePct >= FULL_ACTIVE_THRESHOLDS.behaviorCoveragePct &&
        frictionCoveragePct >= FULL_ACTIVE_THRESHOLDS.frictionCoveragePct &&
        avgConfidence >= FULL_ACTIVE_THRESHOLDS.avgConfidence &&
        criticalJourneysPassed;
    const recommendedMode = passesFullActive ? "active" : "limited_active";
    const lowConfidenceBehaviorIds = behaviorMappings
        .filter((mapping) => mapping.confidence < 0.75)
        .slice(0, 100)
        .map((mapping) => mapping.patternId);
    const lowConfidenceFrictionIds = frictionMappings
        .filter((mapping) => mapping.confidence < 0.75)
        .slice(0, 100)
        .map((mapping) => mapping.frictionId);
    return {
        behaviorCoveragePct: round(behaviorCoveragePct),
        frictionCoveragePct: round(frictionCoveragePct),
        avgConfidence: round(avgConfidence),
        highConfidenceBehaviorCount: highConfidenceBehavior.length,
        highConfidenceFrictionCount: highConfidenceFriction.length,
        criticalJourneys,
        criticalJourneysPassed,
        passesFullActive,
        recommendedMode,
        feedback: {
            behaviorMissing: Math.max(0, BEHAVIOR_TARGET_COUNT - highConfidenceBehavior.length),
            frictionMissing: Math.max(0, FRICTION_TARGET_COUNT - highConfidenceFriction.length),
            lowConfidenceBehaviorIds,
            lowConfidenceFrictionIds,
        },
    };
}
function round(value) {
    return Math.round(value * 100) / 100;
}
//# sourceMappingURL=integration-verifier.js.map