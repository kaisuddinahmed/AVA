// ============================================================================
// GA4 event mapper — Phase 4.3.
//
// Translates AVA TrackEvent shape → GA4 Measurement Protocol event shape.
// Pure function, no I/O.
//
// GA4 constraints applied (per Google docs, last updated 2025-12):
//   - Event name: 40 chars max, [a-zA-Z][a-zA-Z0-9_]*
//   - Param name: 40 chars max, same charset
//   - Param value: ≤100 chars for standard properties (we don't truncate
//     numeric values — only strings)
//   - Max 25 events per request (caller batches; we just truncate here)
//   - Max 25 params per event (we truncate, preferring required params)
//
// Codex-mandated additions:
//   session_id           — for Realtime/report association
//   engagement_time_msec — required by some report types
//   page_location        — page-attribution
//   AVA `visitorId`      → carried as a custom param (anonymous; not PII)
// ============================================================================

export interface AvaTrackEvent {
  eventType: string;
  sessionId?: string;
  visitorId?: string;
  pageUrl?: string;
  pageType?: string;
  frictionId?: string | null;
  category?: string;
  /** Page-spent / engagement time in milliseconds. */
  engagementTimeMs?: number;
  /** Additional event payload — scrubbed elsewhere. */
  signals?: Record<string, unknown>;
  /** Unix-ms timestamp; mapper converts to microseconds when present. */
  timestamp?: number;
}

export interface GA4Event {
  name: string;
  params: Record<string, string | number | boolean>;
}

const MAX_EVENT_NAME_LEN = 40;
const MAX_PARAM_NAME_LEN = 40;
const MAX_PARAM_VALUE_LEN = 100;
const MAX_PARAMS_PER_EVENT = 25;
const MAX_EVENTS_PER_REQUEST = 25;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mapAvaEventToGA4(event: AvaTrackEvent): GA4Event {
  const params: Record<string, string | number | boolean> = {};

  // Codex-mandated params (when available) — these need to be first so they
  // survive the 25-param cap.
  if (event.sessionId) params.session_id = sanitiseValue(event.sessionId);
  if (typeof event.engagementTimeMs === "number" && event.engagementTimeMs > 0) {
    params.engagement_time_msec = Math.round(event.engagementTimeMs);
  }
  if (event.pageUrl) params.page_location = sanitiseValue(stripUrlPII(event.pageUrl));
  if (event.visitorId) params.visitor_id = sanitiseValue(event.visitorId);

  // AVA-specific contextual params.
  if (event.pageType) params.page_type = sanitiseValue(event.pageType);
  if (event.category) params.event_category = sanitiseValue(event.category);
  if (event.frictionId) params.friction_id = sanitiseValue(event.frictionId);

  // Append flattened signals (typically already PII-scrubbed by caller).
  if (event.signals) {
    for (const [rawKey, rawValue] of Object.entries(event.signals)) {
      if (Object.keys(params).length >= MAX_PARAMS_PER_EVENT) break;
      const key = sanitiseParamName(rawKey);
      if (!key) continue;
      if (key in params) continue; // don't overwrite reserved params
      const val = coerceParamValue(rawValue);
      if (val === undefined) continue;
      params[key] = val;
    }
  }

  return {
    name: sanitiseEventName(event.eventType),
    params,
  };
}

/**
 * Batch and truncate to GA4's 25-events-per-request hard cap. Returns the
 * input split into chunks ready to dispatch.
 */
export function batchForGA4(events: GA4Event[]): GA4Event[][] {
  if (events.length === 0) return [];
  const out: GA4Event[][] = [];
  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
    out.push(events.slice(i, i + MAX_EVENTS_PER_REQUEST));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sanitisation helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a string to GA4 event-name rules: [a-zA-Z][a-zA-Z0-9_]{0,39}.
 * Per GA4 spec, names MUST start with a letter (not `_`). Codex P1 fix:
 * prefix `event_` when the input would otherwise start with a digit or `_`
 * — `_123_checkout` would have been silently dropped by GA4.
 * Non-conforming inputs are coerced (lowercased, separators → underscore).
 * Empty / unrecoverable → "event".
 */
export function sanitiseEventName(raw: string): string {
  if (!raw) return "event";
  let s = raw.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");
  // Must begin with a LETTER per GA4 spec. Underscore-prefix is rejected.
  if (!/^[a-z]/.test(s)) s = `event_${s}`;
  s = s.slice(0, MAX_EVENT_NAME_LEN);
  return s || "event";
}

/**
 * Param-name rules: 40 char max, [a-zA-Z][a-zA-Z0-9_]*. Same Codex P1 fix
 * as `sanitiseEventName` — prefix with `param_` when input doesn't start
 * with a letter.
 */
function sanitiseParamName(raw: string): string {
  if (!raw) return "";
  // Convert camelCase / PascalCase → snake_case first so `isFold` → `is_fold`.
  let s = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_");
  if (!/^[a-z]/.test(s)) s = `param_${s}`;
  s = s.slice(0, MAX_PARAM_NAME_LEN);
  return s;
}

function sanitiseValue(value: string): string {
  return value.length > MAX_PARAM_VALUE_LEN ? value.slice(0, MAX_PARAM_VALUE_LEN) : value;
}

/**
 * Codex P1 fix: drop URL query string + fragment before forwarding to GA4.
 * The query string is a common PII vector (`?email=…`, `?phone=…`,
 * `?session_token=…`, password-reset links). Stripping is conservative —
 * an allowlist could come later if we need attribution-relevant query
 * params, but the safe default is no params at all.
 *
 * When `new URL()` parsing fails (relative paths, malformed input), falls
 * back to a regex strip of everything from the first `?` or `#`. The
 * regex path is conservative and never returns the unfiltered raw input.
 */
export function stripUrlPII(raw: string): string {
  try {
    const u = new URL(raw);
    // Drop search + hash. Keep origin + pathname.
    return `${u.origin}${u.pathname}`;
  } catch {
    // Not a parseable URL (relative path, malformed). Strip any obvious
    // ?... and #... so we still protect against the common case.
    return raw.replace(/[?#].*$/, "");
  }
}

/**
 * GA4 param values must be string | number | boolean. Coerce conservatively:
 *   - strings: truncated to 100 chars
 *   - finite numbers + booleans: passed through
 *   - objects/arrays: dropped (caller should flatten upstream)
 *   - undefined / NaN / Infinity: dropped
 */
function coerceParamValue(value: unknown): string | number | boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return sanitiseValue(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}
