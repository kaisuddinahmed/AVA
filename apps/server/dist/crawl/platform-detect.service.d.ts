export type Platform = "shopify" | "woocommerce" | "custom";
export interface PlatformDetectInput {
    /** The URL the user pasted into the wizard, or the page being analyzed. */
    url: string;
    /** Response HTML body. May be empty/truncated — detection degrades gracefully. */
    html?: string;
    /** Response headers (lower-case keys). Optional but adds confidence when present. */
    headers?: Record<string, string>;
}
export interface PlatformDetection {
    platform: Platform;
    /** 0..1 — never claims certainty from heuristics alone (cap 0.95). */
    confidence: number;
    /** Which signals fired, for debugging + dashboard display. */
    signals: string[];
}
/**
 * Detect the e-commerce platform for a given shop URL using whatever signals
 * the caller has gathered. All inputs except `url` are optional — the
 * detection degrades gracefully (lower confidence) when fewer signals are
 * available.
 *
 * Returns `platform: "custom"` with `confidence: 0` when no signals fire.
 */
export declare function detectPlatform(input: PlatformDetectInput): PlatformDetection;
//# sourceMappingURL=platform-detect.service.d.ts.map