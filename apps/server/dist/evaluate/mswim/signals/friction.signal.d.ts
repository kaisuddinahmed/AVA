/**
 * Adjust friction score using catalog severity cross-reference.
 * - Uses max(LLM score, catalog severity) for primary friction
 * - Multiple frictions: +5 per additional (max +15 boost)
 */
export declare function adjustFriction(llmRaw: number, detectedFrictionIds: string[]): number;
//# sourceMappingURL=friction.signal.d.ts.map