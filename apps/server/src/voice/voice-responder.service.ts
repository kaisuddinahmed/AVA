import type { WebSocket } from "ws";
import Groq from "groq-sdk";
import { config } from "../config.js";
import {
  SessionRepo,
  EvaluationRepo,
  InterventionRepo,
  ConversationStateRepo,
} from "@ava/db";
import { broadcastToSession } from "../broadcast/broadcast.service.js";
import { isShoppingRequest } from "../agent/intent-parser.js";
import { handleShoppingQuery, broadcastAgentResponse } from "../agent/shopping-agent.service.js";
import { tierDirective, asMswimTier, type MswimTier } from "./mswim-directives.js";
import { pickPlaybookForFrictions, selectStep, type PlaybookStep } from "./sales-playbooks.js";
import { streamTtsToSession, getStreamingTtsConfig } from "./streaming-tts.service.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "voice" });

const VOICE_WEIGHTS = JSON.stringify({ intent: 0.25, friction: 0.25, clarity: 0.15, receptivity: 0.20, value: 0.15 });

const groq = new Groq({ apiKey: config.groq.apiKey });

// ── Conversation history (Phase 2.1 — persisted via ConversationStateRepo) ──
//
// Multi-turn history lives in the DB, not in process memory, so it survives
// widget reloads + server restarts. Ring-buffer cap (MAX_TURNS pairs) is
// applied at the repo layer.

const MAX_TURNS = 10; // 10 user turns + 10 assistant turns = 20 messages

/**
 * Clear the conversation history AND shopping-agent state for a session.
 * Called when a session ends or the merchant explicitly wipes state.
 * Persisted store is the source of truth — clearing it purges both surfaces.
 */
export async function clearConversationHistory(sessionId: string): Promise<void> {
  try {
    await ConversationStateRepo.purgeBySession(sessionId);
  } catch (err) {
    log.warn({ err, sessionId }, "[VoiceResponder] purge failed (non-blocking)");
  }
  // Also clear the in-process shopping agent caches (it has its own per-process
  // working state for the current request — Phase 2.1 will migrate that too,
  // but the call surface stays the same so call-sites don't need to change).
  import("../agent/shopping-agent.service.js")
    .then(({ clearAgentState }) => clearAgentState(sessionId))
    .catch(() => {});
}

/**
 * Redact a transcript for log lines: report length only, never content.
 * Per CLAUDE.md "Never log raw transcript fields" and per Codex's Phase 2.0
 * gate criterion ("no raw transcript leaked into analytics/logs").
 */
function redact(s: string | undefined | null): string {
  if (s == null) return "(empty)";
  return `(${s.length} chars)`;
}

// ── Page context helpers ──────────────────────────────────────────────────────

interface PageContext {
  page_type?: string;
  page_url?: string;
}

function buildSystemPrompt(pageCtx?: PageContext, tier?: MswimTier | null): string {
  let prompt =
    "You are AVA, a friendly personal shopping assistant embedded on an e-commerce site. " +
    "Answer the shopper's question in 1-2 concise sentences. " +
    "Be warm, direct, and helpful. Keep your reply under 60 words. " +
    "Do not use markdown, bullet points, or lists — plain prose only. " +
    "You have memory of this conversation — use it to give contextual follow-up answers.";

  // Phase 2.2 — scale assertiveness with MSWIM tier.
  prompt += "\n\n" + tierDirective(tier);

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
  let siteUrl = "";
  try {
    const session = await SessionRepo.getSession(sessionId);
    if (session?.voiceMuted) {
      voicePlayback = false; // user muted this session — reply text-only
    }
    siteUrl = session?.siteUrl ?? "";
  } catch {
    // DB unavailable — continue without mute check
  }

  // 2b. Shopping agent dispatch — intercept product searches, comparisons, add-to-cart
  //
  // OWNERSHIP: the shopping-agent's processQuery() is the sole persister of
  // shopping turns (it calls persistSession() at the end of the turn). The
  // voice responder MUST NOT also call appendTurnPair() here — that would
  // double-persist and clobber the agent's richer turn (which includes
  // `products` payload). See Codex Phase 2.1 review (P1).
  if (isShoppingRequest(transcript)) {
    try {
      const agentCtx = { ...pageCtx, siteUrl };
      const agentResponse = await handleShoppingQuery(sessionId, transcript, agentCtx);
      const interventionId = await broadcastAgentResponse(sessionId, agentResponse, voicePlayback);
      ws.send(JSON.stringify({ type: "voice_query_ack", intervention_id: interventionId, status: "ok" }));
      return;
    } catch (err) {
      log.error({ err, sessionId }, "[VoiceResponder] Shopping agent error (falling through to LLM)");
      // Fall through to general LLM path on error
    }
  }

  // 3. Build Groq messages with persisted history
  const history = await ConversationStateRepo.getTurnsForLLM(sessionId);
  // Phase 2.2 — pick up the latest MSWIM tier so the system prompt scales.
  // Phase 2.3 — also extract `frictionsFound` from the same evaluation so
  // we can opportunistically run a curated sales playbook (≤80-char voice
  // chunks emitted with richer `sales_dialog` for the chat bubble).
  let tier: MswimTier | null = null;
  let playbookStep: PlaybookStep | null = null;
  let playbookFrictionId: string | null = null;
  // Codex Phase 2.3 P1: if the real evaluation reports a friction we don't
  // have a playbook for, we still want to preserve THAT code in the
  // intervention metadata — not silently rewrite it to F036.
  let primaryFrictionId: string | null = null;
  try {
    const latest = await EvaluationRepo.getLatestNonVoiceEvaluation(sessionId);
    tier = asMswimTier(latest?.tier);
    if (latest?.frictionsFound) {
      let frictions: string[] = [];
      try { frictions = JSON.parse(latest.frictionsFound) as string[]; }
      catch { /* malformed JSON → no playbook */ }
      // Remember the first real friction code so it survives even when no
      // playbook is registered.
      if (frictions.length > 0 && typeof frictions[0] === "string" && frictions[0].length > 0) {
        primaryFrictionId = frictions[0];
      }
      const pb = pickPlaybookForFrictions(frictions);
      if (pb) {
        // Step selection uses the persisted turn count from ConversationState
        // so the same step doesn't repeat across reloads.
        let turnCount = 0;
        try {
          const state = await ConversationStateRepo.getBySession(sessionId);
          turnCount = state ? Math.floor(state.turnCount / 2) : 0;
        } catch { /* non-fatal */ }
        playbookStep = selectStep(pb, turnCount);
        playbookFrictionId = pb.frictionId;
      }
    }
  } catch (err) {
    log.warn({ err, sessionId }, "[VoiceResponder] tier/playbook lookup failed; defaulting to PASSIVE");
  }
  const systemPrompt = buildSystemPrompt(pageCtx, tier);

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
    }, { signal: AbortSignal.timeout(15000) });

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
    log.error({ err, sessionId }, "[VoiceResponder] Groq error");
    // Fall through with the default answer — don't reject the user
  }

  // 5. Persist this turn to conversation state (DB-backed; survives reload).
  try {
    await ConversationStateRepo.appendTurnPair(
      sessionId,
      siteUrl,
      { content: transcript },
      { content: answer },
      { maxPairs: MAX_TURNS },
    );
  } catch (err) {
    log.warn({ err, sessionId }, "[VoiceResponder] persist turn failed (non-blocking)");
  }

  // 6. Persist a minimal evaluation + intervention so outcomes can be recorded.
  //    `narrative` deliberately omits the raw transcript: CLAUDE.md hard rule
  //    "Never log raw transcript fields" and Codex Phase 2.0 gate criterion.
  // Phase 2.3 — when a sales playbook matches the active friction, override
  // the spoken chunk with the curated voice_script and emit a richer
  // `sales_dialog` field for the chat bubble. Per Codex: voice_script stays
  // ≤80 chars (asserted at module load), sales_dialog can be richer.
  const finalVoiceScript = playbookStep?.voice_script ?? voiceScript;
  // Codex Phase 2.3 P1: preserve the real friction code over the wire even
  // when no playbook is registered. Only fall back to F036 as a LAST resort
  // for fully synthetic voice queries with no prior evaluation context.
  const finalFrictionId = playbookFrictionId ?? primaryFrictionId ?? "F036";
  const payload = {
    type: "active" as const,
    action_code: "VOICE_REPLY",
    friction_id: finalFrictionId,
    message: answer,
    voice_enabled: voicePlayback,
    voice_script: voicePlayback ? finalVoiceScript : undefined,
    // Optional richer message for the chat bubble. Widget falls back to
    // `message` when this is absent.
    ...(playbookStep ? {
      sales_dialog: playbookStep.sales_dialog,
      playbook_objective: playbookStep.objective,
    } : {}),
  };

  let interventionId = `vq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const evaluation = await EvaluationRepo.createEvaluation({
      sessionId,
      eventBatchIds: "[]",
      narrative: `Voice query ${redact(transcript)}`,
      frictionsFound: JSON.stringify([finalFrictionId]),
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
      frictionId: finalFrictionId,
      payload: JSON.stringify(payload),
      mswimScoreAtFire: 58,
      tierAtFire: "NUDGE",
    });

    interventionId = intervention.id;

    // Increment voice counter fire-and-forget
    SessionRepo.incrementVoiceInterventionsFired(sessionId).catch(() => {});
  } catch (err) {
    log.error({ err, sessionId }, "[VoiceResponder] DB persist error (non-blocking)");
    // Fall through — still broadcast with the synthetic ID
  }

  const broadcastPayload = { ...payload, intervention_id: interventionId };

  // 7. Broadcast "active" intervention to the widget for this session
  broadcastToSession("widget", sessionId, {
    type: "intervention",
    sessionId,
    payload: broadcastPayload,
  });

  // Phase 2.4 — when streaming TTS is enabled AND voice playback is active,
  // open a Deepgram WebSocket and forward audio chunks for sub-1s first
  // audio. Fire-and-forget — the legacy `voice_script` field in the payload
  // is the fallback the widget plays via REST when streaming is disabled,
  // returns disabled/error/timeout, or hasn't been wired into the widget
  // player yet. Codex Phase 2.4 P1: this wiring is what makes the flag
  // actually change behavior.
  if (voicePlayback && getStreamingTtsConfig().enabled) {
    void streamTtsToSession({
      sessionId,
      interventionId,
      text: finalVoiceScript,
    }).then((stats) => {
      log.info(
        {
          sessionId,
          interventionId,
          firstChunkMs: stats.firstChunkMs,
          totalMs: stats.totalMs,
          chunkCount: stats.chunkCount,
          outcome: stats.outcome,
        },
        "[VoiceResponder] streaming TTS finished",
      );
    });
  }

  // Telemetry only — no transcript content. Per CLAUDE.md hard rule.
  let turnCount = 0;
  try {
    const state = await ConversationStateRepo.getBySession(sessionId);
    turnCount = state ? Math.floor(state.turnCount / 2) : 0;
  } catch { /* non-fatal */ }
  log.info(
    { sessionId, turn: turnCount, answer: redact(answer), voicePlayback },
    "[VoiceResponder] reply emitted",
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
