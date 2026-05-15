// ============================================================================
// robots.txt parser — RFC 9309-aligned, zero-dep.
//
// Phase 1.2.1. Used by the BFS crawler (1.2.2) to gate fetches.
//
// Pure: text in, structured rules out. Caller handles HTTP fetching.
//
// Supports:
//   - Multiple User-agent groups (per-UA + wildcard *)
//   - Allow / Disallow with longest-match precedence (RFC 9309 §2.2.2)
//   - Crawl-delay (non-standard but de facto supported by most crawlers)
//   - Sitemap: directives (host-independent — collected globally)
//   - Wildcards in paths: * and end-anchor $
//   - Comments (# to end-of-line)
//   - Case-insensitive directives, case-sensitive paths
//
// Deliberately NOT supported (per Codex scope-guard reasoning):
//   - Request-rate, Visit-time, Clean-param (non-standard, sparsely used)
//   - Multi-host parsing — caller passes the relevant robots.txt for the host
// ============================================================================
// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------
/**
 * Parse a robots.txt body. Tolerant of CR/LF mixing, BOM, blank lines,
 * malformed directives. Never throws — returns an empty result for garbage.
 */
export function parseRobotsTxt(text) {
    const result = { groups: [], sitemaps: [], rawUnknown: [] };
    if (!text || typeof text !== "string")
        return result;
    // Strip BOM
    const body = text.replace(/^﻿/, "");
    const lines = body.split(/\r\n|\r|\n/);
    // Spec: consecutive User-agent lines start (or extend) a group. A new
    // group begins after any rule/crawl-delay line is seen following one or
    // more UA lines. We track this with `expectingUA`.
    let currentGroup = null;
    let expectingUA = true;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        // Strip comments + trim
        const line = raw.replace(/#.*$/, "").trim();
        if (!line)
            continue;
        const colonIdx = line.indexOf(":");
        if (colonIdx < 1)
            continue; // malformed — silently drop
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const value = line.slice(colonIdx + 1).trim();
        if (key === "user-agent") {
            if (!currentGroup || !expectingUA) {
                currentGroup = { userAgents: [], rules: [] };
                result.groups.push(currentGroup);
                expectingUA = true;
            }
            currentGroup.userAgents.push(value.toLowerCase());
            continue;
        }
        if (key === "sitemap") {
            if (value)
                result.sitemaps.push(value);
            continue;
        }
        // Per-group directives below — they require an active group.
        if (!currentGroup) {
            result.rawUnknown.push({ line: i + 1, key, value });
            continue;
        }
        expectingUA = false; // any rule line closes the UA accumulation window
        if (key === "allow") {
            currentGroup.rules.push({ type: "allow", pattern: value });
            continue;
        }
        if (key === "disallow") {
            currentGroup.rules.push({ type: "disallow", pattern: value });
            continue;
        }
        if (key === "crawl-delay") {
            const n = Number(value);
            if (Number.isFinite(n) && n >= 0)
                currentGroup.crawlDelaySec = n;
            continue;
        }
        result.rawUnknown.push({ line: i + 1, key, value });
    }
    return result;
}
// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------
/**
 * Resolve whether a given user-agent can fetch the given URL path under the
 * parsed robots.txt rules. Implements RFC 9309 §2.2.2 longest-match-first
 * with allow > disallow tie-break.
 *
 * Selection of the matching group: choose the most specific UA group whose
 * UA string is a prefix of `userAgent` (case-insensitive). Fall back to the
 * wildcard `*` group. If no group matches, the path is allowed.
 */
export function isAllowed(parsed, userAgent, urlPath) {
    const group = pickGroup(parsed, userAgent);
    if (!group || group.rules.length === 0)
        return true;
    // Find the longest matching rule. Tie-break: allow wins.
    let bestLen = -1;
    let bestType = "allow";
    for (const rule of group.rules) {
        if (!matchesPattern(rule.pattern, urlPath))
            continue;
        const len = rule.pattern.length;
        if (len > bestLen || (len === bestLen && rule.type === "allow")) {
            bestLen = len;
            bestType = rule.type;
        }
    }
    if (bestLen < 0)
        return true; // no rule matched
    // Empty Disallow ("") is "allow everything" per RFC §2.2.2
    if (bestType === "disallow" && bestLen === 0)
        return true;
    return bestType === "allow";
}
/** Look up the crawl-delay (seconds) that applies to a given UA. */
export function crawlDelayFor(parsed, userAgent) {
    return pickGroup(parsed, userAgent)?.crawlDelaySec;
}
// ---------------------------------------------------------------------------
// Internal: group selection + pattern matching
// ---------------------------------------------------------------------------
function pickGroup(parsed, userAgent) {
    const uaLower = userAgent.toLowerCase();
    let specific;
    let specificLen = -1;
    let wildcard;
    for (const g of parsed.groups) {
        for (const ua of g.userAgents) {
            if (ua === "*") {
                wildcard = wildcard ?? g;
                continue;
            }
            if (uaLower.startsWith(ua) && ua.length > specificLen) {
                specific = g;
                specificLen = ua.length;
            }
        }
    }
    return specific ?? wildcard;
}
/**
 * Match a path against a robots-style pattern. Wildcards:
 *   `*` — any sequence of chars (including empty)
 *   `$` — end-of-string anchor (only at the very end)
 * Other characters match literally. Case-sensitive paths per RFC.
 */
function matchesPattern(pattern, path) {
    // Empty pattern is the "match everything" disallow (RFC §2.2.2 footnote)
    // but we special-case length=0 in isAllowed; here, treat as match.
    if (pattern === "")
        return true;
    const hasEndAnchor = pattern.endsWith("$");
    const body = hasEndAnchor ? pattern.slice(0, -1) : pattern;
    // Convert wildcards to a regex. Escape every regex special char except `*`.
    const regexSource = body
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
    const re = new RegExp("^" + regexSource + (hasEndAnchor ? "$" : ""));
    return re.test(path);
}
//# sourceMappingURL=robots.parser.js.map