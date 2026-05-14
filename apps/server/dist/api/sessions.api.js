import { SessionRepo } from "@ava/db";
import { emitSessionExitWebhook } from "../webhooks/webhook.service.js";
import { logger } from "../logger.js";
const log = logger.child({ service: "api" });
export async function listSessions(req, res) {
    try {
        const siteUrl = req.query.siteUrl;
        const sinceParam = req.query.since;
        // If a "since" timestamp is provided, only return sessions started after it
        if (sinceParam) {
            const sinceDate = new Date(sinceParam);
            const sessions = await SessionRepo.listSessionsSince(sinceDate, { siteUrl });
            res.json({ sessions });
            return;
        }
        const sessions = siteUrl
            ? await SessionRepo.listActiveSessions(siteUrl)
            : await SessionRepo.getRecentSessions(20);
        res.json({ sessions });
    }
    catch (error) {
        log.error({ err: error }, "[API] List sessions error");
        res.status(500).json({ error: "Internal server error" });
    }
}
export async function getSession(req, res) {
    try {
        const session = await SessionRepo.getSessionFull(String(req.params.id));
        if (!session) {
            res.status(404).json({ error: "Session not found" });
            return;
        }
        res.json({ session });
    }
    catch (error) {
        log.error({ err: error }, "[API] Get session error");
        res.status(500).json({ error: "Internal server error" });
    }
}
export async function endSession(req, res) {
    try {
        const sessionId = String(req.params.id);
        await SessionRepo.endSession(sessionId);
        // Fire-and-forget session exit webhook (only fires if site has webhookUrl + no conversion)
        emitSessionExitWebhook(sessionId).catch(() => { });
        res.json({ ok: true });
    }
    catch (error) {
        log.error({ err: error }, "[API] End session error");
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=sessions.api.js.map