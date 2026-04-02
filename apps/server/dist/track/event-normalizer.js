export function normalizeEvent(raw) {
    // Handle page_context if present (from WS widget schema)
    const pc = raw.page_context;
    const signals = raw.raw_signals ?? {};
    const timeOnPageMs = (pc?.time_on_page_ms ?? signals.time_on_page_ms);
    const scrollDepthPct = (pc?.scroll_depth_pct ?? signals.scroll_depth_pct);
    const referrer = typeof signals.referrer === "string" && /^https?:\/\//.test(signals.referrer)
        ? signals.referrer
        : undefined;
    return {
        category: String(raw.category ?? "unknown"),
        eventType: String(raw.event_type ?? raw.eventType ?? raw.type ?? "unknown"),
        frictionId: (raw.friction_id ?? raw.frictionId) ? String(raw.friction_id ?? raw.frictionId) : undefined,
        pageType: String(pc?.page_type ?? raw.pageType ?? "other"),
        pageUrl: String(pc?.page_url ?? raw.pageUrl ?? raw.url ?? ""),
        rawSignals: JSON.stringify(raw.raw_signals ?? raw.signals ?? raw.data ?? {}),
        metadata: raw.metadata ? JSON.stringify(raw.metadata) : undefined,
        previousPageUrl: signals.previous_page_url
            ? String(signals.previous_page_url)
            : referrer,
        timeOnPageMs: timeOnPageMs !== undefined ? Number(timeOnPageMs) : undefined,
        scrollDepthPct: scrollDepthPct !== undefined ? Math.round(Number(scrollDepthPct)) : undefined,
        sessionSequenceNumber: signals.session_sequence_number !== undefined ? Number(signals.session_sequence_number) : undefined,
    };
}
/** Extract UTM + referrer fields from the first page_view event's raw_signals */
export function extractUtmFields(raw) {
    const signals = raw.raw_signals ?? {};
    return {
        utmSource: signals.utm_source ? String(signals.utm_source) : undefined,
        utmMedium: signals.utm_medium ? String(signals.utm_medium) : undefined,
        utmCampaign: signals.utm_campaign ? String(signals.utm_campaign) : undefined,
        utmContent: signals.utm_content ? String(signals.utm_content) : undefined,
        utmTerm: signals.utm_term ? String(signals.utm_term) : undefined,
        landingReferrer: signals.referrer ? String(signals.referrer) : undefined,
    };
}
//# sourceMappingURL=event-normalizer.js.map