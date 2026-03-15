import type { Request, Response } from "express";
import { SessionRepo } from "@ava/db";
import { prisma } from "@ava/db";
import { emitSessionExitWebhook } from "../webhooks/webhook.service.js";

export async function listSessions(req: Request, res: Response) {
  try {
    const siteUrl = req.query.siteUrl as string | undefined;
    const sinceParam = req.query.since as string | undefined;

    // If a "since" timestamp is provided, only return sessions started after it
    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      const sessions = await prisma.session.findMany({
        where: {
          startedAt: { gte: sinceDate },
          ...(siteUrl ? { siteUrl } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: 50,
      });
      res.json({ sessions });
      return;
    }

    const sessions = siteUrl
      ? await SessionRepo.listActiveSessions(siteUrl)
      : await SessionRepo.getRecentSessions(20);
    res.json({ sessions });
  } catch (error) {
    console.error("[API] List sessions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getSession(req: Request, res: Response) {
  try {
    const session = await SessionRepo.getSessionFull(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ session });
  } catch (error) {
    console.error("[API] Get session error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function endSession(req: Request, res: Response) {
  try {
    const sessionId = String(req.params.id);
    await SessionRepo.endSession(sessionId);
    // Fire-and-forget session exit webhook (only fires if site has webhookUrl + no conversion)
    emitSessionExitWebhook(sessionId).catch(() => {});
    res.json({ ok: true });
  } catch (error) {
    console.error("[API] End session error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
