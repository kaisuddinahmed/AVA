// ============================================================================
// Shadow Evaluator — MSWIM-no-LLM path
// Generates synthetic signal hints from session context + events, then feeds
// them into the same runMSWIM() engine as production. Zero LLM API calls.
// ============================================================================
import { getSeverity } from "@ava/shared";
import { runMSWIM } from "./mswim/mswim.engine.js";
/**
 * Synthetic intent base scores by page type.
 * Intentionally LOW because adjustIntent() adds INTENT_FUNNEL_SCORES
 * (10–85) as an additive bonus on top. These represent the "behavioral
 * read" component that an LLM would provide — kept low so the funnel
 * position bonus dominates, matching production behavior.
 */
const SYNTHETIC_INTENT_BASE = {
    landing: 10,
    category: 15,
    search_results: 18,
    pdp: 25,
    cart: 30,
    checkout: 35,
    account: 12,
    other: 10,
};
/**
 * Run the shadow MSWIM evaluation using synthetic (rule-derived) LLM hints.
 * Zero LLM API calls. Same runMSWIM() engine as production.
 */
export async function runShadowEvaluation(input) {
    const { sessionCtx, detectedFrictionIds, pageType, eventCount } = input;
    // ── 1. Synthesize intent hint ──────────────────────────────────────────
    // adjustIntent() will add INTENT_FUNNEL_SCORES[pageType] (10–85) on top,
    // plus login/repeat/cart bonuses. Keep this low to avoid double-counting.
    let syntheticIntent = SYNTHETIC_INTENT_BASE[pageType] ?? 10;
    if (sessionCtx.isLoggedIn)
        syntheticIntent += 5;
    if (sessionCtx.isRepeatVisitor)
        syntheticIntent += 5;
    if (sessionCtx.cartItemCount > 0)
        syntheticIntent += 8;
    syntheticIntent = clamp(syntheticIntent);
    // ── 2. Synthesize friction hint ────────────────────────────────────────
    // adjustFriction() takes max(llmHint, catalogSeverity) then adds
    // multi-friction boost. Passing catalog severity as the hint means the
    // adjuster keeps it (max of equal values). When no frictions detected,
    // use a low base so the adjuster returns the llmHint as-is.
    let syntheticFriction = 10;
    if (detectedFrictionIds.length > 0) {
        const severities = detectedFrictionIds.map((id) => getSeverity(id));
        syntheticFriction = Math.max(...severities);
    }
    syntheticFriction = clamp(syntheticFriction);
    // ── 3. Synthesize clarity hint ─────────────────────────────────────────
    // adjustClarity() adds +10 for rule corroboration, -15 for session < 60s,
    // -10 for eventCount <= 2. Start moderate and let adjuster refine.
    let syntheticClarity = 40;
    if (detectedFrictionIds.length > 0)
        syntheticClarity += 15;
    if (eventCount >= 5)
        syntheticClarity += 10;
    if (sessionCtx.sessionAgeSec > 120)
        syntheticClarity += 10;
    syntheticClarity = clamp(syntheticClarity);
    // ── 4. Synthesize receptivity hint ─────────────────────────────────────
    // computeReceptivity() starts at base 80 and is 90% server-side.
    // LLM hint is blended at only 10% weight. Neutral 50 lets the
    // server-side intervention history dominate.
    const syntheticReceptivity = 50;
    // ── 5. Synthesize value hint ───────────────────────────────────────────
    // computeValue() computes its own cart-bracket base (20–95), then blends
    // LLM hint at 20% weight. Provide a moderate estimate so the server-side
    // cart-based calculation dominates.
    let syntheticValue = 25;
    if (sessionCtx.cartValue > 50)
        syntheticValue = 35;
    if (sessionCtx.cartValue > 100)
        syntheticValue = 50;
    if (sessionCtx.cartValue > 200)
        syntheticValue = 65;
    if (sessionCtx.isLoggedIn)
        syntheticValue += 8;
    if (sessionCtx.isRepeatVisitor)
        syntheticValue += 8;
    syntheticValue = clamp(syntheticValue);
    // ── 6. Build synthetic LLMOutput ───────────────────────────────────────
    const syntheticHints = {
        intent: syntheticIntent,
        friction: syntheticFriction,
        clarity: syntheticClarity,
        receptivity: syntheticReceptivity,
        value: syntheticValue,
        detectedFrictionIds,
        recommendedAction: "monitor", // neutral; engine determines actual tier
    };
    // ── 7. Run the SAME MSWIM engine ──────────────────────────────────────
    const shadowResult = await runMSWIM(syntheticHints, sessionCtx);
    return { shadowResult, syntheticHints };
}
function clamp(value) {
    return Math.max(0, Math.min(100, value));
}
//# sourceMappingURL=shadow-evaluator.js.map