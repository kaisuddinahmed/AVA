// ============================================================================
// think/llm-thinker — bounded LLM augmentation for the salesperson decision.
//
// Step 6 (2026-05-19). The rule-based `decideMove` covers ~80% of well-known
// situations via the playbook catalog. This module fills the long tail:
// when there is no playbook for the firing friction, or the rule-based
// pick has low confidence, the LLM produces a structured SalespersonMove
// from a tight prompt over the live VisitorMind / ConversationState.
//
// Guardrails (all hard):
//   - Off by default. Enable with `THINK_LLM_ENABLED=true`.
//   - Per-session budget (default 2 calls). Tracked in-process.
//   - Cached by (frictionId + visitor-mind hash). Same situation, same
//     answer — no re-paying for thought.
//   - Hard timeout (default 3s). Timeout or error → return null and the
//     caller falls back to rule-based output.
//   - Output is parsed against the SalespersonMove shape. Anything off
//     schema is treated as a failure.
//   - Voice budget still enforced upstream (≤80-char voice_script,
//     ≤500-char sales_dialog). The thinker is required to stay inside it.
// ============================================================================

import Groq from "groq-sdk";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  SalespersonMove,
  MoveIntent,
  MoveTone,
  ObjectionType,
} from "./think.types.js";

const log = logger.child({ service: "think-llm" });

const MAX_VOICE_SCRIPT = 80;
const MAX_SALES_DIALOG = 500;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_BUDGET_PER_SESSION = 2;
const CACHE_TTL_MS = 5 * 60 * 1000;

const VALID_INTENTS: MoveIntent[] = [
  "greet",
  "clarify",
  "highlight",
  "objection_handle",
  "urgency",
  "close",
  "recover",
  "wait",
];
const VALID_TONES: MoveTone[] = ["warm", "urgent", "reassuring", "confident"];
const VALID_OBJECTIONS: ObjectionType[] = [
  "price",
  "fit",
  "trust",
  "delivery",
  "choice",
  "timing",
];

// ----- Module state --------------------------------------------------------

const sessionBudget: Map<string, number> = new Map();
const cache: Map<string, { move: SalespersonMove; expiresAt: number }> = new Map();

let groqClient: Groq | null = null;
function getGroq(): Groq {
  if (!groqClient) groqClient = new Groq({ apiKey: config.groq.apiKey });
  return groqClient;
}

// ----- Public API ----------------------------------------------------------

export interface LlmThinkInput {
  sessionId: string;
  frictionId: string;
  frictionIds: readonly string[];
  tier: string;
  /**
   * Live visitor state — passed in by the caller so this module stays
   * stateless w.r.t. repos. The caller is expected to load
   * VisitorMindRepo.getViewBySession and ConversationStateRepo, then
   * stringify the relevant bits.
   */
  visitorContext: {
    mood?: string;
    decisionPressure?: number;
    priceSensitivity?: number;
    personaHint?: string | null;
    objections?: ReadonlyArray<{ type: string; confidence: number }>;
  };
  conversationTurns?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  /** Free-form merchant coaching config — applied verbatim into the prompt. */
  coachingHints?: string;
}

/** Whether the bounded LLM path is enabled for this deployment. */
export function isLlmThinkingEnabled(): boolean {
  return process.env.THINK_LLM_ENABLED === "true";
}

/**
 * Produce a SalespersonMove via the LLM, or null if the call should be
 * skipped or fails. Never throws — caller falls back to rule-based.
 */
export async function llmThink(
  input: LlmThinkInput,
): Promise<SalespersonMove | null> {
  if (!isLlmThinkingEnabled()) return null;
  if (!config.groq.apiKey) return null;

  // Budget gate.
  const used = sessionBudget.get(input.sessionId) ?? 0;
  if (used >= DEFAULT_BUDGET_PER_SESSION) {
    log.debug?.({ sessionId: input.sessionId }, "[think-llm] budget exhausted");
    return null;
  }

  // Cache gate.
  const cacheKey = makeCacheKey(input);
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.move;

  // Issue the call with timeout.
  let move: SalespersonMove | null = null;
  try {
    move = await withTimeout(callGroq(input), DEFAULT_TIMEOUT_MS);
  } catch (err) {
    log.warn(
      {
        sessionId: input.sessionId,
        err: err instanceof Error ? err.message : String(err),
      },
      "[think-llm] call failed; falling back to rule-based",
    );
    return null;
  }
  if (!move) return null;

  cache.set(cacheKey, { move, expiresAt: Date.now() + CACHE_TTL_MS });
  sessionBudget.set(input.sessionId, used + 1);
  return move;
}

/** Test hook — clears module state. */
export function __resetLlmThinkerState(): void {
  sessionBudget.clear();
  cache.clear();
}

// ----- Internals -----------------------------------------------------------

async function callGroq(input: LlmThinkInput): Promise<SalespersonMove | null> {
  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateMove(parsed, input);
}

function buildUserPrompt(input: LlmThinkInput): string {
  const turnSummary =
    (input.conversationTurns ?? [])
      .slice(-6)
      .map((t) => `${t.role}: ${t.content}`)
      .join("\n") || "(none)";

  const objSummary =
    (input.visitorContext.objections ?? [])
      .map((o) => `${o.type}:${o.confidence.toFixed(2)}`)
      .join(", ") || "(none)";

  return [
    `Firing friction: ${input.frictionId} (severity tier ${input.tier})`,
    `All detected frictions: ${input.frictionIds.join(", ")}`,
    `Visitor mood: ${input.visitorContext.mood ?? "unknown"}`,
    `Decision pressure: ${input.visitorContext.decisionPressure ?? "?"}`,
    `Price sensitivity: ${input.visitorContext.priceSensitivity ?? "?"}`,
    `Persona hint: ${input.visitorContext.personaHint ?? "unknown"}`,
    `Inferred objections: ${objSummary}`,
    `Recent conversation:\n${turnSummary}`,
    input.coachingHints ? `Merchant coaching:\n${input.coachingHints}` : "",
    "",
    "Return a SalespersonMove JSON object matching the schema. Voice script ≤80 chars, sales_dialog ≤500 chars.",
  ]
    .filter(Boolean)
    .join("\n");
}

const SYSTEM_PROMPT = `You are AVA, a virtual salesperson speaking with a visitor in real time.
Your job is to decide one next move and return it as strict JSON matching this schema:

{
  "intent": "greet|clarify|highlight|objection_handle|urgency|close|recover|wait",
  "objection_type": "price|fit|trust|delivery|choice|timing|null",
  "voice_script": "string ≤80 chars — what you would say out loud",
  "sales_dialog": "string ≤500 chars — the richer bubble version of the same move",
  "playbook_objective": "short string — what this move is trying to accomplish",
  "tone": "warm|urgent|reassuring|confident",
  "expected_visitor_response": "click_cta|ask_followup|ignore|leave|null",
  "next_state_mood": "confident|engaged|hesitant|frustrated|leaving|null"
}

Rules:
- voice_script must be ≤80 characters and read naturally aloud.
- sales_dialog must be longer than voice_script and ≤500 characters.
- intent must match the situation; objection_type is non-null only for intent=objection_handle.
- Never invent facts about the merchant, product, or pricing. Stay generic if specifics aren't supplied.
- Return JSON only — no preamble, no markdown.`;

function validateMove(raw: unknown, input: LlmThinkInput): SalespersonMove | null {
  if (!isObject(raw)) return null;

  const intent = raw.intent;
  if (typeof intent !== "string" || !VALID_INTENTS.includes(intent as MoveIntent)) {
    return null;
  }

  const voice = typeof raw.voice_script === "string" ? raw.voice_script : "";
  const dialog = typeof raw.sales_dialog === "string" ? raw.sales_dialog : "";
  if (!voice || voice.length > MAX_VOICE_SCRIPT) return null;
  if (!dialog || dialog.length > MAX_SALES_DIALOG) return null;

  const tone =
    typeof raw.tone === "string" && VALID_TONES.includes(raw.tone as MoveTone)
      ? (raw.tone as MoveTone)
      : "warm";

  let objection_type: ObjectionType | null = null;
  if (
    intent === "objection_handle" &&
    typeof raw.objection_type === "string" &&
    VALID_OBJECTIONS.includes(raw.objection_type as ObjectionType)
  ) {
    objection_type = raw.objection_type as ObjectionType;
  }

  const expected =
    typeof raw.expected_visitor_response === "string" &&
    ["click_cta", "ask_followup", "ignore", "leave"].includes(
      raw.expected_visitor_response,
    )
      ? (raw.expected_visitor_response as SalespersonMove["expected_visitor_response"])
      : null;

  const next_state_mood =
    typeof raw.next_state_mood === "string" ? raw.next_state_mood : undefined;

  return {
    intent: intent as MoveIntent,
    objection_type,
    tactic_id: "LLM_GEN",
    voice_script: voice,
    sales_dialog: dialog,
    playbook_objective:
      typeof raw.playbook_objective === "string"
        ? raw.playbook_objective
        : null,
    tone,
    expected_visitor_response: expected,
    next_state_hypothesis: next_state_mood
      ? { mood: next_state_mood, tier: input.tier }
      : null,
    attribution_tag: `${input.frictionId}:LLM_GEN`,
    // Codex P2.5 — caller (decideMoveAsync) may override; this is the
    // baseline when the LLM is invoked directly without going through
    // the rule-confidence gate.
    confidence: 1.0,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function makeCacheKey(input: LlmThinkInput): string {
  const ctx = input.visitorContext;
  const objHash = (ctx.objections ?? [])
    .map((o) => `${o.type}:${Math.round(o.confidence * 10)}`)
    .sort()
    .join("|");
  return [
    input.frictionId,
    input.tier,
    ctx.mood ?? "?",
    ctx.personaHint ?? "?",
    Math.round((ctx.decisionPressure ?? 0) / 10),
    Math.round((ctx.priceSensitivity ?? 0) / 10),
    objHash,
  ].join("__");
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
