// ============================================================================
// Training Data Formatter — transforms FineTuningRecords into chat fine-tuning
// JSONL format (system/user/assistant message triples).
//
// Supports: Groq and generic chat-completion fine-tuning formats.
// ============================================================================
import { exportAsRecords, } from "./training-export.service.js";
import { SYSTEM_PROMPT } from "../evaluate/prompts/system-prompt.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_OPTIONS = {
    preset: "generic",
    minEventCount: 2,
    includeOutcomes: ["converted", "dismissed"],
    minClarityScore: 0,
    includeOutcomeHint: false,
    maxExamples: 0, // 0 = no extra limit
};
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Format training data as chat fine-tuning JSONL.
 * Each line is a JSON object with { messages: [...] }.
 */
export async function formatAsFineTuningJsonl(filters, options) {
    const { examples, stats } = await formatRecords(filters, options);
    const jsonl = examples.map((ex) => JSON.stringify(ex)).join("\n");
    return { jsonl, stats };
}
/**
 * Format training data as an array of chat fine-tuning examples.
 */
export async function formatAsExamples(filters, options) {
    return formatRecords(filters, options);
}
// ---------------------------------------------------------------------------
// Core formatter
// ---------------------------------------------------------------------------
async function formatRecords(filters, options) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    // Fetch raw records from export service
    const records = await exportAsRecords(filters);
    const outcomeDistribution = {};
    const examples = [];
    let filteredOut = 0;
    for (const record of records) {
        // Track all outcomes for stats
        outcomeDistribution[record.outcome.label] =
            (outcomeDistribution[record.outcome.label] || 0) + 1;
        // Apply quality filters
        if (!passesFilters(record, opts)) {
            filteredOut++;
            continue;
        }
        // Apply max examples cap
        if (opts.maxExamples > 0 && examples.length >= opts.maxExamples)
            break;
        examples.push(recordToExample(record, opts));
    }
    // Estimate avg tokens (rough: 1 token ≈ 4 chars)
    const totalChars = examples.reduce((sum, ex) => sum + ex.messages.reduce((s, m) => s + m.content.length, 0), 0);
    const avgTokenEstimate = examples.length > 0
        ? Math.round(totalChars / examples.length / 4)
        : 0;
    return {
        examples,
        stats: {
            totalRecords: records.length,
            filteredOut,
            formatted: examples.length,
            outcomeDistribution,
            avgTokenEstimate,
        },
    };
}
// ---------------------------------------------------------------------------
// Quality filters
// ---------------------------------------------------------------------------
function passesFilters(record, opts) {
    // Outcome filter
    if (!opts.includeOutcomes.includes(record.outcome.label))
        return false;
    // Minimum event count
    const eventCount = Array.isArray(record.input.events)
        ? record.input.events.length
        : 0;
    if (eventCount < opts.minEventCount)
        return false;
    // Minimum clarity score
    if (opts.minClarityScore > 0 && record.output.scores.clarity < opts.minClarityScore) {
        return false;
    }
    // Must have a non-empty narrative
    if (!record.output.narrative || record.output.narrative.trim().length === 0) {
        return false;
    }
    return true;
}
// ---------------------------------------------------------------------------
// Record → Chat example conversion
// ---------------------------------------------------------------------------
function recordToExample(record, opts) {
    return {
        messages: [
            { role: "system", content: buildSystemMessage(opts.preset) },
            { role: "user", content: buildUserMessage(record) },
            { role: "assistant", content: buildAssistantMessage(record, opts) },
        ],
    };
}
/**
 * System message — uses the production evaluation prompt.
 * Keeps fine-tuning aligned with how the model is used at inference time.
 */
function buildSystemMessage(_preset) {
    return SYSTEM_PROMPT;
}
/**
 * User message — session context + events formatted like the evaluate prompt.
 * Mirrors the structure from evaluate-prompt.ts so the fine-tuned model
 * learns to handle the same input format it sees in production.
 */
function buildUserMessage(record) {
    const { sessionContext, events, pageType } = record.input;
    const sessionMeta = {
        deviceType: sessionContext.deviceType,
        referrerType: sessionContext.referrerType,
        isLoggedIn: sessionContext.isLoggedIn,
        isRepeatVisitor: sessionContext.isRepeatVisitor,
        cartValue: sessionContext.cartValue,
        cartItemCount: sessionContext.cartItemCount,
        sessionAgeSec: sessionContext.sessionAgeSec,
        totalInterventionsFired: sessionContext.totalInterventionsFired,
        totalDismissals: sessionContext.totalDismissals,
        totalConversions: sessionContext.totalConversions,
        pageType,
    };
    const eventLines = events
        .map((e, i) => `[${i + 1}] ${JSON.stringify(e)}`)
        .join("\n");
    return `═══ SESSION METADATA ═══
${JSON.stringify(sessionMeta, null, 2)}

═══ EVENTS ═══
${eventLines || "No events."}

Analyze the user's current session state and provide your evaluation in the required JSON format.`;
}
/**
 * Assistant message — the target output the model should learn to produce.
 * Structured as the strict JSON the system prompt requires.
 */
function buildAssistantMessage(record, opts) {
    const output = {
        narrative: record.output.narrative,
        detected_frictions: record.output.frictionsFound,
        signals: {
            intent: record.output.scores.intent,
            friction: record.output.scores.friction,
            clarity: record.output.scores.clarity,
            receptivity: record.output.scores.receptivity,
            value: record.output.scores.value,
        },
        recommended_action: record.decision.actionCode,
        reasoning: `Composite score ${record.decision.compositeScore.toFixed(1)} → ${record.decision.tier} tier. ${record.decision.gateOverride ? `Gate override: ${record.decision.gateOverride}.` : `Decision: ${record.decision.decision}.`}`,
    };
    // Optionally include outcome hint for reward-model-style training
    if (opts.includeOutcomeHint) {
        output._outcome = {
            label: record.outcome.label,
            delayMs: record.outcome.outcomeDelayMs,
        };
    }
    return JSON.stringify(output);
}
//# sourceMappingURL=training-formatter.service.js.map