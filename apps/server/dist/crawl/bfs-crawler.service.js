// ============================================================================
// Bounded BFS crawler — host-restricted, robots-aware, depth/page-capped.
//
// Phase 1.2.2. Composes robots.parser (1.2.1). Returns fetched pages so the
// caller can hand them to the page classifier (1.0.3), structured-data
// extractor (1.2.3), and fingerprint capture (1.2.4).
//
// Scope guard: this is an ONBOARDING crawler, not a search-engine crawler.
// Hard caps on depth + pages + crawl-delay keep it predictable and polite.
// No JS rendering — only static HTML. JS-only sites are a separate concern
// (handled by the LLM DOM mapper in Phase 1.5).
// ============================================================================
import { parseRobotsTxt, isAllowed, crawlDelayFor } from "./robots.parser.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "crawl" });
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_USER_AGENT = "AVA-Onboarding/1.0";
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_TIMEOUT_MS = 10_000;
// Floor when robots.txt is silent — be polite even without a directive.
const DEFAULT_CRAWL_DELAY_MS = 250;
// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------
/** Normalize a URL for the visited-set: strip fragment, lowercase host. */
function normalizeUrl(raw) {
    try {
        const u = new URL(raw);
        u.hash = "";
        u.hostname = u.hostname.toLowerCase();
        return u.toString();
    }
    catch {
        return null;
    }
}
function sameOrigin(a, b) {
    try {
        const ua = new URL(a);
        const ub = new URL(b);
        return ua.hostname.toLowerCase() === ub.hostname.toLowerCase() &&
            ua.protocol === ub.protocol;
    }
    catch {
        return false;
    }
}
/**
 * Extract same-origin links from a chunk of HTML. Regex-only (no DOM lib);
 * deliberately conservative — we miss JS-driven links by design.
 */
function extractLinks(html, baseUrl) {
    const out = new Set();
    const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1].trim();
        // Skip pseudo URLs and pure fragments
        if (!href || href.startsWith("#") ||
            href.startsWith("mailto:") || href.startsWith("tel:") ||
            href.startsWith("javascript:"))
            continue;
        try {
            const abs = new URL(href, baseUrl).toString();
            if (sameOrigin(abs, baseUrl)) {
                const n = normalizeUrl(abs);
                if (n)
                    out.add(n);
            }
        }
        catch {
            // ignore malformed href
        }
    }
    return Array.from(out);
}
function pathOf(url) {
    try {
        const u = new URL(url);
        return u.pathname + (u.search || "");
    }
    catch {
        return "/";
    }
}
// ---------------------------------------------------------------------------
// Internal: robots
// ---------------------------------------------------------------------------
async function fetchRobots(rootUrl, fetchImpl, userAgent) {
    try {
        const robotsUrl = new URL("/robots.txt", rootUrl).toString();
        const resp = await fetchImpl(robotsUrl, {
            method: "GET",
            headers: { "User-Agent": userAgent, "Accept": "text/plain, */*" },
        });
        if (!resp.ok)
            return null;
        return await resp.text();
    }
    catch (err) {
        log.warn({ err, rootUrl }, "[Crawl] robots.txt fetch failed (continuing without)");
        return null;
    }
}
// ---------------------------------------------------------------------------
// Internal: fetch with timeout + content-type gate
// ---------------------------------------------------------------------------
async function fetchPage(url, fetchImpl, userAgent, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetchImpl(url, {
            method: "GET",
            headers: { "User-Agent": userAgent, "Accept": "text/html, */*" },
            redirect: "follow",
            signal: controller.signal,
        });
        const contentType = resp.headers.get("content-type");
        // Only ingest text-like bodies. PDFs, images, etc. are out of scope.
        if (contentType && !/^text\/|application\/(?:xhtml|xml)/i.test(contentType)) {
            return { status: resp.status, html: "", contentType };
        }
        const html = await resp.text();
        return { status: resp.status, html, contentType };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
// ---------------------------------------------------------------------------
// Internal: politeness
// ---------------------------------------------------------------------------
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Walk a site starting from `rootUrl`. Returns up to `maxPages` fetched
 * pages plus diagnostics. Same-origin only — links to other hosts are
 * silently skipped.
 */
export async function crawlSite(opts) {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
        throw new Error("fetch is not available in this runtime");
    }
    const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    const timeoutMs = opts.perRequestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startNorm = normalizeUrl(opts.rootUrl);
    if (!startNorm) {
        throw new Error(`Invalid root URL: ${opts.rootUrl}`);
    }
    // ── Robots ─────────────────────────────────────────────────────────────
    let robots = { groups: [], sitemaps: [], rawUnknown: [] };
    if (!opts.ignoreRobots) {
        const body = opts.robotsTxt ?? (await fetchRobots(startNorm, fetchImpl, userAgent));
        if (body)
            robots = parseRobotsTxt(body);
    }
    const delaySec = crawlDelayFor(robots, userAgent);
    const crawlDelayMs = delaySec != null ? delaySec * 1000 : DEFAULT_CRAWL_DELAY_MS;
    // ── BFS state ──────────────────────────────────────────────────────────
    const result = {
        pages: [],
        robotsBlocked: [],
        errored: [],
        totalAttempted: 0,
        sitemapsFromRobots: robots.sitemaps,
    };
    const visited = new Set([startNorm]);
    const queue = [{ url: startNorm, depth: 0 }];
    let lastFetchAt = 0;
    while (queue.length > 0 && result.pages.length < maxPages) {
        const { url, depth } = queue.shift();
        result.totalAttempted++;
        // Robots check
        if (!opts.ignoreRobots && !isAllowed(robots, userAgent, pathOf(url))) {
            result.robotsBlocked.push(url);
            continue;
        }
        // Politeness — wait out the remaining crawl-delay window
        const elapsed = Date.now() - lastFetchAt;
        if (lastFetchAt && elapsed < crawlDelayMs) {
            await sleep(crawlDelayMs - elapsed);
        }
        lastFetchAt = Date.now();
        const fetched = await fetchPage(url, fetchImpl, userAgent, timeoutMs);
        if (!fetched) {
            result.errored.push(url);
            continue;
        }
        result.pages.push({
            url,
            status: fetched.status,
            html: fetched.html,
            contentType: fetched.contentType,
            depth,
        });
        // Only enqueue child links from HTML responses we can actually parse.
        if (fetched.html && depth < maxDepth && result.pages.length < maxPages) {
            for (const next of extractLinks(fetched.html, url)) {
                if (visited.has(next))
                    continue;
                visited.add(next);
                queue.push({ url: next, depth: depth + 1 });
            }
        }
    }
    log.info({
        rootUrl: opts.rootUrl,
        fetched: result.pages.length,
        blocked: result.robotsBlocked.length,
        errored: result.errored.length,
        attempted: result.totalAttempted,
    }, "[Crawl] BFS complete");
    return result;
}
//# sourceMappingURL=bfs-crawler.service.js.map