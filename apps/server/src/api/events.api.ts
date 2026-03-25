import type { Request, Response } from "express";
import { EventRepo } from "@ava/db";
import { EventsQuerySchema } from "../validation/schemas.js";
import { logger } from "../logger.js";

const log = logger.child({ service: "api" });

export async function getEvents(req: Request, res: Response) {
  try {
    const parsed = EventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.issues,
      });
      return;
    }

    const sessionId = String(req.params.sessionId);
    const { limit, since } = parsed.data;

    const events = await EventRepo.getEventsBySession(sessionId, {
      limit,
      since: since ? new Date(since) : undefined,
    });
    res.json({ events });
  } catch (error) {
    log.error("[API] Get events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
