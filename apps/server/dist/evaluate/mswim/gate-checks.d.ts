import type { GateConfig } from "@ava/shared";
import { GateOverride, ScoreTier } from "@ava/shared";
export interface GateContext {
    sessionAgeSec: number;
    totalInterventionsFired: number;
    totalDismissals: number;
    totalNudges: number;
    totalActive: number;
    totalNonPassive: number;
    secondsSinceLastIntervention: number | null;
    secondsSinceLastActive: number | null;
    secondsSinceLastNudge: number | null;
    secondsSinceLastDismissal: number | null;
    frictionIdsAlreadyIntervened: string[];
    currentFrictionIds: string[];
    hasTechnicalError: boolean;
    hasOutOfStock: boolean;
    hasShippingIssue: boolean;
    hasPaymentFailure: boolean;
    hasCheckoutTimeout: boolean;
    hasHelpSearch: boolean;
}
export interface GateResult {
    override: GateOverride | null;
    action: "suppress" | "force_passive" | "force_escalate" | null;
}
/**
 * Run all 12 MSWIM gate checks. Returns the first triggered gate, or null.
 */
export declare function runGateChecks(tier: ScoreTier, gates: GateConfig, ctx: GateContext): GateResult;
//# sourceMappingURL=gate-checks.d.ts.map