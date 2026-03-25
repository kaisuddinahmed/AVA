export type CreateInterventionInput = {
    sessionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    frictionId: string;
    payload: string;
    mswimScoreAtFire: number;
    tierAtFire: string;
    /** Cart value at the moment the intervention was fired — used for revenue attribution */
    cartValueAtFire?: number;
};
export type InterventionOutcomeInput = {
    status: "delivered" | "dismissed" | "converted" | "ignored";
    conversionAction?: string;
};
export declare function createIntervention(data: CreateInterventionInput): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}>;
export declare function getIntervention(id: string): Promise<({
    evaluation: {
        id: string;
        sessionId: string;
        timestamp: Date;
        eventBatchIds: string;
        narrative: string;
        frictionsFound: string;
        intentScore: number;
        frictionScore: number;
        clarityScore: number;
        receptivityScore: number;
        valueScore: number;
        engine: string;
        compositeScore: number;
        weightsUsed: string;
        tier: string;
        decision: string;
        gateOverride: string | null;
        interventionType: string | null;
        reasoning: string;
        detectedBehaviors: string | null;
        abandonmentScore: number | null;
    };
} & {
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}) | null>;
export declare function recordOutcome(id: string, outcome: InterventionOutcomeInput): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}>;
export declare function getInterventionsBySession(sessionId: string): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}[]>;
export declare function getRecentInterventionsBySession(sessionId: string, limit?: number): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}[]>;
export declare function getInterventionsByStatus(status: string, limit?: number): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}[]>;
export declare function getInterventionsByType(type: string, options?: {
    status?: string;
    limit?: number;
}): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}[]>;
/**
 * Count interventions by type for a given session (for MSWIM gate checks).
 */
export declare function countInterventionsByType(sessionId: string, type: string): Promise<number>;
/**
 * Get the last intervention for a session (for cooldown checks).
 */
export declare function getLastIntervention(sessionId: string): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
} | null>;
/**
 * Get interventions for a specific friction ID (for duplicate gate checks).
 */
export declare function getInterventionsByFriction(sessionId: string, frictionId: string): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}[]>;
/**
 * List all interventions with optional limit, time filter, and site scoping.
 */
export declare function listInterventions(options?: {
    limit?: number;
    since?: Date;
    siteUrl?: string;
}): Promise<{
    status: string;
    id: string;
    sessionId: string;
    timestamp: Date;
    frictionId: string;
    evaluationId: string;
    type: string;
    actionCode: string;
    payload: string;
    deliveredAt: Date | null;
    dismissedAt: Date | null;
    convertedAt: Date | null;
    ignoredAt: Date | null;
    conversionAction: string | null;
    mswimScoreAtFire: number;
    tierAtFire: string;
    cartValueAtFire: number | null;
    cartValueAtConversion: number | null;
}[]>;
//# sourceMappingURL=intervention.repo.d.ts.map