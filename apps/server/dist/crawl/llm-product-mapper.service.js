// ============================================================================
// LLM DOM product mapper — fallback for PDPs that have NO structured data.
//
// Phase 1.5.2. Constrained per Codex review:
//
//   1. Feature-flagged off by default (`LLM_DOM_MAPPER_ENABLED=true` to turn on).
//   2. HTML clipped to a max byte budget before being sent to the LLM.
//   3. Product-region detection (<main> / <article> / <body>) trims context.
//   4. zod-validated JSON output — invalid shape → null, NEVER a row.
//   5. Per-site call cap so a runaway crawl can't burn the budget.
//   6. In-memory telemetry per site (calls, success, invalid, tokens).
//   7. "no_product" escape hatch — model can refuse without faking a row.
//
// Tests MUST mock the Groq client. No live LLM calls in CI.
//
// The mapper returns the same `GenericProduct` shape as the structured-data
// extractor so the catalog-ingest layer can treat both uniformly.
// ============================================================================
import { z } from "zod";
import { logger } from "../logger.js";
const log = logger.child({ service: "llm-product-mapper" });
export function getLlmMapperConfig() {
    return {
        enabled: process.env.LLM_DOM_MAPPER_ENABLED === "true",
        maxHtmlBytes: clampInt(process.env.LLM_DOM_MAPPER_MAX_HTML_BYTES, 20_000, 1_000, 200_000),
        maxCallsPerSite: clampInt(process.env.LLM_DOM_MAPPER_MAX_CALLS_PER_SITE, 50, 1, 5_000),
        model: process.env.LLM_DOM_MAPPER_MODEL ?? "llama-3.3-70b-versatile",
    };
}
function clampInt(raw, fallback, min, max) {
    const n = Number(raw ?? fallback);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(Math.max(Math.round(n), min), max);
}
const telemetry = new Map();
function ensureTelemetry(siteUrl) {
    let t = telemetry.get(siteUrl);
    if (!t) {
        t = { callsMade: 0, successCount: 0, invalidCount: 0, inputTokens: 0, outputTokens: 0 };
        telemetry.set(siteUrl, t);
    }
    return t;
}
export function getLlmMapperTelemetry(siteUrl) {
    const t = telemetry.get(siteUrl);
    return t ? { ...t } : { callsMade: 0, successCount: 0, invalidCount: 0, inputTokens: 0, outputTokens: 0 };
}
export function resetLlmMapperTelemetry(siteUrl) {
    if (siteUrl)
        telemetry.delete(siteUrl);
    else
        telemetry.clear();
}
// ---------------------------------------------------------------------------
// Output schema — strict. Anything outside this shape → reject.
// ---------------------------------------------------------------------------
const OUTPUT_SCHEMA = z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).nullable(),
    imageUrl: z.string().url().nullable(),
    priceMin: z.number().finite().nullable(),
    priceMax: z.number().finite().nullable(),
    currency: z.string().min(2).max(8).default("USD"),
    availability: z.enum(["in_stock", "out_of_stock", "partial", "unknown"]),
});
const NO_PRODUCT_SCHEMA = z.object({ _no_product: z.literal(true) });
// ---------------------------------------------------------------------------
// Product-region extraction — heavy trim before the LLM sees anything.
// ---------------------------------------------------------------------------
export function extractProductRegion(html, maxBytes) {
    if (!html)
        return "";
    // Strip <script>, <style>, <svg> — they're noise and waste tokens.
    let stripped = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
    // Prefer <main>, then <article>, then <body>, then full document.
    const main = stripped.match(/<main\b[\s\S]*?<\/main>/i);
    if (main)
        stripped = main[0];
    else {
        const article = stripped.match(/<article\b[\s\S]*?<\/article>/i);
        if (article)
            stripped = article[0];
        else {
            const body = stripped.match(/<body\b[\s\S]*?<\/body>/i);
            if (body)
                stripped = body[0];
        }
    }
    // Collapse whitespace runs to keep the byte budget meaningful.
    stripped = stripped.replace(/\s+/g, " ").trim();
    // True UTF-8 byte length (Codex P3 — string length under-counts multi-byte chars).
    const buf = Buffer.from(stripped, "utf8");
    if (buf.length <= maxBytes)
        return stripped;
    // Naively slicing mid-codepoint produces a U+FFFD replacement char on
    // decode, which is itself 3 bytes — pushing the *output* over maxBytes.
    // Back off byte-by-byte until the decoded string's UTF-8 byte length
    // honours the cap. O(<=4) iterations in the worst case (UTF-8 max length).
    let end = maxBytes;
    let result = buf.subarray(0, end).toString("utf8");
    while (Buffer.byteLength(result, "utf8") > maxBytes && end > 0) {
        end--;
        result = buf.subarray(0, end).toString("utf8");
    }
    return result;
}
// ---------------------------------------------------------------------------
// Prompt — deliberately boring; we want determinism.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are extracting product data from an e-commerce HTML page.

Return ONLY a JSON object with EXACTLY these fields:
- "title" (string, required, the visible product name)
- "description" (string or null, the product description; null if not present)
- "imageUrl" (full https:// URL string or null, the primary product image)
- "priceMin" (number or null, lowest variant price; null if no price visible)
- "priceMax" (number or null, highest variant price; null if no price visible)
- "currency" (3-letter ISO code; "USD" if unknown)
- "availability" (one of: "in_stock", "out_of_stock", "partial", "unknown")

If the page is NOT a product detail page (e.g., it's a homepage, category page,
cart, blog post), return EXACTLY this and nothing else:
{"_no_product": true}

Rules:
- Do not invent fields. Do not include explanations or markdown.
- Output must be a single valid JSON object.
- If you are uncertain about a field, return null for it (or "unknown" for availability).`;
// ---------------------------------------------------------------------------
// URL → externalId / handle (same scheme as the structured-data extractor).
// ---------------------------------------------------------------------------
function urlHandleAndId(url) {
    let path;
    try {
        path = new URL(url).pathname.replace(/\/+$/, "");
    }
    catch {
        path = url;
    }
    const handle = (path.split("/").filter(Boolean).pop() || "product").toLowerCase();
    let host = "";
    try {
        host = new URL(url).host;
    }
    catch { /* ignore */ }
    return { handle, externalId: `generic:${host}${path}` };
}
/**
 * Attempt to extract a product record from `html` via the LLM.
 *
 * Behavior:
 *   - Disabled flag → returns null without calling the LLM.
 *   - Per-site call cap reached → returns null + logs warn.
 *   - LLM returns `{_no_product: true}` → returns null (correct refusal).
 *   - LLM output fails zod validation → returns null (fallback-to-empty).
 *   - LLM throws / network error → returns null.
 *
 * Never throws. Never invents fields. Telemetry is always updated when the
 * LLM IS called, win or lose.
 */
export async function extractProductWithLLM(url, html, siteUrl, opts = {}) {
    const cfg = { ...getLlmMapperConfig(), ...opts.config };
    if (!cfg.enabled)
        return null;
    const tel = ensureTelemetry(siteUrl);
    if (tel.callsMade >= cfg.maxCallsPerSite) {
        log.warn({ siteUrl, cap: cfg.maxCallsPerSite, url }, "[LLM mapper] call cap reached");
        return null;
    }
    const region = extractProductRegion(html, cfg.maxHtmlBytes);
    if (region.length < 50) {
        // Not enough HTML to reason over — skip the call entirely.
        return null;
    }
    const client = opts.llmClient ?? createGroqClient();
    if (!client)
        return null;
    // Count the call BEFORE awaiting so concurrent requests stay capped.
    tel.callsMade++;
    let rawContent;
    try {
        const completion = await client.chat.completions.create({
            model: cfg.model,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Page URL: ${url}\n\nHTML:\n${region}` },
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });
        rawContent = completion.choices?.[0]?.message?.content ?? "";
        if (completion.usage) {
            tel.inputTokens += completion.usage.prompt_tokens ?? 0;
            tel.outputTokens += completion.usage.completion_tokens ?? 0;
        }
    }
    catch (err) {
        log.warn({ err, url }, "[LLM mapper] Groq call failed");
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    }
    catch {
        tel.invalidCount++;
        log.warn({ url, snippet: rawContent.slice(0, 200) }, "[LLM mapper] non-JSON output");
        return null;
    }
    // Refusal path — model said this isn't a PDP. Correct behavior, not failure.
    if (NO_PRODUCT_SCHEMA.safeParse(parsed).success) {
        log.info({ url }, "[LLM mapper] model reports no product on page");
        return null;
    }
    const validated = OUTPUT_SCHEMA.safeParse(parsed);
    if (!validated.success) {
        tel.invalidCount++;
        log.warn({ url, issues: validated.error.issues.slice(0, 3) }, "[LLM mapper] schema validation failed");
        return null;
    }
    tel.successCount++;
    const { handle, externalId } = urlHandleAndId(url);
    const d = validated.data;
    return {
        externalId,
        handle,
        title: d.title,
        description: d.description,
        imageUrl: d.imageUrl,
        priceMin: d.priceMin,
        priceMax: d.priceMax,
        currency: d.currency,
        availability: d.availability,
        url,
        sourceSignal: "llm",
    };
}
// ---------------------------------------------------------------------------
// Lazy Groq client construction — avoid importing groq-sdk at module load
// (intent-parser already does that with the eager-init pattern; we don't
// want to duplicate that surface).
// ---------------------------------------------------------------------------
let groqSingleton = null;
function createGroqClient() {
    if (groqSingleton)
        return groqSingleton;
    const apiKey = process.env.GROQ_API_KEY ?? "";
    if (!apiKey) {
        log.warn("[LLM mapper] GROQ_API_KEY missing — refusing to construct client");
        return null;
    }
    // Lazy require to avoid pulling groq-sdk into test workers that mock it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Groq = require("groq-sdk").default ?? require("groq-sdk");
    groqSingleton = new Groq({ apiKey });
    return groqSingleton;
}
/** Test helper — drop the cached client so tests can re-stub env. */
export function resetGroqClientForTests() {
    groqSingleton = null;
}
//# sourceMappingURL=llm-product-mapper.service.js.map