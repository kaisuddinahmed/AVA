import type { MSWIMSignals, MSWIMResult } from "./mswim.js";
/**
 * What the LLM returns from its analysis of a batch of events.
 */
export interface LLMEvaluationResponse {
    narrative: string;
    detected_frictions: string[];
    signals: MSWIMSignals;
    recommended_action: string;
    reasoning: string;
}
/**
 * A detected friction instance with context.
 */
export interface FrictionDetection {
    friction_id: string;
    category: string;
    confidence: number;
    evidence: string[];
    context: Record<string, unknown>;
    detected_at: number;
    source: "llm" | "rule" | "hybrid";
}
/**
 * The full evaluation result stored in the database.
 */
export interface EvaluationResult {
    evaluation_id: string;
    session_id: string;
    timestamp: number;
    event_batch_ids: string[];
    narrative: string;
    frictions_found: FrictionDetection[];
    mswim: MSWIMResult;
    intervention_type: string | null;
    decision_reasoning: string;
}
//# sourceMappingURL=evaluation.d.ts.map