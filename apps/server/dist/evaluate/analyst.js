import Groq from "groq-sdk";
import { config } from "../config.js";
import { SYSTEM_PROMPT } from "./prompts/system-prompt.js";
import { buildEvaluatePrompt } from "./prompts/evaluate-prompt.js";
import { ModelVersionRepo } from "@ava/db";
import { logger } from "../logger.js";
const log = logger.child({ service: "evaluate" });
const groq = new Groq({
    apiKey: config.groq.apiKey,
});
// TTL-cached active model lookup (60s)
let _cachedActiveModel = null;
let _cachedActiveModelAt = 0;
const MODEL_CACHE_TTL_MS = 60_000;
async function resolveModel(modelOverride) {
    if (modelOverride)
        return modelOverride;
    const now = Date.now();
    if (_cachedActiveModel && now - _cachedActiveModelAt < MODEL_CACHE_TTL_MS) {
        return _cachedActiveModel;
    }
    try {
        const active = await ModelVersionRepo.getActiveModel("groq");
        if (active?.modelId) {
            _cachedActiveModel = active.modelId;
            _cachedActiveModelAt = now;
            return active.modelId;
        }
    }
    catch {
        // Fall through to default
    }
    return config.groq.model;
}
/**
 * Call the Groq API (Llama 3.3 70B) to evaluate the session.
 */
export async function evaluateWithLLM(context, modelOverride) {
    const userPrompt = buildEvaluatePrompt(context);
    const model = await resolveModel(modelOverride);
    const response = await groq.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
            {
                role: "system",
                content: SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: userPrompt,
            },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
    });
    // Extract text from response
    const text = response.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error("No text response from LLM");
    }
    // Parse the JSON response
    const raw = text.trim();
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw;
    try {
        const parsed = JSON.parse(jsonStr);
        // Validate required fields
        if (!parsed.narrative || !parsed.signals || !parsed.detected_frictions) {
            throw new Error("Missing required fields in LLM response");
        }
        // Clamp signal values
        parsed.signals.intent = clamp(parsed.signals.intent);
        parsed.signals.friction = clamp(parsed.signals.friction);
        parsed.signals.clarity = clamp(parsed.signals.clarity);
        parsed.signals.receptivity = clamp(parsed.signals.receptivity);
        parsed.signals.value = clamp(parsed.signals.value);
        return parsed;
    }
    catch (error) {
        log.error("[Analyst] Failed to parse LLM response:", raw);
        // Return safe defaults
        return {
            narrative: "Unable to parse analyst response.",
            detected_frictions: [],
            signals: { intent: 30, friction: 20, clarity: 20, receptivity: 80, value: 30 },
            recommended_action: "monitor",
            reasoning: "LLM response parsing failed; defaulting to monitoring.",
        };
    }
}
function clamp(val) {
    return Math.max(0, Math.min(100, Math.round(val)));
}
//# sourceMappingURL=analyst.js.map