import { type LLMOutput, type SessionContext } from "./mswim/mswim.engine.js";
import type { MSWIMResult } from "@ava/shared";
export interface FastEvalInput {
    sessionCtx: SessionContext;
    detectedFrictionIds: string[];
    pageType: string;
    eventCount: number;
    /** Optional scroll depth and session sequence from the most recent event */
    latestScrollDepthPct?: number;
    latestSessionSequence?: number;
    priorExitIntentCount?: number;
    /**
     * Total session count for this site (Story 10 network prior).
     * When < 50, the fast evaluator falls back to network-learned priors
     * for friction severity instead of the local catalog defaults.
     */
    siteTotalSessions?: number;
}
export interface FastEvalResult {
    mswimResult: MSWIMResult;
    syntheticHints: LLMOutput;
    narrative: string;
    reasoning: string;
    engine: "fast";
    abandonmentScore: number;
}
/**
 * Run a fast evaluation with zero LLM calls.
 * Same MSWIM engine, rule-derived signal hints.
 */
export declare function runFastEvaluation(input: FastEvalInput): Promise<FastEvalResult>;
/**
 * Determine if this evaluation should escalate to the full LLM path.
 * Used in "auto" engine mode to decide when the fast path isn't enough.
 */
export declare function shouldEscalateToLLM(fastResult: FastEvalResult): boolean;
interface AbandonmentInput {
    sessionAgeSec: number;
    pageType: string;
    cartValue: number;
    cartItemCount: number;
    scrollDepthPct: number;
    sessionSequence: number;
    priorExitIntentCount: number;
    detectedFrictionIds: string[];
    compositeScore: number;
}
/**
 * Compute a 0–100 abandonment risk score from session behavioural signals.
 * Higher = more likely to abandon. Does NOT call LLM.
 */
export declare function computeAbandonmentScore(input: AbandonmentInput): number;
/**
 * Infer the most contextually relevant frictionId when no event-level
 * friction was detected. Uses session state (page type, cart, flags) to
 * pick the most likely friction the visitor is experiencing.
 *
 * Priority order: specific gate flags > page type > cart state.
 * Returned frictionId feeds message template selection and voice scripts.
 */
export declare function inferFrictionFromContext(ctx: SessionContext): string;
export {};
//# sourceMappingURL=fast-evaluator.d.ts.map