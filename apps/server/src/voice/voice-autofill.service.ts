// ============================================================================
// Voice autofill — Phase 2.8.
//
// Extract structured address / variant fields from a voice transcript and
// (a) persist the address via VisitorAddressRepo for future sessions, then
// (b) broadcast an autofill payload to the widget so it can populate form
// fields or select variant swatches.
//
// Two LLM-extractors, both following the Phase 1.5.2 safety pattern:
//   - zod-validated output → null on any deviation
//   - mockable Groq client (`LlmClient` interface) so tests run offline
//   - feature-flagged: VOICE_AUTOFILL_ENABLED=true to turn on
//
// Trigger heuristic: cheap keyword pre-filter before invoking the LLM, so
// most non-autofill voice turns skip the Groq call entirely. Examples:
//   address triggers: /ship to|shipping address|deliver to|my address is/i
//   variant triggers: /size|medium|large|colou?r|in (red|blue|black|white)/i
//
// Privacy: address content is persisted (per Story 3 design — opt-in
// autofill) but never logged. Variant selections are non-PII.
// ============================================================================

import { z } from "zod";
import { VisitorAddressRepo } from "@ava/db";
import { broadcastToSession } from "../broadcast/broadcast.service.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "voice-autofill" });

/**
 * Strip an error down to a sanitized shape — kind + name only. Codex Phase
 * 2.8 P1: Prisma errors (and mocked repo errors) can echo input values in
 * their `.message`. We MUST NOT pass the raw error object to the logger.
 */
function safeErrShape(err: unknown): { kind: string; name?: string } {
  if (err instanceof Error) return { kind: "error", name: err.name };
  if (err && typeof err === "object") return { kind: "object" };
  return { kind: typeof err };
}

// ---------------------------------------------------------------------------
// Config + injectable LLM client
// ---------------------------------------------------------------------------

export interface VoiceAutofillConfig {
  enabled: boolean;
  model: string;
}

export function getVoiceAutofillConfig(): VoiceAutofillConfig {
  return {
    enabled: process.env.VOICE_AUTOFILL_ENABLED === "true",
    model: process.env.VOICE_AUTOFILL_MODEL ?? "llama-3.3-70b-versatile",
  };
}

export interface LlmClient {
  chat: {
    completions: {
      create: (args: {
        model: string;
        messages: Array<{ role: "system" | "user"; content: string }>;
        response_format?: { type: "json_object" };
        temperature?: number;
      }) => Promise<{
        choices: Array<{ message: { content: string | null } }>;
      }>;
    };
  };
}

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

const ADDRESS_SCHEMA = z.object({
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(50),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2).optional().nullable(),
});
export type ExtractedAddress = z.infer<typeof ADDRESS_SCHEMA>;

const VARIANT_SCHEMA = z.object({
  // Open-ended option dictionary — e.g. { size: "M", color: "blue" }.
  // Keys are lowercase option names; values are the chosen option string.
  options: z.record(z.string().min(1).max(50)).refine(
    (o) => Object.keys(o).length > 0,
    { message: "options must be non-empty" },
  ),
});
export type ExtractedVariant = z.infer<typeof VARIANT_SCHEMA>;

const NO_MATCH_SCHEMA = z.object({ _no_match: z.literal(true) });

// ---------------------------------------------------------------------------
// Trigger heuristics — cheap pre-filter to avoid LLM calls.
// ---------------------------------------------------------------------------

const ADDRESS_RE = /\b(ship to|shipping address|deliver to|my address is|shipping it to|send it to|address is)\b/i;
const VARIANT_RE = /\b(size\s+|in\s+(red|blue|black|white|green|navy|pink|gray|grey)|small|medium|large|extra(-|\s)?large|xs\b|xl\b|colou?r)\b/i;

export function looksLikeAddress(transcript: string): boolean {
  return ADDRESS_RE.test(transcript);
}

export function looksLikeVariant(transcript: string): boolean {
  return VARIANT_RE.test(transcript);
}

// ---------------------------------------------------------------------------
// Address extractor
// ---------------------------------------------------------------------------

const ADDRESS_PROMPT = `Extract a shipping address from the user's spoken request.

Return ONLY a JSON object with EXACTLY these fields:
- "addressLine1" (string, required)
- "addressLine2" (string or null, e.g. apt/suite)
- "city" (string, required)
- "state" (string, required — full name or 2-letter code)
- "postalCode" (string, required — keep zero-prefix intact)
- "country" (2-letter ISO code or null; default null if not stated)

If the request does NOT contain a complete shipping address, return EXACTLY:
{"_no_match": true}

Rules:
- Do not invent fields. If a field is missing, return {"_no_match": true} —
  partial addresses are unsafe to autofill.
- Output must be a single valid JSON object with no markdown or commentary.`;

export async function extractAddress(
  transcript: string,
  opts: { llmClient?: LlmClient; config?: Partial<VoiceAutofillConfig> } = {},
): Promise<ExtractedAddress | null> {
  const cfg = { ...getVoiceAutofillConfig(), ...opts.config };
  if (!cfg.enabled) return null;
  if (!looksLikeAddress(transcript)) return null;

  const client = opts.llmClient;
  if (!client) {
    log.warn("[VoiceAutofill] no LLM client wired — skipping address extraction");
    return null;
  }

  let raw: string;
  try {
    const completion = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "system", content: ADDRESS_PROMPT },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    log.warn({ errShape: safeErrShape(err) }, "[VoiceAutofill] Groq address call failed");
    return null;
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return null; }

  if (NO_MATCH_SCHEMA.safeParse(parsed).success) return null;
  const validated = ADDRESS_SCHEMA.safeParse(parsed);
  if (!validated.success) {
    log.warn({ issues: validated.error.issues.slice(0, 3) }, "[VoiceAutofill] address schema fail");
    return null;
  }
  return validated.data;
}

// ---------------------------------------------------------------------------
// Variant extractor
// ---------------------------------------------------------------------------

const VARIANT_PROMPT = `Extract the variant selection the user is describing.

Return ONLY a JSON object with EXACTLY this shape:
- "options" (object — keys are lowercase option names like "size" or
  "color", values are the chosen option string like "M" or "blue").

If the user does NOT make a clear variant selection, return EXACTLY:
{"_no_match": true}

Rules:
- Normalise sizes: "small"→"S", "medium"→"M", "large"→"L", "extra large"→"XL".
- Use the field names "size" and "color" (American spelling) when applicable.
- Do not invent options the user didn't mention.
- Output must be a single valid JSON object with no markdown.`;

export async function extractVariant(
  transcript: string,
  opts: { llmClient?: LlmClient; config?: Partial<VoiceAutofillConfig> } = {},
): Promise<ExtractedVariant | null> {
  const cfg = { ...getVoiceAutofillConfig(), ...opts.config };
  if (!cfg.enabled) return null;
  if (!looksLikeVariant(transcript)) return null;

  const client = opts.llmClient;
  if (!client) {
    log.warn("[VoiceAutofill] no LLM client wired — skipping variant extraction");
    return null;
  }

  let raw: string;
  try {
    const completion = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "system", content: VARIANT_PROMPT },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    log.warn({ errShape: safeErrShape(err) }, "[VoiceAutofill] Groq variant call failed");
    return null;
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return null; }

  if (NO_MATCH_SCHEMA.safeParse(parsed).success) return null;
  const validated = VARIANT_SCHEMA.safeParse(parsed);
  if (!validated.success) return null;
  return validated.data;
}

// ---------------------------------------------------------------------------
// Orchestrator — persist + broadcast
// ---------------------------------------------------------------------------

export interface AutofillContext {
  sessionId: string;
  siteUrl: string;
  visitorKey: string;
}

export interface AutofillResult {
  addressApplied: boolean;
  variantApplied: boolean;
}

/**
 * Run both extractors against the transcript and apply any matches:
 *   - Address → persist via VisitorAddressRepo + broadcast `address_autofill`.
 *   - Variant → broadcast `variant_select` (no persistence; selection state
 *     is page-local).
 *
 * Returns flags so the voice responder can mention the autofill in its
 * reply ("got it, shipping to 123 Main St").
 */
export async function runVoiceAutofill(
  transcript: string,
  ctx: AutofillContext,
  llmClient?: LlmClient,
): Promise<AutofillResult> {
  const cfg = getVoiceAutofillConfig();
  if (!cfg.enabled) return { addressApplied: false, variantApplied: false };

  const [address, variant] = await Promise.all([
    extractAddress(transcript, { llmClient }),
    extractVariant(transcript, { llmClient }),
  ]);

  let addressApplied = false;
  let variantApplied = false;

  if (address) {
    try {
      await VisitorAddressRepo.upsertAddress({
        visitorKey: ctx.visitorKey,
        siteUrl: ctx.siteUrl,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 ?? undefined,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country ?? undefined,
      });
      broadcastToSession("widget", ctx.sessionId, {
        type: "address_autofill",
        address,
      });
      addressApplied = true;
      // Telemetry only — log shape, NEVER address content. The address
      // legitimately includes user PII (per Story 3 opt-in design).
      log.info(
        {
          sessionId: ctx.sessionId,
          hasLine2: Boolean(address.addressLine2),
          country: address.country ?? "US",
        },
        "[VoiceAutofill] address applied",
      );
    } catch (err) {
      // Codex P1: NEVER log the raw error — Prisma echoes input values.
      log.error(
        { sessionId: ctx.sessionId, errShape: safeErrShape(err) },
        "[VoiceAutofill] address persist failed",
      );
    }
  }

  if (variant) {
    try {
      broadcastToSession("widget", ctx.sessionId, {
        type: "variant_select",
        options: variant.options,
      });
      variantApplied = true;
      log.info(
        { sessionId: ctx.sessionId, optionKeys: Object.keys(variant.options) },
        "[VoiceAutofill] variant applied",
      );
    } catch (err) {
      log.error(
        { sessionId: ctx.sessionId, errShape: safeErrShape(err) },
        "[VoiceAutofill] variant broadcast failed",
      );
    }
  }

  return { addressApplied, variantApplied };
}
