// ============================================================================
// GA4 export service — Phase 4.3.
//
// Single entry point for code that wants to forward AVA TrackEvents to GA4.
// The contract is HARD fire-and-forget: this function must NEVER throw, and
// MUST NOT slow callers down with retries (Phase 4.3.1 wires the call site
// in track.service which is the hot path).
//
// Pipeline:
//   1. Scrub PII from each event's signals (defense-in-depth — AVA already
//      avoids PII, but the outbound boundary is a hard line).
//   2. Map AVA → GA4 shape (name normalisation, value truncation,
//      Codex-mandated session_id / engagement_time_msec / page_location /
//      visitor_id population).
//   3. Batch to the 25-events-per-request hard cap.
//   4. Dispatch via the adapter (console fallback when env unset).
//
// Failures are logged and swallowed. The result reports per-batch outcome
// so the optional Phase 4.3.2 dead-letter follow-up can attach later.
// ============================================================================

import { scrubPII } from "./pii-scrubber.js";
import { mapAvaEventToGA4, batchForGA4, type AvaTrackEvent, type GA4Event } from "./ga4-event-mapper.js";
import { sendGA4Payload, type DispatchOptions } from "./ga4-adapter.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "ga4-export" });

// Whitelist for the scrubber — keys we know are safe to forward.
const SAFE_KEYS: ReadonlySet<string> = new Set([
  "session_id", "sessionId",
  "engagement_time_msec",
  "page_location", "pageUrl",
  "visitor_id", "visitorId",
  "friction_id", "frictionId",
  "page_type", "pageType",
  "event_category", "category",
  "cart_value", "cartValue",
  "x_pct", "y_pct",
  "client_x", "client_y",
]);

export interface ForwardOptions extends DispatchOptions {
  /**
   * Stable per-visitor ID GA4 uses to thread events together. We use AVA's
   * anonymous visitorId (NOT a session id) when available.
   */
  clientId: string;
}

export interface ForwardResult {
  attempted: number;
  scrubbed: number;
  batches: number;
  succeeded: number;
  failed: number;
}

/**
 * Forward AVA events to GA4. NEVER throws — adapter failures are logged
 * and counted in the result. Empty input returns a zeroed result without
 * touching the network.
 */
export async function forwardToGA4(
  events: AvaTrackEvent[],
  opts: ForwardOptions,
): Promise<ForwardResult> {
  const result: ForwardResult = { attempted: events.length, scrubbed: 0, batches: 0, succeeded: 0, failed: 0 };
  if (events.length === 0) return result;

  // 1. Scrub PII from per-event signals (the scrubber is also called on
  //    top-level event fields below via the mapper's whitelist).
  const scrubbed: AvaTrackEvent[] = events.map((e) => {
    if (!e.signals) return e;
    const cleanSignals = scrubPII(e.signals, { protectedKeys: SAFE_KEYS });
    result.scrubbed += Object.keys(e.signals).length - Object.keys(cleanSignals).length;
    return { ...e, signals: cleanSignals };
  });

  // 2. Map → GA4 events.
  const ga4Events: GA4Event[] = scrubbed.map(mapAvaEventToGA4);

  // 3. Batch to the 25-events-per-request cap.
  const batches = batchForGA4(ga4Events);
  result.batches = batches.length;

  // 4. Dispatch each batch independently. One failed batch must not block
  //    the others — they're independent HTTP requests anyway.
  for (const batch of batches) {
    try {
      await sendGA4Payload(
        { clientId: opts.clientId, events: batch },
        { provider: opts.provider, fetchImpl: opts.fetchImpl },
      );
      result.succeeded++;
    } catch (err) {
      result.failed++;
      log.warn(
        { err: err instanceof Error ? err.message : String(err), eventNames: batch.map((e) => e.name) },
        "[ga4-export] batch dispatch failed (swallowed)",
      );
    }
  }

  return result;
}
