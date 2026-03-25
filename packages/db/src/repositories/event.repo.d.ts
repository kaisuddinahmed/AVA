export type CreateEventInput = {
    sessionId: string;
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
    siteUrl?: string;
};
export declare function createEvent(data: CreateEventInput): Promise<{
    id: string;
    siteUrl: string | null;
    sessionId: string;
    timestamp: Date;
    category: string;
    eventType: string;
    frictionId: string | null;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata: string | null;
    previousPageUrl: string | null;
    timeOnPageMs: number | null;
    scrollDepthPct: number | null;
    sessionSequenceNumber: number | null;
}>;
export declare function createEventBatch(events: CreateEventInput[]): Promise<import(".prisma/client").Prisma.BatchPayload>;
export declare function getEvent(id: string): Promise<{
    id: string;
    siteUrl: string | null;
    sessionId: string;
    timestamp: Date;
    category: string;
    eventType: string;
    frictionId: string | null;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata: string | null;
    previousPageUrl: string | null;
    timeOnPageMs: number | null;
    scrollDepthPct: number | null;
    sessionSequenceNumber: number | null;
} | null>;
export declare function getEventsBySession(sessionId: string, options?: {
    since?: Date;
    limit?: number;
}): Promise<{
    id: string;
    siteUrl: string | null;
    sessionId: string;
    timestamp: Date;
    category: string;
    eventType: string;
    frictionId: string | null;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata: string | null;
    previousPageUrl: string | null;
    timeOnPageMs: number | null;
    scrollDepthPct: number | null;
    sessionSequenceNumber: number | null;
}[]>;
export declare function getRecentEvents(sessionId: string, count?: number): Promise<{
    id: string;
    siteUrl: string | null;
    sessionId: string;
    timestamp: Date;
    category: string;
    eventType: string;
    frictionId: string | null;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata: string | null;
    previousPageUrl: string | null;
    timeOnPageMs: number | null;
    scrollDepthPct: number | null;
    sessionSequenceNumber: number | null;
}[]>;
export declare function getEventsByIds(ids: string[]): Promise<{
    id: string;
    siteUrl: string | null;
    sessionId: string;
    timestamp: Date;
    category: string;
    eventType: string;
    frictionId: string | null;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata: string | null;
    previousPageUrl: string | null;
    timeOnPageMs: number | null;
    scrollDepthPct: number | null;
    sessionSequenceNumber: number | null;
}[]>;
export declare function getEventsByFriction(frictionId: string): Promise<{
    id: string;
    siteUrl: string | null;
    sessionId: string;
    timestamp: Date;
    category: string;
    eventType: string;
    frictionId: string | null;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata: string | null;
    previousPageUrl: string | null;
    timeOnPageMs: number | null;
    scrollDepthPct: number | null;
    sessionSequenceNumber: number | null;
}[]>;
export declare function getUnevaluatedEvents(sessionId: string, evaluatedEventIds: string[]): Promise<{
    id: string;
    siteUrl: string | null;
    sessionId: string;
    timestamp: Date;
    category: string;
    eventType: string;
    frictionId: string | null;
    pageType: string;
    pageUrl: string;
    rawSignals: string;
    metadata: string | null;
    previousPageUrl: string | null;
    timeOnPageMs: number | null;
    scrollDepthPct: number | null;
    sessionSequenceNumber: number | null;
}[]>;
export declare function countEventsBySession(sessionId: string): Promise<number>;
/** Returns ordered page_view events for a session — for flow reconstruction */
export declare function getPageViewSequence(sessionId: string): Promise<{
    timestamp: Date;
    pageType: string;
    pageUrl: string;
    previousPageUrl: string | null;
}[]>;
/**
 * Returns top page-to-page transitions for a site.
 * Groups (previousPageUrl → pageUrl) pairs and counts occurrences.
 * Requires previousPageUrl to have been populated by the normalizer.
 */
export declare function getPageFlowGraph(siteUrl: string, since?: Date, limit?: number): Promise<{
    from: string;
    to: string;
    count: number;
}[]>;
/**
 * Counts sessions reaching each funnel step (pageType) in order.
 * Returns drop-off percentages per step.
 */
export declare function getFunnelStepCounts(siteUrl: string, steps: string[], since?: Date): Promise<{
    step: string;
    sessionCount: number;
}[]>;
/** Average time on page grouped by pageUrl, for the top N pages */
export declare function getAvgTimeOnPage(siteUrl: string, since?: Date, pageType?: string, limit?: number): Promise<{
    pageUrl: string;
    pageType: string;
    avgTimeOnPageMs: number;
    views: number;
}[]>;
/** Average scroll depth grouped by pageType */
export declare function getAvgScrollDepth(siteUrl: string, since?: Date, pageType?: string): Promise<{
    pageType: string;
    avgScrollDepthPct: number;
    sampleCount: number;
}[]>;
/** Returns click events with coordinates for heatmap rendering */
export declare function getClickCoordinates(siteUrl: string, since?: Date, pageUrl?: string, limit?: number): Promise<{
    xPct: number;
    yPct: number;
    pageUrl: string;
}[]>;
//# sourceMappingURL=event.repo.d.ts.map