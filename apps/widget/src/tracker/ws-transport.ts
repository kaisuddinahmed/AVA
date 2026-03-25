type BridgeEventListener = (data: any) => void;

export class FISMBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private listeners: Map<string, Set<BridgeEventListener>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: any[] = [];

  constructor(url: string, sessionId: string) {
    this.url = url;
    this.sessionId = sessionId;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(`${this.url}?channel=widget&sessionId=${this.sessionId}`);

      this.ws.onopen = () => {
        console.log("[AVA] Connected to server");
        this.reconnectAttempts = 0;
        // Flush queued messages
        this.messageQueue.forEach((msg) => this.ws?.send(JSON.stringify(msg)));
        this.messageQueue = [];
        this.emit("connected", {});
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Prefer data.payload (intervention, track_ack) but fall back to the
          // full message so that ack/error messages (no payload field) still
          // carry their status/intervention_id fields to subscribers.
          this.emit(data.type, data.payload ?? data);
        } catch (e) {
          console.error("[AVA] Failed to parse message:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("[AVA] Disconnected");
        this.emit("disconnected", {});
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("[AVA] WebSocket error:", error);
      };
    } catch (e) {
      console.error("[AVA] Connection failed:", e);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    console.log(`[AVA] Reconnecting in ${this.reconnectDelay * this.reconnectAttempts}ms...`);
    setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
  }

  send(type: string, payload: any): void {
    const msg = { type, payload, session_id: this.sessionId, timestamp: Date.now() };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  /**
   * Send a behavioral event formatted for the server's "track" Zod schema.
   * Server expects: { type: "track", event: {...}, visitorKey, siteUrl, ... }
   */
  sendTrackEvent(event: Record<string, any>): void {
    const w = typeof window !== "undefined" ? window : undefined;
    const msg = {
      type: "track",
      visitorKey: this.sessionId,
      sessionKey: this.sessionId,
      siteUrl: w?.location?.origin ?? "",
      deviceType: !w ? "desktop" : w.innerWidth < 768 ? "mobile" : w.innerWidth < 1024 ? "tablet" : "desktop",
      referrerType: "direct",
      isLoggedIn: false,
      isRepeatVisitor: false,
      event,
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  on(event: string, callback: BridgeEventListener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  /**
   * Send an intervention outcome in the flat format the server expects.
   * Server schema: { type: "intervention_outcome", intervention_id, session_id, status, timestamp, conversion_action? }
   */
  sendOutcome(interventionId: string, status: string, conversionAction?: string): void {
    const msg: Record<string, unknown> = {
      type: "intervention_outcome",
      intervention_id: interventionId,
      session_id: this.sessionId,
      status,
      timestamp: Date.now(),
    };
    if (conversionAction) msg.conversion_action = conversionAction;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  /**
   * Send intervention feedback (thumbs up/down) to the server.
   * Server schema: { type: "intervention_feedback", intervention_id, session_id, feedback, timestamp }
   */
  sendFeedback(interventionId: string, feedback: "helpful" | "not_helpful"): void {
    const msg = {
      type: "intervention_feedback",
      intervention_id: interventionId,
      session_id: this.sessionId,
      feedback,
      timestamp: Date.now(),
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  /**
   * Send a voice query (transcript from ASR or text input) to the server.
   * Includes optional page context so the server can give more relevant replies.
   * Server schema: { type: "voice_query", session_id, transcript, timestamp, page_context? }
   */
  sendVoiceQuery(transcript: string, pageContext?: { page_type?: string; page_url?: string }): void {
    const w = typeof window !== "undefined" ? window : undefined;
    const msg: Record<string, unknown> = {
      type: "voice_query",
      session_id: this.sessionId,
      transcript,
      timestamp: Date.now(),
      page_context: {
        page_url: pageContext?.page_url ?? w?.location?.href,
        ...(pageContext?.page_type ? { page_type: pageContext.page_type } : {}),
      },
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.listeners.clear();
  }
}
