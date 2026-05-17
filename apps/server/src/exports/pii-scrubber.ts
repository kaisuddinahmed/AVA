// ============================================================================
// PII scrubber — Phase 4.3.
//
// Outbound analytics (GA4, Mixpanel, others) must NEVER leak PII. AVA's
// own pipeline stores no PII per CLAUDE.md ("`visitorId` is an anonymous
// fingerprint only"), but defense-in-depth: scrub anyway before any
// outbound HTTP call, in case upstream telemetry adds an event with a
// raw email/phone/address slipping into a `params` JSON blob.
//
// Strategy: two-layer filter.
//   1. KEY denylist — drop fields whose key matches PII-y names
//      (case-insensitive, regex-bounded).
//   2. VALUE pattern check — for surviving string values, drop the
//      field if the value matches a high-confidence PII regex (email,
//      phone, SSN-like). This catches "details: 'me@x.com'" style leaks.
//
// Pure function, no I/O. Operates on a single-level Record. Nested
// objects/arrays are flattened to JSON for value-pattern matching so
// nested email leaks are caught too.
// ============================================================================

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a new object with PII fields removed. Original is not mutated.
 * `protectedKeys` is an opt-in allow-list of keys that bypass the scrub
 * (e.g. AVA's own `visitorId` — anonymous, OK to forward).
 */
export function scrubPII<T extends Record<string, unknown>>(
  obj: T | null | undefined,
  options: { protectedKeys?: ReadonlySet<string> } = {},
): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, unknown> = {};
  const protectedKeys = options.protectedKeys ?? new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    if (protectedKeys.has(key)) {
      out[key] = value;
      continue;
    }
    if (isPIIKey(key)) continue;
    if (isPIIValue(value)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Test the key alone — exposed for callers that need to whitelist their
 * own protected keys but still want the same denylist matching.
 */
export function isPIIKey(key: string): boolean {
  // Normalize camelCase → snake_case so `phoneNumber` becomes `phone_number`
  // and the word-boundary patterns below catch it.
  const k = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return PII_KEY_PATTERNS.some((p) => p.test(k));
}

/**
 * Test a single value (string, number, boolean, or nested object) for
 * PII patterns. Non-string scalars are always clean; objects/arrays are
 * JSON-stringified and pattern-matched recursively.
 */
export function isPIIValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return PII_VALUE_PATTERNS.some((p) => p.test(value));
  if (typeof value === "object") {
    try { return PII_VALUE_PATTERNS.some((p) => p.test(JSON.stringify(value))); }
    catch { return false; }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Denylists — patterns chosen to be specific enough to avoid false positives
// on AVA's legitimate signals (session_id, friction_id, cart_value, etc).
// ---------------------------------------------------------------------------

// NB: keys are normalized to snake_case before matching (see isPIIKey).
// All patterns use explicit underscore-or-end boundaries because JS regex
// `\b` does NOT treat `_` as a word boundary — `phone\b` would miss
// `phone_number` because `_` is a word char.
const PII_KEY_PATTERNS: RegExp[] = [
  /(^|_)email($|_)/,
  /(^|_)phone($|_)/,
  /(^|_)mobile($|_)/,
  /(^|_)first_name($|_)/,
  /(^|_)last_name($|_)/,
  /(^|_)full_name($|_)/,
  /(^|_)display_name($|_)/,
  /^name$/,                        // bare `name` — explicit, no prefix/suffix
  /(^|_)address($|_)/,
  /(^|_)street($|_)/,
  /(^|_)zip(code)?($|_)/,
  /(^|_)postal_code($|_)/,
  /(^|_)ssn($|_)/,
  /(^|_)social_security($|_)/,
  /(^|_)dob($|_)/,
  /(^|_)date_of_birth($|_)/,
  /(^|_)birthday($|_)/,
  /(^|_)password($|_)/,
  /(^|_)passwd($|_)/,
  /(^|_)secret($|_)/,
  /(^|_)credit_card($|_)/,
  /(^|_)cc_num($|_)/,
  /(^|_)cvv($|_)/,
  /(^|_)iban($|_)/,
  /(^|_)ip_address($|_)/,
  /(^|_)ipv[46]($|_)/,
];

// Anchored / fenced patterns — narrow on purpose to avoid false positives.
const PII_VALUE_PATTERNS: RegExp[] = [
  // RFC-ish email: something@something.something
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  // Phone — international or domestic, 10+ digits with separators allowed
  /\+?\d{1,3}?[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/,
  // US SSN-shaped
  /\b\d{3}-\d{2}-\d{4}\b/,
  // Credit-card-ish: 4 groups of 4 digits
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
];
