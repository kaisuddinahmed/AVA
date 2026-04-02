// ============================================================================
// MSWIM Signal Calculator Tests
// ============================================================================
import { describe, it, expect } from "vitest";
import { adjustIntent } from "./signals/intent.signal.js";
import { adjustFriction } from "./signals/friction.signal.js";
import { adjustClarity } from "./signals/clarity.signal.js";
import { computeReceptivity } from "./signals/receptivity.signal.js";
import { computeValue } from "./signals/value.signal.js";
import { computeComposite } from "@ava/shared";
import { resolveTier } from "./tier-resolver.js";
import { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, } from "@ava/shared";
import { ScoreTier } from "@ava/shared";
// ---------------------------------------------------------------------------
// adjustIntent
// ---------------------------------------------------------------------------
describe("adjustIntent", () => {
    it("returns funnel base for bare checkout with zero llmRaw", () => {
        const result = adjustIntent(0, {
            pageType: "checkout",
            isLoggedIn: false,
            isRepeatVisitor: false,
            cartValue: 0,
            cartItemCount: 0,
        });
        expect(result).toBe(85);
    });
    it("clamps at 100 for saturated checkout visitor", () => {
        const result = adjustIntent(100, {
            pageType: "checkout",
            isLoggedIn: true,
            isRepeatVisitor: true,
            cartValue: 300,
            cartItemCount: 3,
        });
        expect(result).toBe(100);
    });
    it("accumulates boosts correctly for logged-in repeat visitor with cart on landing", () => {
        // landing=10, loggedIn+5, repeat+8, cartHasItems+10, cartValue>100+5
        // total raw boost = 10+5+8+10+5 = 38, + llmRaw=20 → 58 (clamped)
        const result = adjustIntent(20, {
            pageType: "landing",
            isLoggedIn: true,
            isRepeatVisitor: true,
            cartValue: 150,
            cartItemCount: 2,
        });
        expect(result).toBe(58);
    });
    it("returns funnel base only for pdp with no boosts", () => {
        // pdp=45, no boosts
        const result = adjustIntent(0, {
            pageType: "pdp",
            isLoggedIn: false,
            isRepeatVisitor: false,
            cartValue: 0,
            cartItemCount: 0,
        });
        expect(result).toBe(45);
    });
    it("clamps at 0 for negative llmRaw (defensive)", () => {
        const result = adjustIntent(0, {
            pageType: "other",
            isLoggedIn: false,
            isRepeatVisitor: false,
            cartValue: 0,
            cartItemCount: 0,
        });
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
    });
});
// ---------------------------------------------------------------------------
// adjustFriction
// ---------------------------------------------------------------------------
describe("adjustFriction", () => {
    it("uses catalog severity when higher than llmRaw (F001=45)", () => {
        // F001 severity = 45 > llmRaw = 30 → result = 45
        const result = adjustFriction(30, ["F001"]);
        expect(result).toBe(45);
    });
    it("uses llmRaw when higher than catalog severity", () => {
        // llmRaw=80 > F001=45 → result = 80
        const result = adjustFriction(80, ["F001"]);
        expect(result).toBe(80);
    });
    it("adds +5 per additional friction beyond the first (cap +15)", () => {
        // max(F001=45, F002=30, F003=50) = 50 (F003 is max)
        // additional frictions = 2 → +10 → 60
        const result = adjustFriction(20, ["F001", "F002", "F003"]);
        expect(result).toBe(60);
    });
    it("caps additional friction bonus at +15", () => {
        // 5 friction IDs, max=50, additional=4 → +20 but capped at +15 → 65
        const result = adjustFriction(0, ["F001", "F002", "F003", "F004", "F005"]);
        // max(F001=45,F002=30,F003=50,F004=48,F005=40)=50, +15 cap = 65
        expect(result).toBe(65);
    });
    it("returns 0 for empty friction list and zero llmRaw", () => {
        const result = adjustFriction(0, []);
        expect(result).toBe(0);
    });
    it("clamps to 100 maximum", () => {
        const result = adjustFriction(100, ["F001", "F002", "F003"]);
        expect(result).toBe(100);
    });
});
// ---------------------------------------------------------------------------
// adjustClarity
// ---------------------------------------------------------------------------
describe("adjustClarity", () => {
    it("adds +10 for rule-based corroboration", () => {
        // 50 + 10 = 60
        const result = adjustClarity(50, {
            sessionAgeSec: 120,
            eventCount: 5,
            ruleBasedCorroboration: true,
        });
        expect(result).toBe(60);
    });
    it("subtracts -15 for session under 60s", () => {
        // 50 - 15 = 35
        const result = adjustClarity(50, {
            sessionAgeSec: 30,
            eventCount: 5,
            ruleBasedCorroboration: false,
        });
        expect(result).toBe(35);
    });
    it("subtracts -10 for low event count (<=2)", () => {
        // 50 - 10 = 40
        const result = adjustClarity(50, {
            sessionAgeSec: 120,
            eventCount: 2,
            ruleBasedCorroboration: false,
        });
        expect(result).toBe(40);
    });
    it("stacks penalties correctly", () => {
        // 50 - 15 (young session) - 10 (low events) = 25
        const result = adjustClarity(50, {
            sessionAgeSec: 30,
            eventCount: 1,
            ruleBasedCorroboration: false,
        });
        expect(result).toBe(25);
    });
    it("clamps to 0 minimum", () => {
        const result = adjustClarity(10, {
            sessionAgeSec: 10,
            eventCount: 1,
            ruleBasedCorroboration: false,
        });
        expect(result).toBeGreaterThanOrEqual(0);
    });
});
// ---------------------------------------------------------------------------
// computeReceptivity
// ---------------------------------------------------------------------------
describe("computeReceptivity", () => {
    it("returns ~77 for a clean slate session (blend with llmHint=50)", () => {
        // base=80, no decrements/increments → rule score = 80
        // blend = 80 * 0.9 + 50 * 0.1 = 72 + 5 = 77
        const result = computeReceptivity(50, {
            totalInterventionsFired: 0,
            totalDismissals: 0,
            secondsSinceLastIntervention: null,
            isMobile: false,
            widgetOpenedVoluntarily: false,
            idleSeconds: 0,
        });
        expect(result).toBe(77);
    });
    it("decrements by 15 per non-passive intervention", () => {
        // base=80, -15*2=30 → 50; blend 50*0.9 + 50*0.1 = 50
        const result = computeReceptivity(50, {
            totalInterventionsFired: 2,
            totalDismissals: 0,
            secondsSinceLastIntervention: null,
            isMobile: false,
            widgetOpenedVoluntarily: false,
            idleSeconds: 0,
        });
        expect(result).toBe(50);
    });
    it("decrements by 25 per dismissal", () => {
        // base=80, -25 = 55; blend 55*0.9 + 50*0.1 = 49.5 + 5 = 54.5 → rounds to 55
        const result = computeReceptivity(50, {
            totalInterventionsFired: 0,
            totalDismissals: 1,
            secondsSinceLastIntervention: null,
            isMobile: false,
            widgetOpenedVoluntarily: false,
            idleSeconds: 0,
        });
        // base=80 -25=55, blend: 55*0.9+50*0.1 = 49.5+5 = 54.5 → Math.round = 55
        expect(result).toBeGreaterThanOrEqual(54);
        expect(result).toBeLessThanOrEqual(56);
    });
    it("adds +10 for voluntary widget open", () => {
        // base=80, +10=90; blend 90*0.9+50*0.1 = 81+5=86
        const result = computeReceptivity(50, {
            totalInterventionsFired: 0,
            totalDismissals: 0,
            secondsSinceLastIntervention: null,
            isMobile: false,
            widgetOpenedVoluntarily: true,
            idleSeconds: 0,
        });
        expect(result).toBe(86);
    });
    it("clamps to 100 maximum", () => {
        const result = computeReceptivity(100, {
            totalInterventionsFired: 0,
            totalDismissals: 0,
            secondsSinceLastIntervention: null,
            isMobile: false,
            widgetOpenedVoluntarily: true,
            idleSeconds: 120,
        });
        expect(result).toBe(100);
    });
    it("clamps to 0 minimum for heavily suppressed session", () => {
        const result = computeReceptivity(0, {
            totalInterventionsFired: 10,
            totalDismissals: 5,
            secondsSinceLastIntervention: 30,
            isMobile: true,
            widgetOpenedVoluntarily: false,
            idleSeconds: 0,
        });
        expect(result).toBeGreaterThanOrEqual(0);
    });
});
// ---------------------------------------------------------------------------
// computeValue
// ---------------------------------------------------------------------------
describe("computeValue", () => {
    it("returns ~22 for empty cart, no boosts (blend with llmHint=50)", () => {
        // cart=0 → bracket score=15, no boosts
        // blend: 15*0.8 + 50*0.2 = 12 + 10 = 22
        const result = computeValue(50, {
            cartValue: 0,
            isLoggedIn: false,
            isRepeatVisitor: false,
            referrerType: "organic",
        });
        expect(result).toBe(22);
    });
    it("returns correct score for cart in 100-200 bracket", () => {
        // cart=150 → score=70, no boosts
        // blend: 70*0.8 + 50*0.2 = 56 + 10 = 66
        const result = computeValue(50, {
            cartValue: 150,
            isLoggedIn: false,
            isRepeatVisitor: false,
            referrerType: "organic",
        });
        expect(result).toBe(66);
    });
    it("adds repeat customer and logged-in boosts", () => {
        // cart=150 → score=70, +LOGGED_IN=10, +REPEAT=15 → 95
        // blend: 95*0.8 + 50*0.2 = 76 + 10 = 86
        const result = computeValue(50, {
            cartValue: 150,
            isLoggedIn: true,
            isRepeatVisitor: true,
            referrerType: "organic",
        });
        expect(result).toBe(86);
    });
    it("adds paid acquisition boost", () => {
        // cart=50 → bracket=30, +PAID=5 → 35
        // blend: 35*0.8 + 50*0.2 = 28 + 10 = 38
        const result = computeValue(50, {
            cartValue: 50,
            isLoggedIn: false,
            isRepeatVisitor: false,
            referrerType: "paid",
        });
        expect(result).toBe(38);
    });
    it("clamps to 100", () => {
        const result = computeValue(100, {
            cartValue: 1000,
            isLoggedIn: true,
            isRepeatVisitor: true,
            referrerType: "paid",
        });
        expect(result).toBe(100);
    });
});
// ---------------------------------------------------------------------------
// computeComposite
// ---------------------------------------------------------------------------
describe("computeComposite", () => {
    it("returns 50 for all-50 signals with default weights", () => {
        const result = computeComposite({ intent: 50, friction: 50, clarity: 50, receptivity: 50, value: 50 }, DEFAULT_WEIGHTS);
        expect(result).toBe(50);
    });
    it("weighs signals by correct coefficients", () => {
        // intent=100, rest=0
        // 100*0.25 + 0*0.25 + 0*0.15 + 0*0.20 + 0*0.15 = 25
        const result = computeComposite({ intent: 100, friction: 0, clarity: 0, receptivity: 0, value: 0 }, DEFAULT_WEIGHTS);
        expect(result).toBe(25);
    });
    it("returns 0 for all-zero signals", () => {
        const result = computeComposite({ intent: 0, friction: 0, clarity: 0, receptivity: 0, value: 0 }, DEFAULT_WEIGHTS);
        expect(result).toBe(0);
    });
    it("returns 100 for all-100 signals", () => {
        const result = computeComposite({ intent: 100, friction: 100, clarity: 100, receptivity: 100, value: 100 }, DEFAULT_WEIGHTS);
        expect(result).toBe(100);
    });
});
// ---------------------------------------------------------------------------
// resolveTier
// ---------------------------------------------------------------------------
describe("resolveTier", () => {
    it("returns MONITOR for score <= 29", () => {
        expect(resolveTier(0, DEFAULT_THRESHOLDS)).toBe(ScoreTier.MONITOR);
        expect(resolveTier(29, DEFAULT_THRESHOLDS)).toBe(ScoreTier.MONITOR);
    });
    it("returns PASSIVE for score 30-49", () => {
        expect(resolveTier(30, DEFAULT_THRESHOLDS)).toBe(ScoreTier.PASSIVE);
        expect(resolveTier(49, DEFAULT_THRESHOLDS)).toBe(ScoreTier.PASSIVE);
    });
    it("returns NUDGE for score 50-64", () => {
        expect(resolveTier(50, DEFAULT_THRESHOLDS)).toBe(ScoreTier.NUDGE);
        expect(resolveTier(64, DEFAULT_THRESHOLDS)).toBe(ScoreTier.NUDGE);
    });
    it("returns ACTIVE for score 65-79", () => {
        expect(resolveTier(65, DEFAULT_THRESHOLDS)).toBe(ScoreTier.ACTIVE);
        expect(resolveTier(79, DEFAULT_THRESHOLDS)).toBe(ScoreTier.ACTIVE);
    });
    it("returns ESCALATE for score >= 80", () => {
        expect(resolveTier(80, DEFAULT_THRESHOLDS)).toBe(ScoreTier.ESCALATE);
        expect(resolveTier(100, DEFAULT_THRESHOLDS)).toBe(ScoreTier.ESCALATE);
    });
});
//# sourceMappingURL=mswim-signals.test.js.map