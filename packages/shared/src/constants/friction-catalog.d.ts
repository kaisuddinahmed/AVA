/**
 * AVA Friction Catalog — F001 through F325
 * 25 categories, 325 friction scenarios
 *
 * Auto-generated from docs/friction_scenarios.md
 */
export declare enum FrictionCategory {
    LANDING = "landing",
    NAVIGATION = "navigation",
    SEARCH = "search",
    PRODUCT = "product",
    CART = "cart",
    CHECKOUT = "checkout",
    PRICING = "pricing",
    TRUST = "trust",
    MOBILE = "mobile",
    TECHNICAL = "technical",
    CONTENT = "content",
    PERSONALIZATION = "personalization",
    SOCIAL_PROOF = "social_proof",
    COMMUNICATION = "communication",
    ACCOUNT = "account",
    SHIPPING = "shipping",
    RETURNS = "returns",
    POST_PURCHASE = "post_purchase",
    RE_ENGAGEMENT = "re_engagement",
    ACCESSIBILITY = "accessibility",
    CROSS_CHANNEL = "cross_channel",
    DECISION = "decision",
    PAYMENT = "payment",
    COMPLIANCE = "compliance",
    SEASONAL = "seasonal"
}
export interface FrictionScenario {
    id: string;
    category: FrictionCategory;
    scenario: string;
    detection_signal: string;
    ai_action: string;
}
export declare const FRICTION_CATALOG: Map<string, FrictionScenario>;
export declare function getFrictionScenario(frictionId: string): FrictionScenario | undefined;
export declare function getScenariosByCategory(category: FrictionCategory): FrictionScenario[];
export declare function getAllFrictionIds(): string[];
//# sourceMappingURL=friction-catalog.d.ts.map