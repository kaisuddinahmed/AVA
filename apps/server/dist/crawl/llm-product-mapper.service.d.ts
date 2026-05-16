import type { GenericProduct } from "./generic-product.extractor.js";
export interface LlmMapperConfig {
    enabled: boolean;
    maxHtmlBytes: number;
    maxCallsPerSite: number;
    model: string;
}
export declare function getLlmMapperConfig(): LlmMapperConfig;
export interface SiteTelemetry {
    callsMade: number;
    successCount: number;
    invalidCount: number;
    inputTokens: number;
    outputTokens: number;
}
export declare function getLlmMapperTelemetry(siteUrl: string): SiteTelemetry;
export declare function resetLlmMapperTelemetry(siteUrl?: string): void;
export interface LlmClient {
    chat: {
        completions: {
            create: (args: {
                model: string;
                messages: Array<{
                    role: "system" | "user";
                    content: string;
                }>;
                response_format?: {
                    type: "json_object";
                };
                temperature?: number;
            }) => Promise<{
                choices: Array<{
                    message: {
                        content: string | null;
                    };
                }>;
                usage?: {
                    prompt_tokens?: number;
                    completion_tokens?: number;
                };
            }>;
        };
    };
}
export declare function extractProductRegion(html: string, maxBytes: number): string;
export interface LlmMapperOptions {
    /** Override config (mainly for tests). */
    config?: Partial<LlmMapperConfig>;
    /** Inject an LLM client. Required in tests; production uses a constructed Groq. */
    llmClient?: LlmClient;
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
export declare function extractProductWithLLM(url: string, html: string, siteUrl: string, opts?: LlmMapperOptions): Promise<GenericProduct | null>;
/** Test helper — drop the cached client so tests can re-stub env. */
export declare function resetGroqClientForTests(): void;
//# sourceMappingURL=llm-product-mapper.service.d.ts.map