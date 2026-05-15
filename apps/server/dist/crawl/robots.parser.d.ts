export interface RobotsRule {
    /** "allow" | "disallow" */
    type: "allow" | "disallow";
    /** Pattern as written, with wildcards. Empty Disallow = allow all. */
    pattern: string;
}
export interface UserAgentGroup {
    userAgents: string[];
    rules: RobotsRule[];
    /** Crawl-delay in seconds, or undefined if not declared. */
    crawlDelaySec?: number;
}
export interface ParsedRobots {
    groups: UserAgentGroup[];
    /** Sitemaps are host-level, not UA-scoped. */
    sitemaps: string[];
    /** Any directive Shopify/Woo wouldn't recognize but we passed through. */
    rawUnknown: Array<{
        line: number;
        key: string;
        value: string;
    }>;
}
/**
 * Parse a robots.txt body. Tolerant of CR/LF mixing, BOM, blank lines,
 * malformed directives. Never throws — returns an empty result for garbage.
 */
export declare function parseRobotsTxt(text: string): ParsedRobots;
/**
 * Resolve whether a given user-agent can fetch the given URL path under the
 * parsed robots.txt rules. Implements RFC 9309 §2.2.2 longest-match-first
 * with allow > disallow tie-break.
 *
 * Selection of the matching group: choose the most specific UA group whose
 * UA string is a prefix of `userAgent` (case-insensitive). Fall back to the
 * wildcard `*` group. If no group matches, the path is allowed.
 */
export declare function isAllowed(parsed: ParsedRobots, userAgent: string, urlPath: string): boolean;
/** Look up the crawl-delay (seconds) that applies to a given UA. */
export declare function crawlDelayFor(parsed: ParsedRobots, userAgent: string): number | undefined;
//# sourceMappingURL=robots.parser.d.ts.map