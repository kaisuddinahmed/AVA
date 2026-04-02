/**
 * Behavior Pattern Matcher — Unit Tests
 *
 * Covers all 5 behavior groups across ≥ 20 distinct pattern detection scenarios.
 * Uses mocked BehaviorMappingRepo to exercise both "site has mappings" and
 * "fallback to catalog" code paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectBehaviorPatterns, extractActiveGroups, computeBehaviorBoosts, } from "./behavior-pattern-matcher.js";
// ── Mock BehaviorMappingRepo ──────────────────────────────────────────────────
vi.mock("@ava/db", () => ({
    BehaviorMappingRepo: {
        listBehaviorMappingsBySite: vi.fn(),
    },
}));
import { BehaviorMappingRepo } from "@ava/db";
const mockList = BehaviorMappingRepo.listBehaviorMappingsBySite;
// ── Helpers ───────────────────────────────────────────────────────────────────
function event(eventType, extras = {}) {
    return { category: "ui", eventType, ...extras };
}
// Site mappings covering all 5 groups (returned by mock when siteConfigId is provided)
const SITE_MAPPINGS = [
    // HIGH_INTENT
    { patternId: "B135", confidence: 0.90, isActive: true },
    { patternId: "B165", confidence: 0.85, isActive: true },
    { patternId: "B195", confidence: 0.95, isActive: true },
    // COMPARISON
    { patternId: "B058", confidence: 0.78, isActive: true },
    { patternId: "B096", confidence: 0.72, isActive: true },
    { patternId: "B106", confidence: 0.80, isActive: true },
    { patternId: "B114", confidence: 0.75, isActive: true },
    // HESITATION
    { patternId: "B107", confidence: 0.65, isActive: true },
    { patternId: "B123", confidence: 0.70, isActive: true },
    { patternId: "B148", confidence: 0.68, isActive: true },
    { patternId: "B151", confidence: 0.72, isActive: true },
    // DISCOVERY
    { patternId: "B015", confidence: 0.60, isActive: true },
    { patternId: "B025", confidence: 0.55, isActive: true },
    { patternId: "B028", confidence: 0.58, isActive: true },
    // EXIT_RISK
    { patternId: "B035", confidence: 0.82, isActive: true },
    { patternId: "B048", confidence: 0.77, isActive: true },
    { patternId: "B208", confidence: 0.88, isActive: true },
    { patternId: "B212", confidence: 0.91, isActive: true },
];
// ── Tests ─────────────────────────────────────────────────────────────────────
describe("detectBehaviorPatterns", () => {
    beforeEach(() => {
        mockList.mockResolvedValue(SITE_MAPPINGS);
    });
    // ── Empty / edge cases ─────────────────────────────────────────────────────
    it("returns [] for empty event list", async () => {
        const result = await detectBehaviorPatterns([], "site-1");
        expect(result).toEqual([]);
    });
    it("never throws even when repo fails", async () => {
        mockList.mockRejectedValueOnce(new Error("DB down"));
        const result = await detectBehaviorPatterns([event("add_to_cart")], "site-1");
        expect(Array.isArray(result)).toBe(true);
    });
    // ── HIGH_INTENT ────────────────────────────────────────────────────────────
    it("HIGH_INTENT: detects add_to_cart", async () => {
        const result = await detectBehaviorPatterns([event("add_to_cart")], "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("HIGH_INTENT");
    });
    it("HIGH_INTENT: detects quick_add", async () => {
        const result = await detectBehaviorPatterns([event("quick_add")], "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("HIGH_INTENT");
    });
    it("HIGH_INTENT: detects checkout page type", async () => {
        const result = await detectBehaviorPatterns([event("page_view", { pageType: "checkout" })], "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("HIGH_INTENT");
    });
    it("HIGH_INTENT: resolves to mapped B-codes with site confidence", async () => {
        const result = await detectBehaviorPatterns([event("add_to_cart")], "site-1");
        const hiPatterns = result.filter((r) => r.group === "HIGH_INTENT");
        expect(hiPatterns.length).toBeGreaterThan(0);
        // Site mappings give real confidence values (not fallback 0.60)
        expect(hiPatterns[0].confidence).toBeGreaterThan(0.60);
        expect(hiPatterns[0].patternId).toMatch(/^B/);
    });
    it("HIGH_INTENT: evidence includes triggering event type", async () => {
        const result = await detectBehaviorPatterns([event("add_to_cart")], "site-1");
        const hi = result.find((r) => r.group === "HIGH_INTENT");
        expect(hi?.evidence).toContain("add_to_cart");
    });
    // ── COMPARISON ────────────────────────────────────────────────────────────
    it("COMPARISON: detects 3+ product_detail_view + size_select (2 evidence signals)", async () => {
        const events = [
            event("product_detail_view"),
            event("product_detail_view"),
            event("product_detail_view"),
            event("size_select"),
        ];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("COMPARISON");
    });
    it("COMPARISON: detects size_guide_open + color_select (≥2 signals)", async () => {
        const events = [event("size_guide_open"), event("color_select")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("COMPARISON");
    });
    it("COMPARISON: 2 product_detail_views alone does NOT trigger", async () => {
        const events = [event("product_detail_view"), event("product_detail_view")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).not.toContain("COMPARISON");
    });
    it("COMPARISON: detects filter_applied + sort_applied", async () => {
        const events = [event("filter_applied"), event("sort_applied")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("COMPARISON");
    });
    it("COMPARISON: resolves B058 (size guide) from site mappings", async () => {
        const events = [event("size_guide_open"), event("size_select")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const patternIds = result.map((r) => r.patternId);
        expect(patternIds).toContain("B058");
    });
    // ── HESITATION ────────────────────────────────────────────────────────────
    it("HESITATION: detects size_select without add_to_cart", async () => {
        const events = [event("size_select")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("HESITATION");
    });
    it("HESITATION: detects wishlist_add without add_to_cart", async () => {
        const events = [event("wishlist_add")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("HESITATION");
    });
    it("HESITATION: detects 3+ repeated cart_view without checkout", async () => {
        const events = [event("cart_view"), event("cart_view"), event("cart_view")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("HESITATION");
    });
    it("HESITATION: detects idle_with_cart via frictionId F069", async () => {
        const events = [event("idle", { frictionId: "F069" })];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("HESITATION");
    });
    it("HESITATION: NOT triggered when add_to_cart is present with size_select", async () => {
        const events = [event("size_select"), event("add_to_cart")];
        const result = await detectBehaviorPatterns(events, "site-1");
        // HESITATION's variant_without_cart signal should NOT fire
        const hes = result.find((r) => r.group === "HESITATION");
        // Could still trigger via other HESITATION evidence, but variant_without_cart should be absent
        if (hes) {
            expect(hes.evidence).not.toContain("variant_without_cart");
        }
    });
    // ── DISCOVERY ─────────────────────────────────────────────────────────────
    it("DISCOVERY: detects first visit signal in rawSignals", async () => {
        const events = [
            event("page_view", {
                pageType: "landing",
                rawSignals: { is_first_visit: true },
            }),
        ];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("DISCOVERY");
    });
    it("DISCOVERY: detects category browse + no cart action + ≤2 product views", async () => {
        const events = [
            event("category_browse"),
            event("product_detail_view"),
        ];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("DISCOVERY");
    });
    it("DISCOVERY: suppressed when HIGH_INTENT is also active", async () => {
        const events = [
            event("category_browse"),
            event("add_to_cart"), // triggers HIGH_INTENT
        ];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).not.toContain("DISCOVERY");
        expect(groups).toContain("HIGH_INTENT");
    });
    it("DISCOVERY: detects search_without_cart", async () => {
        const events = [event("search_query")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("DISCOVERY");
    });
    it("DISCOVERY: resolves B015 (first-time visitor) from site mappings", async () => {
        const events = [
            event("page_view", { rawSignals: { is_first_visit: true } }),
        ];
        const result = await detectBehaviorPatterns(events, "site-1");
        const patternIds = result.map((r) => r.patternId);
        expect(patternIds).toContain("B015");
    });
    // ── EXIT_RISK ─────────────────────────────────────────────────────────────
    it("EXIT_RISK: detects exit_intent event", async () => {
        const events = [event("exit_intent")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("EXIT_RISK");
    });
    it("EXIT_RISK: detects rage_click", async () => {
        const events = [event("rage_click")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("EXIT_RISK");
    });
    it("EXIT_RISK: detects dead_click", async () => {
        const events = [event("dead_click")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("EXIT_RISK");
    });
    it("EXIT_RISK: detects friction F068 (idle)", async () => {
        const events = [event("idle", { frictionId: "F068" })];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("EXIT_RISK");
    });
    it("EXIT_RISK: detects long idle via rawSignals.idle_time_ms > 180000", async () => {
        const events = [
            event("idle", { rawSignals: { idle_time_ms: 200_000 } }),
        ];
        const result = await detectBehaviorPatterns(events, "site-1");
        const groups = result.map((r) => r.group);
        expect(groups).toContain("EXIT_RISK");
    });
    it("EXIT_RISK: resolves B208/B212 from site mappings on exit_intent", async () => {
        const events = [event("exit_intent")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const patternIds = result.map((r) => r.patternId);
        // B208 and B212 are both EXIT_RISK in site mappings
        const exitPatterns = ["B208", "B212", "B035", "B048"];
        expect(patternIds.some((id) => exitPatterns.includes(id))).toBe(true);
    });
    // ── Fallback (no site mappings) ───────────────────────────────────────────
    it("falls back to catalog patterns at 0.60 confidence when no site mappings", async () => {
        mockList.mockResolvedValueOnce([]);
        const events = [event("add_to_cart")];
        const result = await detectBehaviorPatterns(events, "site-1");
        const hiPatterns = result.filter((r) => r.group === "HIGH_INTENT");
        expect(hiPatterns.length).toBeGreaterThan(0);
        // Fallback confidence is exactly 0.60
        expect(hiPatterns.every((p) => p.confidence === 0.60)).toBe(true);
        // Max 5 from fallback
        expect(hiPatterns.length).toBeLessThanOrEqual(5);
    });
    // ── Sorting / cap ─────────────────────────────────────────────────────────
    it("returns results sorted by confidence descending", async () => {
        const events = [event("exit_intent"), event("add_to_cart"), event("size_guide_open"), event("color_select")];
        const result = await detectBehaviorPatterns(events, "site-1");
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
        }
    });
    it("caps output at 10 patterns", async () => {
        // Give the mock many active mappings
        const manyMappings = Array.from({ length: 30 }, (_, i) => ({
            patternId: `B${(100 + i).toString().padStart(3, "0")}`,
            confidence: 0.80,
            isActive: true,
        }));
        mockList.mockResolvedValueOnce(manyMappings);
        const events = [
            event("add_to_cart"),
            event("size_guide_open"),
            event("color_select"),
            event("exit_intent"),
            event("wishlist_add"),
        ];
        const result = await detectBehaviorPatterns(events, "site-1");
        expect(result.length).toBeLessThanOrEqual(10);
    });
});
// ── extractActiveGroups ───────────────────────────────────────────────────────
describe("extractActiveGroups", () => {
    it("returns unique groups in priority order", async () => {
        mockList.mockResolvedValue(SITE_MAPPINGS);
        const events = [event("exit_intent"), event("add_to_cart")];
        const patterns = await detectBehaviorPatterns(events, "site-1");
        const groups = extractActiveGroups(patterns);
        // EXIT_RISK comes before HIGH_INTENT in priority order
        const exitIdx = groups.indexOf("EXIT_RISK");
        const hiIdx = groups.indexOf("HIGH_INTENT");
        if (exitIdx !== -1 && hiIdx !== -1) {
            expect(exitIdx).toBeLessThan(hiIdx);
        }
        // No duplicates
        expect(new Set(groups).size).toBe(groups.length);
    });
});
// ── computeBehaviorBoosts ─────────────────────────────────────────────────────
describe("computeBehaviorBoosts", () => {
    it("sums intentBoost and clarityBoost correctly", () => {
        // HIGH_INTENT: +12 intent / +5 clarity
        const { intentBoost, clarityBoost } = computeBehaviorBoosts(["HIGH_INTENT"]);
        expect(intentBoost).toBe(12);
        expect(clarityBoost).toBe(5);
    });
    it("caps combined boost at ±20", () => {
        // EXIT_RISK (-10) + HESITATION (-5) + DISCOVERY (-8) = -23 → capped at -20
        const { intentBoost } = computeBehaviorBoosts(["EXIT_RISK", "HESITATION", "DISCOVERY"]);
        expect(intentBoost).toBeGreaterThanOrEqual(-20);
        expect(intentBoost).toBeLessThanOrEqual(20);
    });
    it("returns zero boosts for empty groups", () => {
        const { intentBoost, clarityBoost } = computeBehaviorBoosts([]);
        expect(intentBoost).toBe(0);
        expect(clarityBoost).toBe(0);
    });
    it("applies correct boosts for COMPARISON group", () => {
        // COMPARISON: +6 intent / +8 clarity
        const { intentBoost, clarityBoost } = computeBehaviorBoosts(["COMPARISON"]);
        expect(intentBoost).toBe(6);
        expect(clarityBoost).toBe(8);
    });
    it("EXIT_RISK has negative intentBoost", () => {
        const { intentBoost } = computeBehaviorBoosts(["EXIT_RISK"]);
        expect(intentBoost).toBe(-10);
    });
});
//# sourceMappingURL=behavior-pattern-matcher.test.js.map