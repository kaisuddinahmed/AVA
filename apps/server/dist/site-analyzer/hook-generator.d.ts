import type { SiteSelectors } from "./selectors.js";
/**
 * Tracking hook configuration generated for a specific site.
 */
export interface TrackingHooks {
    platform: string;
    selectors: SiteSelectors;
    observerConfig: ObserverConfig;
    eventMappings: EventMapping[];
}
export interface ObserverConfig {
    /** Selectors to watch for mutations (e.g., cart count changes). */
    mutationTargets: string[];
    /** Selectors for click tracking (ATC, checkout, etc.). */
    clickTargets: string[];
    /** Selectors for intersection observation (product visibility). */
    intersectionTargets: string[];
    /** Whether to enable Shopify cart.js polling. */
    enableCartPolling: boolean;
    /** Cart polling interval in ms. */
    cartPollIntervalMs: number;
}
export interface EventMapping {
    /** CSS selector to match. */
    selector: string;
    /** DOM event to listen for. */
    domEvent: string;
    /** AVA event category. */
    category: string;
    /** AVA event type. */
    eventType: string;
    /** Friction ID if applicable. */
    frictionId: string | null;
}
/**
 * Generate tracking hooks for a detected platform.
 */
export declare function generateHooks(platform: string): TrackingHooks;
//# sourceMappingURL=hook-generator.d.ts.map