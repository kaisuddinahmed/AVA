import type { GateConfig } from "@ava/shared";
import { GateOverride, ScoreTier } from "@ava/shared";

export interface GateContext {
  sessionAgeSec: number;
  totalInterventionsFired: number;
  totalDismissals: number;
  totalNudges: number;
  totalActive: number;
  totalNonPassive: number;
  secondsSinceLastIntervention: number | null;  // any tier — PASSIVE cooldown
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
export function runGateChecks(
  tier: ScoreTier,
  gates: GateConfig,
  ctx: GateContext
): GateResult {
  // ============ 6 SUPPRESS GATES ============

  // Gate 1: Session too young
  if (ctx.sessionAgeSec < gates.minSessionAgeSec && tier !== ScoreTier.ESCALATE) {
    return { override: GateOverride.SESSION_TOO_YOUNG, action: "suppress" };
  }

  // Gate 2: Receptivity floor (handled by score, but dismiss cap)
  if (ctx.totalDismissals >= gates.dismissalsToSuppress) {
    return { override: GateOverride.DISMISS_CAP, action: "suppress" };
  }

  // Gate 3: Duplicate friction (already intervened on same friction ID)
  const duplicateFriction = ctx.currentFrictionIds.find((id) =>
    ctx.frictionIdsAlreadyIntervened.includes(id)
  );
  if (duplicateFriction && tier < ScoreTier.ESCALATE) {
    return { override: GateOverride.DUPLICATE_FRICTION, action: "suppress" };
  }

  // Gate 3b: PASSIVE global cooldown — prevent any tier from firing within 30s of
  //   the last intervention of any type. This is the primary race-condition guard:
  //   even if two evaluations load history before either commits, the second will
  //   still be suppressed once the first intervention is committed.
  //   Also prevents repeated PASSIVE fires when the inferred frictionId (e.g. F002)
  //   changes between evaluations due to LLM vs fast-engine path differences.
  const PASSIVE_COOLDOWN_SEC = 30;
  if (
    ctx.secondsSinceLastIntervention !== null &&
    ctx.secondsSinceLastIntervention < PASSIVE_COOLDOWN_SEC &&
    tier <= ScoreTier.PASSIVE
  ) {
    return { override: GateOverride.COOLDOWN_ACTIVE, action: "suppress" };
  }

  // Gate 4: Cooldown after ACTIVE intervention
  if (
    ctx.secondsSinceLastActive !== null &&
    ctx.secondsSinceLastActive < gates.cooldownAfterActiveSec &&
    tier < ScoreTier.ESCALATE
  ) {
    return { override: GateOverride.COOLDOWN_ACTIVE, action: "suppress" };
  }

  // Gate 5: Cooldown after NUDGE
  if (
    ctx.secondsSinceLastNudge !== null &&
    ctx.secondsSinceLastNudge < gates.cooldownAfterNudgeSec &&
    tier <= ScoreTier.NUDGE
  ) {
    return { override: GateOverride.COOLDOWN_ACTIVE, action: "suppress" };
  }

  // Gate 6: Session caps
  if (ctx.totalActive >= gates.maxActivePerSession) {
    if (tier === ScoreTier.ACTIVE) {
      return { override: GateOverride.SESSION_CAP, action: "suppress" };
    }
  }
  if (ctx.totalNudges >= gates.maxNudgePerSession) {
    if (tier === ScoreTier.NUDGE) {
      return { override: GateOverride.SESSION_CAP, action: "suppress" };
    }
  }
  if (ctx.totalNonPassive >= gates.maxNonPassivePerSession) {
    if (tier !== ScoreTier.PASSIVE && tier !== ScoreTier.MONITOR) {
      return { override: GateOverride.SESSION_CAP, action: "suppress" };
    }
  }

  // ============ 3 FORCE-PASSIVE GATES ============

  if (ctx.hasTechnicalError && tier > ScoreTier.PASSIVE) {
    return { override: GateOverride.FORCE_PASSIVE_TECHNICAL, action: "force_passive" };
  }

  if (ctx.hasOutOfStock && tier > ScoreTier.PASSIVE) {
    return { override: GateOverride.FORCE_PASSIVE_OOS, action: "force_passive" };
  }

  if (ctx.hasShippingIssue && tier > ScoreTier.PASSIVE) {
    return { override: GateOverride.FORCE_PASSIVE_SHIPPING, action: "force_passive" };
  }

  // ============ 3 FORCE-ESCALATE GATES ============

  if (ctx.hasPaymentFailure) {
    return { override: GateOverride.FORCE_ESCALATE_PAYMENT, action: "force_escalate" };
  }

  if (ctx.hasCheckoutTimeout) {
    return { override: GateOverride.FORCE_ESCALATE_CHECKOUT_TIMEOUT, action: "force_escalate" };
  }

  if (ctx.hasHelpSearch) {
    return { override: GateOverride.FORCE_ESCALATE_HELP_SEARCH, action: "force_escalate" };
  }

  return { override: null, action: null };
}
