import type { FISMBridge } from "../tracker/ws-transport.js";
import type { InterventionPayload } from "../config.js";
import { InterventionHandler } from "./intervention-handler.js";

/**
 * Agent Controller — Central coordinator for the AVA widget agent.
 * Receives intervention commands from server, routes to appropriate handlers,
 * manages intervention queue, and enforces client-side rate limits.
 */
export class AgentController {
  private bridge: FISMBridge;
  private interventionHandler: InterventionHandler;
  private interventionQueue: InterventionPayload[] = [];
  private isProcessing = false;
  private cooldownUntil = 0;

  // Client-side rate limiting
  private interventionCount = 0;
  private readonly MAX_INTERVENTIONS_PER_SESSION = 10;
  private readonly COOLDOWN_MS = 5000; // 5 seconds between interventions

  // Callbacks wired by index.ts
  onIntervention: (payload: InterventionPayload) => void = () => {};

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
    this.interventionHandler = new InterventionHandler(bridge);
    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for intervention commands from server
    this.bridge.on("intervention", (payload: InterventionPayload) => {
      this.enqueueIntervention(payload);
    });

    // Listen for typing indicator
    this.bridge.on("typing", () => {
      // Typing state can be handled by the widget
    });

    // Listen for session updates
    this.bridge.on("session_update", (data: any) => {
      // Update session state if needed
      if (data.suppressNonPassive) {
        this.interventionQueue = this.interventionQueue.filter(
          (i) => i.type === "passive",
        );
      }
    });
  }

  private enqueueIntervention(payload: InterventionPayload): void {
    // Always process passive interventions immediately
    if (payload.type === "passive") {
      this.interventionHandler.handlePassive(payload);
      this.acknowledgeIntervention(payload, "delivered");
      return;
    }

    // Client-side rate limit check
    if (this.interventionCount >= this.MAX_INTERVENTIONS_PER_SESSION) {
      this.acknowledgeIntervention(payload, "ignored");
      return;
    }

    // Cooldown check
    if (Date.now() < this.cooldownUntil && payload.type !== "escalate") {
      // Queue it
      this.interventionQueue.push(payload);
      this.scheduleProcessQueue();
      return;
    }

    // Process immediately if not busy
    if (!this.isProcessing) {
      this.processIntervention(payload);
    } else {
      this.interventionQueue.push(payload);
    }
  }

  private processIntervention(payload: InterventionPayload): void {
    this.isProcessing = true;
    this.interventionCount++;

    // Set cooldown
    const cooldownMap: Record<string, number> = {
      nudge: 3000,
      active: 5000,
      escalate: 0,
    };
    this.cooldownUntil = Date.now() + (cooldownMap[payload.type] || this.COOLDOWN_MS);

    // Acknowledge delivery
    this.acknowledgeIntervention(payload, "delivered");

    // Forward to widget
    this.onIntervention(payload);

    // Allow next intervention after a short delay
    setTimeout(() => {
      this.isProcessing = false;
      this.processNextInQueue();
    }, 1000);
  }

  private processNextInQueue(): void {
    if (this.interventionQueue.length === 0) return;

    // Escalate has highest priority
    const escalateIdx = this.interventionQueue.findIndex((i) => i.type === "escalate");
    if (escalateIdx >= 0) {
      const [intervention] = this.interventionQueue.splice(escalateIdx, 1);
      this.processIntervention(intervention);
      return;
    }

    // Active next, then nudge
    const activeIdx = this.interventionQueue.findIndex((i) => i.type === "active");
    if (activeIdx >= 0) {
      const [intervention] = this.interventionQueue.splice(activeIdx, 1);
      this.processIntervention(intervention);
      return;
    }

    // Process in order
    const intervention = this.interventionQueue.shift();
    if (intervention) {
      this.processIntervention(intervention);
    }
  }

  private scheduleProcessQueue(): void {
    const delay = Math.max(0, this.cooldownUntil - Date.now());
    setTimeout(() => {
      if (!this.isProcessing) {
        this.processNextInQueue();
      }
    }, delay);
  }

  private acknowledgeIntervention(payload: InterventionPayload, status: string): void {
    this.bridge.sendOutcome(payload.intervention_id, status);
  }

  /** Called by widget when user dismisses an intervention */
  handleDismiss(interventionId: string): void {
    this.bridge.sendOutcome(interventionId, "dismissed");
  }

  /** Called by widget when user converts from an intervention */
  handleConvert(interventionId: string, action: string): void {
    this.bridge.sendOutcome(interventionId, "converted", action);
  }

  destroy(): void {
    this.interventionQueue = [];
  }
}
