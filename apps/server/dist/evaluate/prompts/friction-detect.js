/**
 * Supplementary prompt for friction detection focus.
 * Used when the system detects potential friction signals client-side.
 */
export const FRICTION_DETECT_PROMPT = `Focus your analysis on friction detection.

The client-side tracker has flagged potential friction signals. Cross-reference these
with the friction catalog (F001-F325) and provide your assessment:

1. Which friction IDs match the observed behavior?
2. How severe is each detected friction? (use catalog baseline, adjust for context)
3. Are there any frictions the tracker may have missed?
4. What's the combined friction impact on the user's journey?

Be precise with friction_id citations. Multiple frictions compound severity.`;
//# sourceMappingURL=friction-detect.js.map