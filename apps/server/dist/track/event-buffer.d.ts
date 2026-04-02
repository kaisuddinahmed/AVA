type BatchCallback = (sessionId: string, eventIds: string[]) => void;
/**
 * Event buffer that batches events per session.
 * Flushes every 5 seconds or when 10 events accumulate.
 */
export declare class EventBuffer {
    private buffers;
    private onFlush;
    constructor(onFlush: BatchCallback);
    /**
     * Add an event to the buffer for a session.
     */
    add(sessionId: string, eventId: string): void;
    /**
     * Flush buffered events for a session.
     */
    flush(sessionId: string): void;
    /**
     * Flush all sessions (e.g., on shutdown).
     */
    flushAll(): void;
}
export {};
//# sourceMappingURL=event-buffer.d.ts.map