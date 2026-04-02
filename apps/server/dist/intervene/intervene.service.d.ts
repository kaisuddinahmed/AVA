import type { DecisionOutput } from "../evaluate/decision-engine.js";
import type { EvaluationResult } from "../evaluate/evaluate.service.js";
export interface InterventionOutput {
    interventionId: string;
    sessionId: string;
    type: string;
    actionCode: string;
    frictionId: string;
    payload: Record<string, unknown>;
    mswimScore: number;
    tier: string;
    runtimeMode: "active" | "limited_active";
    guardApplied: boolean;
    guardReason?: string;
    originalType?: string;
    originalActionCode?: string;
}
/**
 * Handle a fire decision: build payload, persist intervention, update session.
 */
export declare function handleDecision(sessionId: string, decision: DecisionOutput, evaluation: EvaluationResult): Promise<InterventionOutput | null>;
/**
 * Record the outcome of an intervention (delivered, dismissed, converted, ignored).
 *
 * Passive interventions are silent UI tweaks with no user interaction.
 * The widget reports them as "ignored" immediately after execution, but
 * semantically they were "delivered" — remap server-side to keep training
 * labels accurate without touching the widget code.
 */
export declare function recordInterventionOutcome(interventionId: string, status: "delivered" | "dismissed" | "converted" | "ignored" | "voice_muted", conversionAction?: string): Promise<any>;
//# sourceMappingURL=intervene.service.d.ts.map