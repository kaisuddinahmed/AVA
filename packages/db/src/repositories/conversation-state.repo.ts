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
