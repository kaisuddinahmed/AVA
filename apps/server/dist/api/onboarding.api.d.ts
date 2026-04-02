import type { Request, Response } from "express";
/**
 * POST /api/onboarding/start
 * Starts onboarding for a site and creates an analyzer run record.
 */
export declare function startOnboarding(req: Request, res: Response): Promise<void>;
/**
 * GET /api/onboarding/:runId/status
 * Returns current onboarding status and high-level coverage metrics.
 */
export declare function getOnboardingStatus(req: Request, res: Response): Promise<void>;
/**
 * GET /api/onboarding/:runId/results
 * Returns mapping outputs and coverage for a completed/active run.
 */
export declare function getOnboardingResults(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=onboarding.api.d.ts.map