// ============================================================================
// ConversationState Repository — multi-turn shopping-agent state per session
// Phase 2 — Exceptional Voice.
//
// PRIVACY: rows may contain user utterances. Do not export raw turns into
// analytics or logs. Purge when the Session ends.
// ============================================================================

import { prisma } from "../client.js";

export type UpsertConversationInput = {
  sessionId: string;
  siteUrl: string;
  turns?: string;           // JSON: { role, content, timestamp }[]
  turnCount?: number;
  productContext?: string | null;
  comparisonSet?: string | null;
  objections?: string | null;
  constraints?: string | null;
  lastIntent?: string | null;
};

/** Get the conversation state for a session (returns null if none exists). */
export async function getBySession(sessionId: string) {
  return prisma.conversationState.findUnique({ where: { sessionId } });
}

/** Upsert the state — creates on first turn, updates subsequently. */
export async function upsert(data: UpsertConversationInput) {
  const { sessionId, ...rest } = data;
  return prisma.conversationState.upsert({
    where: { sessionId },
    update: { ...rest, lastActivityAt: new Date() },
    create: { sessionId, ...rest, turns: rest.turns ?? "[]" },
  });
}

/** Append a single turn (caller serializes the turn object into JSON). */
export async function appendTurn(sessionId: string, serializedTurn: string) {
  const current = await getBySession(sessionId);
  const turns = current ? JSON.parse(current.turns) : [];
  turns.push(JSON.parse(serializedTurn));
  return prisma.conversationState.update({
    where: { sessionId },
    data: {
      turns: JSON.stringify(turns),
      turnCount: turns.length,
      lastActivityAt: new Date(),
    },
  });
}

/**
 * Append a user turn followed by an assistant turn in a single DB transaction,
 * applying a ring-buffer cap so memory growth is bounded. Used by the voice
 * responder and shopping agent (Phase 2.1) which always advance the
 * conversation in pairs.
 *
 * Concurrency: wrapped in `prisma.$transaction` (interactive) so the
 * read-modify-write is atomic. Two voice turns racing for the same session
 * still serialize to a coherent final state. Codex Phase 2.1 review (P1).
 *
 * `maxPairs * 2` is the maximum number of turns retained — oldest pairs are
 * evicted FIFO when the cap is hit.
 */
export async function appendTurnPair(
  sessionId: string,
  siteUrl: string,
  user: { content: string; products?: unknown[] | null },
  assistant: { content: string; products?: unknown[] | null },
  opts: { maxPairs?: number } = {},
) {
  const maxPairs = opts.maxPairs ?? 10;
  const now = Date.now();
  const userTurn = {
    role: "user" as const,
    content: user.content,
    timestamp: now,
    ...(user.products ? { products: user.products } : {}),
  };
  const asstTurn = {
    role: "assistant" as const,
    content: assistant.content,
    timestamp: now + 1,
    ...(assistant.products ? { products: assistant.products } : {}),
  };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.conversationState.findUnique({ where: { sessionId } });
    const prior = existing ? (JSON.parse(existing.turns) as unknown[]) : [];
    const all = [...prior, userTurn, asstTurn];
    const trimmed = all.length > maxPairs * 2 ? all.slice(all.length - maxPairs * 2) : all;
    const turnsJson = JSON.stringify(trimmed);

    if (existing) {
      return tx.conversationState.update({
        where: { sessionId },
        data: {
          turns: turnsJson,
          turnCount: trimmed.length,
          lastActivityAt: new Date(),
        },
      });
    }
    return tx.conversationState.create({
      data: {
        sessionId,
        siteUrl,
        turns: turnsJson,
        turnCount: trimmed.length,
      },
    });
  });
}

/**
 * Return the (role, content) pairs for a session as a flat array suitable
 * for passing into Groq's chat-completions API as conversation context.
 * Returns [] when there's no prior conversation (first turn).
 */
export async function getTurnsForLLM(sessionId: string): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const row = await prisma.conversationState.findUnique({
    where: { sessionId },
    select: { turns: true },
  });
  if (!row) return [];
  try {
    const turns = JSON.parse(row.turns) as Array<{ role: string; content: string }>;
    return turns
      .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .map((t) => ({ role: t.role as "user" | "assistant", content: t.content }));
  } catch {
    return [];
  }
}

/** Update objections / constraints / intent in one call. */
export async function patchContext(sessionId: string, patch: {
  productContext?: string | null;
  comparisonSet?: string | null;
  objections?: string | null;
  constraints?: string | null;
  lastIntent?: string | null;
}) {
  return prisma.conversationState.update({
    where: { sessionId },
    data: { ...patch, lastActivityAt: new Date() },
  });
}

/** Purge state when a session ends (PII-bounded retention). */
export async function purgeBySession(sessionId: string) {
  return prisma.conversationState.deleteMany({ where: { sessionId } });
}

/** Sweep idle conversations older than `olderThan` (background job). */
export async function purgeIdleSince(olderThan: Date) {
  return prisma.conversationState.deleteMany({
    where: { lastActivityAt: { lt: olderThan } },
  });
}
