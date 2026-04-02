import { broadcastToChannel } from "../broadcast/broadcast.service.js";
export function broadcastOnboardingProgress(event) {
    const payload = {
        type: "onboarding_progress",
        payload: {
            siteConfigId: event.siteConfigId,
            analyzerRunId: event.analyzerRunId,
            status: event.status,
            progress: event.progress,
            details: event.details,
            timestamp: new Date().toISOString(),
        },
    };
    broadcastToChannel("dashboard", payload);
    broadcastToChannel("demo", payload);
}
//# sourceMappingURL=progress-broadcaster.js.map