// ============================================================================
// Mixpanel event mapper — Phase 4.4.
//
// Translates AVA TrackEvent → Mixpanel /track event shape. Pure function,
// no I/O. Reuses the Phase 4.3 URL-PII strip on page_location.
//
// Codex-mandated invariants:
//   - $insert_id is STABLE per event. AVA's eventId is preferred. Fallback
//     is a SHA-256 hash of (siteUrl, sessionId, eventType, timestamp). This
//     means retries produce the same id and Mixpanel's dedup works.
//   - Governance fields on every event: $source="ava", ava_source="server_export"
//   - `time` must be within 5 days (Mixpanel hard limit). When older, we
//     REPLACE `time` with `now` and preserve the original timestamp under
//     `ava_original_time` rather than silently clamping (which distorts
//     timelines).
//
// Mixpanel event shape (per docs, updated 2026):
//   { "event": "name", "properties": { token, distinct_id, time,
//     $insert_id, ...custom } }
// ============================================================================

import { createHash } from "crypto";
import { stripUrlPII } from "./ga4-event-mapper.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AvaTrackEventForMixpanel {
  eventType: string;
  /** Preferred — stable per-event id from AVA, e.g. TrackEvent.id. */
  eventId?: string;
  sessionId?: string;
  visitorId?: string;
  siteUrl?: string;
  pageUrl?: string;
  pageType?: string;
  category?: string;
  frictionId?: string | null;
  /** Unix MS — mapper converts to seconds for Mixpanel. */
  timestamp?: number;
  signals?: Record<string, unknown>;
}

export interface MixpanelEvent {
  event: string;
  properties: Record<string, unknown>;
}

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map an AVA TrackEvent to a Mixpanel /track event. `token` is injected
 * by the caller (export service) — this stays pure.
 */
export function mapAvaEventToMixpanel(
  event: AvaTrackEventForMixpanel,
  opts: { token: string; now?: number },
): MixpanelEvent {
  const now = opts.now ?? Date.now();
  const rawTimestamp = event.timestamp ?? now;

  // 5-day Mixpanel limit. Don't clamp silently — replace and preserve the
  // original under ava_original_time so the dashboard can reconstruct the
  // backfill window if needed.
  let timestampMs = rawTimestamp;
  let avaOriginalTime: number | undefined;
  if (now - rawTimestamp > FIVE_DAYS_MS) {
    avaOriginalTime = rawTimestamp;
    timestampMs = now;
  }

  const properties: Record<string, unknown> = {
    token: opts.token,
    time: Math.floor(timestampMs / 1000), // Mixpanel takes Unix seconds
    $insert_id: resolveInsertId(event),
    $source: "ava",
    ava_source: "server_export",
  };

  // Identity. Mixpanel uses distinct_id to thread events; AVA visitorId is
  // anonymous and stable per visitor → ideal mapping.
  if (event.visitorId) properties.distinct_id = event.visitorId;

  // AVA contextual params.
  if (event.sessionId) properties.session_id = event.sessionId;
  if (event.siteUrl) properties.site_url = event.siteUrl;
  if (event.pageUrl) properties.page_location = stripUrlPII(event.pageUrl);
  if (event.pageType) properties.page_type = event.pageType;
  if (event.category) properties.event_category = event.category;
  if (event.frictionId) properties.friction_id = event.frictionId;
  if (avaOriginalTime !== undefined) properties.ava_original_time = avaOriginalTime;

  // Flatten signals (already PII-scrubbed by the export service). Don't
  // overwrite the reserved properties above.
  if (event.signals) {
    for (const [key, value] of Object.entries(event.signals)) {
      if (key in properties) continue;
      if (value === undefined) continue;
      properties[key] = value;
    }
  }

  return { event: event.eventType, properties };
}

// ---------------------------------------------------------------------------
// $insert_id — Codex-mandated stable dedup key.
// ---------------------------------------------------------------------------

/**
 * Stable per-event id for Mixpanel dedup. Mixpanel uses this to drop
 * duplicate ingestions — critical for retry safety. Strategy:
 *   1. Prefer AVA's own `eventId` (already unique per stored TrackEvent).
 *   2. Otherwise derive from stable fields the caller can reproduce on
 *      retry: SHA-256(siteUrl|sessionId|eventType|timestamp) truncated.
 *   3. If those aren't available either, hash whatever IS — same input
 *      always produces same hash, so retries stay deduped.
 */
export function resolveInsertId(event: AvaTrackEventForMixpanel): string {
  if (event.eventId && event.eventId.length > 0) return event.eventId;
  const parts = [
    event.siteUrl ?? "",
    event.sessionId ?? "",
    event.eventType ?? "",
    String(event.timestamp ?? ""),
  ].join("|");
  const hash = createHash("sha256").update(parts).digest("hex");
  // Mixpanel allows up to 36 chars; we use 32 for safety + readability.
  return `ava_${hash.slice(0, 28)}`;
}
