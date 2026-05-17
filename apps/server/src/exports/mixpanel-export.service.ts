// ============================================================================
// Mixpanel export service — Phase 4.4.
//
// Same shape as the Phase 4.3 GA4 exporter:
//   1. Scrub PII per-event.
//   2. Map AVA → Mixpanel event (with stable $insert_id + governance fields).
//   3. Dispatch via adapter.
//
// HARD fire-and-forget contract: never throws. Adapter failures are logged
// and counted. Phase 4.4.1 (deferred) wires this into track.service.
// ============================================================================

import { scrubPII } from "./pii-scrubber.js";
import { mapAvaEventToMixpanel, type AvaTrackEventForMixpanel } from "./mixpanel-event-mapper.js";
import { sendMixpanelPayload, type DispatchOptions } from "./mixpanel-adapter.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "mixpanel-export" });

const SAFE_KEYS: ReadonlySet<string> = new Set([
  "session_id", "sessionId",
  "site_url", "siteUrl",
  "visitor_id", "visitorId", "distinct_id",
  "friction_id", "frictionId",
  "page_location", "pageUrl",
  "page_type", "pageType",
  "event_category", "category",
  "cart_value", "cartValue",
  "x_pct", "y_pct",
  "client_x", "client_y",
  "$insert_id", "$source", "ava_source", "ava_original_time",
]);

export interface ForwardOptions extends DispatchOptions {
  /** Mixpanel project token. Required at runtime; falls back to env in adapter. */
  token: string;
  /** Optional override for `now` — used by tests to assert 5-day clamp behavior. */
  now?: number;
}

export interface ForwardResult {
  attempted: number;
  scrubbed: number;
  succeeded: number;
  failed: number;
}

/**
 * Forward AVA events to Mixpanel. NEVER throws — adapter failures are
 * logged and counted in the result.
 */
export async function forwardToMixpanel(
  events: AvaTrackEventForMixpanel[],
  opts: ForwardOptions,
): Promise<ForwardResult> {
  const result: ForwardResult = { attempted: events.length, scrubbed: 0, succeeded: 0, failed: 0 };
  if (events.length === 0) return result;
  if (!opts.token) {
    log.warn("[mixpanel-export] token missing — skipping batch");
    return result;
  }

  const scrubbedEvents: AvaTrackEventForMixpanel[] = events.map((e) => {
    if (!e.signals) return e;
    const cleanSignals = scrubPII(e.signals, { protectedKeys: SAFE_KEYS });
    result.scrubbed += Object.keys(e.signals).length - Object.keys(cleanSignals).length;
    return { ...e, signals: cleanSignals };
  });

  const mxEvents = scrubbedEvents.map((e) =>
    mapAvaEventToMixpanel(e, { token: opts.token, now: opts.now }),
  );

  try {
    await sendMixpanelPayload(
      { events: mxEvents },
      { provider: opts.provider, fetchImpl: opts.fetchImpl },
    );
    result.succeeded = 1;
  } catch (err) {
    result.failed = 1;
    log.warn(
      { err: err instanceof Error ? err.message : String(err), eventNames: mxEvents.map((e) => e.event) },
      "[mixpanel-export] dispatch failed (swallowed)",
    );
  }

  return result;
}
