/**
 * AVA Severity Scores — lookup table for all 325 friction IDs (F001–F325)
 *
 * Explicitly defined scores (from ava_project_structure.md MSWIM spec):
 *   F001 = 45, F002 = 30, F028 = 65, F058 = 55, F068 = 80, F089 = 90,
 *   F091 = 60, F094 = 75, F117 = 70, F131 = 50, F297 = 65
 *
 * Remaining scores assigned by category severity band:
 *   Landing/navigation: 30–55   |  Search: 45–70        |  Product: 35–65
 *   Cart: 55–85                 |  Checkout: 60–90       |  Pricing: 50–75
 *   Trust: 40–60                |  Mobile: 35–55         |  Technical: 50–80
 *   Content: 30–50              |  Personalization: 25–45 |  Social proof: 25–45
 *   Communication: 30–50        |  Account: 40–65        |  Shipping: 45–70
 *   Returns: 40–60              |  Post-purchase: 30–50  |  Re-engagement: 35–55
 *   Accessibility: 35–55        |  Cross-channel: 35–55  |  Decision: 50–70
 *   Payment: 65–90              |  Compliance: 35–55     |  Seasonal: 40–60
 */
export declare const SEVERITY_SCORES: Record<string, number>;
/**
 * Get the severity score for a friction ID.
 * Returns the cataloged severity or a default of 50 if the ID is unknown.
 */
export declare function getSeverity(frictionId: string): number;
//# sourceMappingURL=severity-scores.d.ts.map