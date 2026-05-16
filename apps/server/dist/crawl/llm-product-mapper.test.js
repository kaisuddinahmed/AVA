// ============================================================================
// LLM DOM product mapper — unit tests with mocked Groq client.
//
// CRITICAL: per the Phase 1.5.2 plan, NO test in this file may hit the real
// Groq API. Every call is injected via `opts.llmClient`. CI must stay
// offline-safe.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractProductWithLLM, extractProductRegion, getLlmMapperTelemetry, resetLlmMapperTelemetry, } from "./llm-product-mapper.service.js";
const SITE = "https://shop.example.com";
const PDP = "https://shop.example.com/products/raw-linen-tee";
const VALID_OUTPUT = {
    title: "Raw Linen Tee",
    description: "Lightweight raw linen.",
    imageUrl: "https://cdn.example.com/img.jpg",
    priceMin: 48,
    priceMax: 48,
    currency: "USD",
    availability: "in_stock",
};
function fakeClient(opts) {
    return {
        chat: {
            completions: {
                create: vi.fn(async () => {
                    if (opts.shouldThrow)
                        throw new Error("upstream blew up");
                    return {
                        choices: [{ message: { content: opts.content ?? JSON.stringify(VALID_OUTPUT) } }],
                        usage: opts.usage,
                    };
                }),
            },
        },
    };
}
beforeEach(() => {
    process.env.LLM_DOM_MAPPER_ENABLED = "true";
    resetLlmMapperTelemetry();
});
// ── Feature flag ────────────────────────────────────────────────────────────
describe("extractProductWithLLM — feature flag", () => {
    it("returns null and does NOT call the client when disabled", async () => {
        process.env.LLM_DOM_MAPPER_ENABLED = "false";
        const client = fakeClient({});
        const result = await extractProductWithLLM(PDP, "<html><body>x</body></html>", SITE, {
            llmClient: client,
        });
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });
    it("respects `config.enabled: false` even if env says enabled", async () => {
        const client = fakeClient({});
        const result = await extractProductWithLLM(PDP, "<html><body>x</body></html>", SITE, {
            llmClient: client,
            config: { enabled: false },
        });
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });
});
// ── Happy path ──────────────────────────────────────────────────────────────
describe("extractProductWithLLM — successful extraction", () => {
    it("returns a normalized GenericProduct with sourceSignal='llm'", async () => {
        const client = fakeClient({
            content: JSON.stringify(VALID_OUTPUT),
            usage: { prompt_tokens: 1500, completion_tokens: 80 },
        });
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        const product = await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        expect(product).toMatchObject({
            title: "Raw Linen Tee",
            handle: "raw-linen-tee",
            priceMin: 48,
            priceMax: 48,
            currency: "USD",
            availability: "in_stock",
            sourceSignal: "llm",
            url: PDP,
        });
        expect(product.externalId).toBe("generic:shop.example.com/products/raw-linen-tee");
    });
    it("emits per-site telemetry on success (tokens, success count)", async () => {
        const client = fakeClient({
            content: JSON.stringify(VALID_OUTPUT),
            usage: { prompt_tokens: 1200, completion_tokens: 90 },
        });
        const html = "<html><body><main>" + "x".repeat(200) + "</main></body></html>";
        await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        const t = getLlmMapperTelemetry(SITE);
        expect(t).toMatchObject({
            callsMade: 1,
            successCount: 1,
            invalidCount: 0,
            inputTokens: 1200,
            outputTokens: 90,
        });
    });
    it("sets temperature=0 and json_object response_format on the request", async () => {
        const client = fakeClient({ content: JSON.stringify(VALID_OUTPUT) });
        await extractProductWithLLM(PDP, "<html><body><main>" + "x".repeat(100) + "</main></body></html>", SITE, {
            llmClient: client,
        });
        const callArgs = client.chat.completions.create.mock.calls[0][0];
        expect(callArgs.temperature).toBe(0);
        expect(callArgs.response_format).toEqual({ type: "json_object" });
    });
});
// ── Refusal path ────────────────────────────────────────────────────────────
describe("extractProductWithLLM — model refusal", () => {
    it("returns null when model says {_no_product: true}", async () => {
        const client = fakeClient({ content: JSON.stringify({ _no_product: true }) });
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        const result = await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        expect(result).toBeNull();
        // Refusal still counts as a call (telemetry-wise), but NOT as a success.
        const t = getLlmMapperTelemetry(SITE);
        expect(t.callsMade).toBe(1);
        expect(t.successCount).toBe(0);
    });
});
// ── Validation failures (fallback-to-empty) ────────────────────────────────
describe("extractProductWithLLM — output validation", () => {
    it("returns null when output is not valid JSON", async () => {
        const client = fakeClient({ content: "this is not json {" });
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        const result = await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        expect(result).toBeNull();
        expect(getLlmMapperTelemetry(SITE).invalidCount).toBe(1);
    });
    it("returns null when output is missing required fields", async () => {
        const client = fakeClient({ content: JSON.stringify({ priceMin: 10 }) }); // no title etc.
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        const result = await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        expect(result).toBeNull();
        expect(getLlmMapperTelemetry(SITE).invalidCount).toBe(1);
    });
    it("returns null when imageUrl is not a valid URL (refuse hallucinated row)", async () => {
        const client = fakeClient({
            content: JSON.stringify({ ...VALID_OUTPUT, imageUrl: "not-a-url" }),
        });
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        const result = await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        expect(result).toBeNull();
    });
    it("returns null when availability is not in the allowed enum", async () => {
        const client = fakeClient({
            content: JSON.stringify({ ...VALID_OUTPUT, availability: "maybe" }),
        });
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        const result = await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        expect(result).toBeNull();
    });
});
// ── Error handling ──────────────────────────────────────────────────────────
describe("extractProductWithLLM — LLM transport errors", () => {
    it("returns null when the Groq call throws", async () => {
        const client = fakeClient({ shouldThrow: true });
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        const result = await extractProductWithLLM(PDP, html, SITE, { llmClient: client });
        expect(result).toBeNull();
        // Still counted as an attempt so the cost cap is honoured.
        expect(getLlmMapperTelemetry(SITE).callsMade).toBe(1);
    });
});
// ── Per-site cost cap ──────────────────────────────────────────────────────
describe("extractProductWithLLM — per-site call cap", () => {
    it("stops calling the client once the per-site cap is reached", async () => {
        const client = fakeClient({ content: JSON.stringify(VALID_OUTPUT) });
        const html = "<html><body><main>" + "x".repeat(100) + "</main></body></html>";
        // Cap = 2 → first two calls hit the LLM, third is blocked.
        const a = await extractProductWithLLM(PDP + "/a", html, SITE, {
            llmClient: client, config: { maxCallsPerSite: 2 },
        });
        const b = await extractProductWithLLM(PDP + "/b", html, SITE, {
            llmClient: client, config: { maxCallsPerSite: 2 },
        });
        const c = await extractProductWithLLM(PDP + "/c", html, SITE, {
            llmClient: client, config: { maxCallsPerSite: 2 },
        });
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(c).toBeNull();
        expect(client.chat.completions.create.mock.calls).toHaveLength(2);
    });
});
// ── Empty / tiny page guard ────────────────────────────────────────────────
describe("extractProductWithLLM — input guards", () => {
    it("skips the LLM call entirely when the trimmed HTML is too short", async () => {
        const client = fakeClient({});
        const result = await extractProductWithLLM(PDP, "<html></html>", SITE, { llmClient: client });
        expect(result).toBeNull();
        expect(client.chat.completions.create).not.toHaveBeenCalled();
    });
});
// ── Product-region extraction ──────────────────────────────────────────────
describe("extractProductRegion", () => {
    it("prefers <main> when present", () => {
        const html = `<html><body><nav>x</nav><main><h1>Title</h1></main><footer>y</footer></body></html>`;
        const region = extractProductRegion(html, 10_000);
        expect(region).toContain("<main");
        expect(region).toContain("Title");
        expect(region).not.toContain("<nav");
        expect(region).not.toContain("<footer");
    });
    it("falls back to <article> when <main> is absent", () => {
        const html = `<html><body><article>article body</article><footer>y</footer></body></html>`;
        const region = extractProductRegion(html, 10_000);
        expect(region).toContain("article body");
        expect(region).not.toContain("<footer");
    });
    it("strips <script>, <style>, <svg> to save tokens", () => {
        const html = `<html><body><main>
      <script>window.x = 1</script>
      <style>.x{color:red}</style>
      <svg><circle/></svg>
      <h1>Product Title</h1>
    </main></body></html>`;
        const region = extractProductRegion(html, 10_000);
        expect(region).toContain("Product Title");
        expect(region).not.toContain("window.x");
        expect(region).not.toContain("color:red");
        expect(region).not.toContain("<circle");
    });
    it("truncates to the byte budget", () => {
        const big = "x".repeat(50_000);
        const region = extractProductRegion(`<html><body><main>${big}</main></body></html>`, 1000);
        expect(region.length).toBeLessThanOrEqual(1000);
    });
    it("multibyte input: output's UTF-8 byte length never exceeds the cap", () => {
        // "é" is 2 bytes in UTF-8 ("\xC3\xA9"). 500 instances → 1000 bytes of
        // multibyte content. Cap at 5 bytes — a naive slice would land
        // mid-codepoint and emit a U+FFFD replacement (3 bytes), pushing the
        // output above the cap. The fix backs off to a clean boundary.
        const big = "é".repeat(500);
        const html = `<html><body><main>${big}</main></body></html>`;
        for (const cap of [5, 7, 50, 511, 999]) {
            const region = extractProductRegion(html, cap);
            const actualBytes = Buffer.byteLength(region, "utf8");
            expect(actualBytes, `cap=${cap} produced ${actualBytes} bytes`).toBeLessThanOrEqual(cap);
        }
    });
});
//# sourceMappingURL=llm-product-mapper.test.js.map