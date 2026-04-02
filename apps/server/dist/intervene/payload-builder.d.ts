import type { EvaluationResult } from "../evaluate/evaluate.service.js";
import { type SessionContext } from "./message-templates.js";
interface SessionEvent {
    eventType?: string;
    type?: string;
    frictionId?: string | null;
    signals?: Record<string, unknown>;
}
/**
 * Build the intervention payload to send to the widget.
 * sessionEvents is optional — if provided, ACTIVE and ESCALATE payloads
 * will include real product suggestions derived from browsing history.
 * voiceDisabled should be true when the session voice budget is exhausted
 * or the user has muted voice interventions.
 */
export declare function buildPayload(type: string, actionCode: string, frictionId: string, evaluation: EvaluationResult, sessionEvents?: SessionEvent[], voiceDisabled?: boolean, sessionCtx?: SessionContext): Promise<Record<string, unknown>>;
export {};
//# sourceMappingURL=payload-builder.d.ts.map