import { SessionRepo } from "@ava/db";
import { v4 as uuid } from "uuid";
import { logger } from "../logger.js";

const log = logger.child({ service: "track" });

// In-memory session cache
const sessionCache = new Map<string, { sessionId: string; lastActivity: number }>();

export interface SessionInitData {
  siteUrl: string;
  deviceType: string;
  referrerType: string;
  visitorId?: string;
  isLoggedIn?: boolean;
  isRepeatVisitor?: boolean;
}

/**
 * Get or create a session for a visitor.
 */
export async function getOrCreateSession(
  visitorKey: string,
  data: SessionInitData
): Promise<string> {
  // Check cache first
  const cached = sessionCache.get(visitorKey);
  if (cached && Date.now() - cached.lastActivity < 30 * 60 * 1000) {
    try {
      // Update last activity — throws P2025 if the session was deleted from DB
      // (e.g. after db:setup / db:seed while the server stayed running).
      cached.lastActivity = Date.now();
      await SessionRepo.touchSession(cached.sessionId);
      return cached.sessionId;
    } catch {
      // Session no longer in DB — evict the stale entry and fall through to
      // create a fresh session below.
      sessionCache.delete(visitorKey);
    }
  }

  // Create new session
  const session = await SessionRepo.createSession({
    visitorId: data.visitorId,
    siteUrl: data.siteUrl,
    deviceType: data.deviceType,
    referrerType: data.referrerType,
    isLoggedIn: data.isLoggedIn,
    isRepeatVisitor: data.isRepeatVisitor,
  });

  sessionCache.set(visitorKey, {
    sessionId: session.id,
    lastActivity: Date.now(),
  });

  return session.id;
}

/**
 * Update session cart data.
 */
export async function updateSessionCart(
  sessionId: string,
  cartValue: number,
  cartItemCount: number
) {
  await SessionRepo.updateSession(sessionId, { cartValue, cartItemCount });
}

/**
 * End a session explicitly.
 */
export async function endSession(sessionId: string) {
  sessionCache.forEach((value, key) => {
    if (value.sessionId === sessionId) sessionCache.delete(key);
  });
  await SessionRepo.endSession(sessionId);
}

/**
 * Clean up idle sessions (called periodically).
 */
export function cleanupIdleSessions() {
  const now = Date.now();
  const threshold = 30 * 60 * 1000; // 30 minutes

  for (const [key, entry] of sessionCache) {
    if (now - entry.lastActivity > threshold) {
      SessionRepo.endSession(entry.sessionId).catch(log.error);
      sessionCache.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupIdleSessions, 5 * 60 * 1000);
