import { type SessionInitData } from "./session-manager.js";
/**
 * Process an incoming track event from the widget.
 */
export declare function processTrackEvent(visitorKey: string, sessionData: SessionInitData, rawEvent: Record<string, unknown>): Promise<{
    sessionId: string;
    eventId: any;
}>;
//# sourceMappingURL=track.service.d.ts.map