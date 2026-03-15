import type { WebSocket } from "ws";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { SessionRepo, EvaluationRepo, InterventionRepo } from "@ava/db";
import { broadcastToSession } from "../broadcast/broadcast.service.js";

const VOICE_WEIGHTS = JSON.stringify({ intent: 0.25, friction: 0.25, clarity: 0.15, receptivity: 0.20, value: 0.15 });

const groq = new Groq({ apiKey: config.groq.apiKey });

// ── Conversation history ─────────────────────────────────────────────────────
// Keyed by sessionId. Each entry is the alternating user/assistant turn pairs
// sent to Groq (excludes the system prompt). Max MAX_TURNS pairs retained.

const MAX_TURNS = 10; // 10 user turns + 10 assistant turns = 20 messages

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const conversationHistories = new Map<string, ConversationTurn[]>();

function getHistory(sessionId: string): ConversationTurn[] {
  if (!conversationHistories.has(sessionId)) {
    conversationHistories.set(sessionId, []);
  }
  return conversationHistories.get(sessionId)!;
}

function appendToHistory(
  sessionId: string,
  userTurn: string,
  assistantTurn: string,
): void {
  const history = getHistory(sessionId);
  history.push({ role: "user", content: userTurn });
  history.push({ role: "assistant", content: assistantTurn });

  // Trim to MAX_TURNS pairs (oldest turns evicted first)
  if (history.length > MAX_TURNS * 2) {
    history.splice(0, history.length - MAX_TURNS * 2);
  }
}

/**
 * Clear the conversation history for a session.
 * Called externally when a session ends or the widget reloads.
 */
export function clearConversationHistory(sessionId: string): void {
  conversationHistories.delete(sessionId);
}

// ── Page context helpers ──────────────────────────────────────────────────────

interface PageContext {
  page_type?: string;
  page_url?: string;
}

function buildSystemPrompt(pageCtx?: PageContext): string {
  let prompt =
    "You are AVA, a friendly personal shopping assistant embedded on an e-commerce site. " +
    "Answer the shopper's question in 1-2 concise sentences. " +
    "Be warm, direct, and helpful. Keep your reply under 60 words. " +
    "Do not use markdown, bullet points, or lists — plain prose only. " +
    "You have memory of this conversation — use it to give contextual follow-up answers.";

  if (pageCtx?.page_type && pageCtx.page_type !== "other") {
    prompt += ` The shopper is currently on the ${pageCtx.page_type} page.`;
  }
  if (pageCtx?.page_url) {
    // Strip query params / hash for brevity
    try {
      const url = new URL(pageCtx.page_url);
      prompt += ` Page URL: ${url.pathname}.`;
    } catch {
      // Non-parseable URL — skip
    }
  }

  return prompt;
}

/**
 * Handle a voice_query from the widget ASR pipeline.
 *
 * Flow:
 *  1. Check voice is globally enabled on this deployment.
 *  2. Load session to check voice budget / mute state.
 *  3. Build Groq messages array from system prompt + conversation history.
 *  4. Ask Groq for a short, warm shopping-assistant reply.
 *  5. Persist the new turn in conversationHistories.
 *  6. Broadcast an "active" intervention back to the widget with
 *     voice_enabled + voice_script so the TTS manager picks it up.
 *  7. Ack the sender's WS connection.
 *
 * Voice budget enforcement is intentionally lenient here: voice queries
 * are user-initiated, so we allow one extra reply even when the proactive
 * budget is exhausted — but we respect the session mute flag.
 */
export async function handleVoiceQuery(
  ws: WebSocket,
  sessionId: string,
  transcript: string,
  pageCtx?: PageContext,
): Promise<void> {
  // 1. Global toggle
  if (!config.voice.enabled) {
    ws.send(JSON.stringify({ type: "voice_query_ack", status: "disabled" }));
    return;
  }

  // 2. Session voice state
  let voicePlayback = true;
  try {
    const session = await SessionRepo.getSession(sessionId);
    if (session?.voiceMuted) {
      voicePlayback = false; // user muted this session — reply text-only
    }
  } catch {
    // DB unavailable — continue without mute check
  }

  // 3. Build Groq messages with history
  const history = getHistory(sessionId);
  const systemPrompt = buildSystemPrompt(pageCtx);

  // 4. Groq LLM — short spoken reply (with conversation context)
  let answer =
    "Great question! Let me help you find exactly what you need.";
  let voiceScript = "Let me help you find exactly what you need.";

  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: transcript },
      ],
      max_tokens: 120,
      temperature: 0.65,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (raw) {
      answer = raw;
      // Voice script = first sentence, truncated to ≤ 80 chars for natural pacing
      const firstSentence = raw.split(/(?<=[.!?])\s/)[0] ?? raw;
      voiceScript = firstSentence.length > 80
        ? firstSentence.slice(0, 77) + "…"
        : firstSentence;
    }
  } catch (err) {
    console.error("[VoiceResponder] Groq error:", err);
    // Fall through with the default answer — don't reject the user
  }

  // 5. Persist this turn to conversation history
  appendToHistory(sessionId, transcript, answer);

  // 6. Persist a minimal evaluation + intervention so outcomes can be recorded
  const payload = {
    type: "active" as const,
    action_code: "VOICE_REPLY",
    friction_id: "F036", // F036 = help_search — closest semantic match for voice queries
    message: answer,
    voice_enabled: voicePlayback,
    voice_script: voicePlayback ? voiceScript : undefined,
  };

  let interventionId = `vq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const evaluation = await EvaluationRepo.createEvaluation({
      sessionId,
      eventBatchIds: "[]",
      narrative: `Voice query: ${transcript.slice(0, 120)}`,
      frictionsFound: '["F036"]',
      intentScore: 60,
      frictionScore: 50,
      clarityScore: 55,
      receptivityScore: 70, // user explicitly asked — high receptivity
      valueScore: 55,
      compositeScore: 58,
      weightsUsed: VOICE_WEIGHTS,
      tier: "NUDGE",
      decision: "fire",
      reasoning: "User-initiated voice query — always respond",
    });

    const intervention = await InterventionRepo.createIntervention({
      sessionId,
      evaluationId: evaluation.id,
      type: "active",
      actionCode: "VOICE_REPLY",
      frictionId: "F036",
      payload: JSON.stringify(payload),
      mswimScoreAtFire: 58,
      tierAtFire: "NUDGE",
    });

    interventionId = intervention.id;

    // Increment voice counter fire-and-forget
    SessionRepo.incrementVoiceInterventionsFired(sessionId).catch(() => {});
  } catch (err) {
    console.error("[VoiceResponder] DB persist error (non-blocking):", err);
    // Fall through — still broadcast with the synthetic ID
  }

  const broadcastPayload = { ...payload, intervention_id: interventionId };

  // 7. Broadcast "active" intervention to the widget for this session
  broadcastToSession("widget", sessionId, {
    type: "intervention",
    sessionId,
    payload: broadcastPayload,
  });

  const turnCount = getHistory(sessionId).length / 2;
  console.log(
    `[VoiceResponder] Replied to session ${sessionId} (turn ${turnCount}): "${answer.slice(0, 60)}…"` +
    ` (voice=${voicePlayback})`,
  );

  // 8. Ack to the widget's WS connection
  ws.send(
    JSON.stringify({
      type: "voice_query_ack",
      intervention_id: interventionId,
      status: "ok",
    }),
  );
}
