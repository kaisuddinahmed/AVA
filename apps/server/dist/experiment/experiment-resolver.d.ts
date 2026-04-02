import type { ExperimentOverrides } from "@ava/shared";
/**
 * Resolve experiment overrides for a session. Called before the evaluation
 * pipeline selects an engine or loads MSWIM config.
 *
 * Flow:
 * 1. Check if experiments are enabled
 * 2. Find active experiment for the session's site
 * 3. Check if session already has an assignment
 * 4. If not, deterministically assign and persist
 * 5. Return variant overrides (evalEngine, scoringConfigId)
 *
 * @param sessionId  The session being evaluated
 * @param siteUrl    The site URL (for site-scoped experiments)
 * @returns Overrides to apply, or null if no experiment applies
 */
export declare function resolveExperimentOverrides(sessionId: string, siteUrl?: string): Promise<ExperimentOverrides | null>;
//# sourceMappingURL=experiment-resolver.d.ts.map