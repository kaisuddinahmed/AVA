/**
 * Normalize raw event data from the widget into a standard format.
 */
export interface NormalizedEvent {
    category: string;
    eventType: string;
    frictionId?: string;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata?: string;
    previousPageUrl?: string;
    timeOnPageMs?: number;
    scrollDepthPct?: number;
    sessionSequenceNumber?: number;
}
export interface UtmFields {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    landingReferrer?: string;
}
export declare function normalizeEvent(raw: Record<string, unknown>): NormalizedEvent;
/** Extract UTM + referrer fields from the first page_view event's raw_signals */
export declare function extractUtmFields(raw: Record<string, unknown>): UtmFields;
//# sourceMappingURL=event-normalizer.d.ts.map