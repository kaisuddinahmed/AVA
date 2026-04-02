import { GateOverride, ScoreTier } from "@ava/shared";
// ScoreTier is a string enum — ordinal comparison must use this map.
const TIER_ORDER = {
    [ScoreTier.MONITOR]: 0,
    [ScoreTier.PASSIVE]: 1,
    [ScoreTier.NUDGE]: 2,
    [ScoreTier.ACTIVE]: 3,
    [ScoreTier.ESCALATE]: 4,
};
function tierLt(a, b) { return TIER_ORDER[a] < TIER_ORDER[b]; }
function tierLte(a, b) { return TIER_ORDER[a] <= TIER_ORDER[b]; }
function tierGt(a, b) { return TIER_ORDER[a] > TIER_ORDER[b]; }
/**
 * Run all 12 MSWIM gate checks. Returns the first triggered gate, or null.
 */
export function runGateChecks(tier, gates, ctx) {
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
    const duplicateFriction = ctx.currentFrictionIds.find((id) => ctx.frictionIdsAlreadyIntervened.includes(id));
    if (duplicateFriction && tierLt(tier, ScoreTier.ESCALATE)) {
        return { override: GateOverride.DUPLICATE_FRICTION, action: "suppress" };
    }
    // Gate 3b: PASSIVE global cooldown — prevent any tier from firing within 30s of
    //   the last intervention of any type. This is the primary race-condition guard:
    //   even if two evaluations load history before either commits, the second will
    //   still be suppressed once the first intervention is committed.
    //   Also prevents repeated PASSIVE fires when the inferred frictionId (e.g. F002)
    //   changes between evaluations due to LLM vs fast-engine path differences.
    const PASSIVE_COOLDOWN_SEC = 30;
    if (ctx.secondsSinceLastIntervention !== null &&
        ctx.secondsSinceLastIntervention < PASSIVE_COOLDOWN_SEC &&
        tierLte(tier, ScoreTier.PASSIVE)) {
        return { override: GateOverride.COOLDOWN_ACTIVE, action: "suppress" };
    }
    // Gate 4: Cooldown after ACTIVE intervention
    if (ctx.secondsSinceLastActive !== null &&
        ctx.secondsSinceLastActive < gates.cooldownAfterActiveSec &&
        tierLt(tier, ScoreTier.ESCALATE)) {
        return { override: GateOverride.COOLDOWN_ACTIVE, action: "suppress" };
    }
    // Gate 5: Cooldown after NUDGE
    if (ctx.secondsSinceLastNudge !== null &&
        ctx.secondsSinceLastNudge < gates.cooldownAfterNudgeSec &&
        tierLte(tier, ScoreTier.NUDGE)) {
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
    if (ctx.hasTechnicalError && tierGt(tier, ScoreTier.PASSIVE)) {
        return { override: GateOverride.FORCE_PASSIVE_TECHNICAL, action: "force_passive" };
    }
    if (ctx.hasOutOfStock && tierGt(tier, ScoreTier.PASSIVE)) {
        return { override: GateOverride.FORCE_PASSIVE_OOS, action: "force_passive" };
    }
    if (ctx.hasShippingIssue && tierGt(tier, ScoreTier.PASSIVE)) {
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
//# sourceMappingURL=gate-checks.js.map