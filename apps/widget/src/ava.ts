import type {
  WidgetConfig,
  InterventionPayload,
  WidgetMessage,
  WidgetState,
  MicroOutcome,
} from "./config.js";
import { injectGlobalStyles } from "./ui/styles/global-styles.js";
import { PassiveExecutor } from "./tracker/passive-executor.js";
import { VoiceManager } from "./voice/voice-manager.js";
import { SpeechRecognizer } from "./voice/speech-recognizer.js";
import { renderMicButton, type MicButtonHandle } from "./ui/components/mic-button.js";
import { renderNudgeBubble } from "./ui/components/nudge-bubble.js";
import { renderProductCard } from "./ui/components/product-card.js";
import { renderComparisonCard } from "./ui/components/comparison-card.js";
import {
  renderPanel,
  renderLeadCard,
  renderLeadSkeleton,
  renderEmptyState,
} from "./ui/components/panel.js";
import {
  renderToggleButton,
  updateToggleButton,
} from "./ui/components/toggle-button.js";

/**
 * Derive a short contextual label for the toggle button's signal-mode strip.
 * Friction-specific when available, generic fallback otherwise.
 */
function deriveLabelText(payload: InterventionPayload): string {
  const FRICTION_LABELS: Record<string, string> = {
    F015: "Tip while you browse \u2192",
    F023: "Something not working? \u2192",
    F058: "Help deciding? \u2192",
    F060: "Found a better price? \u2192",
    F068: "Before you go \u2192",
    F069: "Still there? \u2192",
    F091: "Form help \u2192",
    F094: "Payment question? \u2192",
    F400: "Let me help \u2192",
  };
  if (payload.friction_id && FRICTION_LABELS[payload.friction_id]) {
    return FRICTION_LABELS[payload.friction_id];
  }
  if (payload.type === "escalate") return "Support available \u2192";
  return "Quick tip \u2192";
}

/**
 * AVA Widget — Pure vanilla TypeScript, Shadow DOM isolated.
 * Zero external dependencies.
 *
 * State machine:
 *   minimized \u2192 signal   (nudge received — label strip shown, card visible)
 *   signal    \u2192 expanded (user clicks toggle or CTA)
 *   signal    \u2192 minimized (soft/hard dismiss or auto-collapse after 4s)
 *   expanded  \u2192 minimized (user minimizes)
 */
export class AVAWidget {
  private shadow: ShadowRoot;
  private config: WidgetConfig;
  private state: WidgetState = "minimized";
  private messages: WidgetMessage[] = [];
  private currentNudge: InterventionPayload | null = null;
  private isTyping = false;
  private hasUnread = false;
  private inputValue = "";
  private isMobile = false;

  // Root containers
  private root!: HTMLDivElement;
  private nudgeContainer!: HTMLDivElement;
  private panelContainer!: HTMLDivElement;
  private messagesContainer!: HTMLDivElement;
  private inputEl!: HTMLInputElement;
  private toggleBtn!: HTMLButtonElement;

  // External callbacks (wired by index.ts)
  onDismiss: (id: string) => void = () => {};
  onConvert: (id: string, action: string) => void = () => {};
  onIgnored: (id: string) => void = () => {};
  onUserMessage: (text: string) => void = () => {};
  onUserAction: (action: string, data?: Record<string, unknown>) => void = () => {};
  /** Micro-outcome callback — fine-grained training signal */
  onMicroOutcome: (id: string, outcome: MicroOutcome) => void = () => {};
  /** Feedback callback — thumbs up/down on interventions */
  onFeedback: (id: string, feedback: "helpful" | "not_helpful") => void = () => {};
  /** Called when user taps mute — index.ts forwards this as "voice_muted" outcome */
  onVoiceMuted: (id: string) => void = () => {};
  /** Called when a voice query transcript is ready — index.ts sends it as voice_query WS message */
  onVoiceQuery: (transcript: string) => void = () => {};

  // Voice (TTS + ASR)
  private voiceManager: VoiceManager | null = null;
  private speechRecognizer: SpeechRecognizer | null = null;
  private micHandle: MicButtonHandle | null = null;

  private nudgeTimeout: ReturnType<typeof setTimeout> | null = null;
  private signalCollapseTimeout: ReturnType<typeof setTimeout> | null = null;

  // Track intervention IDs that have already reported a terminal outcome
  private reportedOutcomes = new Set<string>();

  constructor(shadow: ShadowRoot, config: WidgetConfig) {
    this.shadow = shadow;
    this.config = config;
    this.isMobile = window.matchMedia("(max-width: 640px)").matches;
    window.matchMedia("(max-width: 640px)").addEventListener("change", (e) => {
      this.isMobile = e.matches;
    });

    // Initialise voice only when voice is enabled and a server URL is provided for proxying
    if (config.voiceEnabled && config.serverUrl) {
      this.voiceManager = new VoiceManager({
        maxPerSession: config.voiceMaxPerSession ?? 3,
        serverUrl: config.serverUrl,
        deepgramModel: config.deepgramModel ?? "aura-asteria-en",
        onMuted: (interventionId) => {
          this.onVoiceMuted(interventionId);
          this.render(); // refresh to remove mute button
        },
      });

      // Phase 2: also enable ASR (speech recognition) when voice is on
      if (SpeechRecognizer.isSupported()) {
        this.speechRecognizer = new SpeechRecognizer(config.serverUrl, {
          onRecordingStart: () => {
            this.micHandle?.setState("recording");
          },
          onRecordingStop: () => {
            this.micHandle?.setState("processing");
          },
          onTranscript: (transcript) => {
            this.micHandle?.setState("idle");
            this.handleVoiceTranscript(transcript);
          },
          onError: (err) => {
            this.micHandle?.setState("idle");
            console.warn("[AVA] Speech recognition error:", err.message);
          },
        });
      }
    }
  }

  mount(): void {
    this.applyCSSVars();
    injectGlobalStyles(this.shadow);

    this.root = this.el("div", {
      id: "shopassist-widget",
      style: this.isMobile
        ? `position:relative;font-family:${this.config.fontFamily};`
        : `position:fixed;bottom:20px;${this.config.position === "bottom-right" ? "right" : "left"}:20px;z-index:${this.config.zIndex};font-family:${this.config.fontFamily};`,
    });

    this.nudgeContainer = this.el("div", { id: "ava-nudge" });
    this.root.appendChild(this.nudgeContainer);

    this.panelContainer = this.el("div", { id: "ava-panel-wrap" });
    this.panelContainer.style.display = "none";
    this.root.appendChild(this.panelContainer);

    if (!this.isMobile) {
      this.toggleBtn = renderToggleButton({
        config: this.config,
        onClick: () => this.handleToggleClick(),
      });
      this.root.appendChild(this.toggleBtn);
    } else {
      // Mobile FAB outside shadow DOM for fixed positioning
      this.toggleBtn = document.createElement("button");
      this.toggleBtn.setAttribute(
        "style",
        `position:fixed;bottom:20px;right:20px;width:52px;height:52px;
         border-radius:50%;background:linear-gradient(135deg,${this.config.brandColor},${this.config.brandColorLight});
         color:#fff;border:none;cursor:pointer;
         display:flex;align-items:center;justify-content:center;font-size:22px;
         box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:${this.config.zIndex};
         transition:opacity 0.3s ease;`,
      );
      this.toggleBtn.textContent = "\uD83D\uDECD\uFE0F";
      this.toggleBtn.addEventListener("click", () => this.handleToggleClick());
      this.toggleBtn.addEventListener("mouseenter", () => { this.toggleBtn.style.opacity = "1"; });
      this.toggleBtn.addEventListener("mouseleave", () => {
        if (this.state === "minimized" && !this.hasUnread) this.toggleBtn.style.opacity = "0.18";
      });
      document.body.appendChild(this.toggleBtn);
    }

    this.shadow.appendChild(this.root);
    this.render();
  }

  // ---- PUBLIC: called by bridge ----

  handleIntervention(payload: InterventionPayload): void {
    switch (payload.type) {
      case "passive":
        if (payload.ui_adjustment) {
          try { PassiveExecutor.execute(payload.ui_adjustment); } catch { /* silent */ }
        }
        // Show ambient bubble — no state change, no unread badge, no voice
        // Toggle stays faded; card floats above it as a subtle ambient presence
        this.currentNudge = payload;
        this.render();
        if (this.nudgeTimeout) clearTimeout(this.nudgeTimeout);
        this.nudgeTimeout = setTimeout(() => {
          if (this.currentNudge?.intervention_id === payload.intervention_id) {
            this.onIgnored(payload.intervention_id);
            this.currentNudge = null;
            this.render();
          }
        }, 8000);
        break;

      case "nudge":
        this.currentNudge = payload;
        this.hasUnread = true;
        if (this.state === "minimized") {
          this.state = "signal";
          if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
          this.signalCollapseTimeout = setTimeout(() => {
            if (this.state === "signal") {
              this.state = "minimized";
              this.renderToggle();
            }
          }, 4000);
        }
        this.render();
        if (this.nudgeTimeout) clearTimeout(this.nudgeTimeout);
        this.nudgeTimeout = setTimeout(() => {
          if (this.currentNudge?.intervention_id === payload.intervention_id) {
            this.voiceManager?.stopCurrent();
            this.onIgnored(payload.intervention_id);
            this.currentNudge = null;
            if (this.state === "signal") this.state = "minimized";
            this.render();
          }
        }, 12000);
        // Play TTS only when voiceAutoPlay is not explicitly disabled
        if (payload.voice_enabled && payload.voice_script && this.config.voiceAutoPlay !== false) {
          this.voiceManager?.speak(payload.voice_script).catch(() => {});
        }
        break;

      case "active":
        this.currentNudge = null;
        if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
        this.state = "expanded";
        this.isTyping = true;
        this.render();
        setTimeout(() => {
          this.isTyping = false;
          this.messages.push({
            id: payload.intervention_id,
            type: "assistant",
            content: payload.message || "",
            payload,
            timestamp: Date.now(),
          });
          this.render();
          this.scrollMessages();
          if (payload.voice_enabled && payload.voice_script && this.config.voiceAutoPlay !== false) {
            this.voiceManager?.speak(payload.voice_script).catch(() => {});
          }
        }, 500);
        break;

      case "escalate":
        this.currentNudge = null;
        if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
        this.state = "expanded";
        this.messages.push({
          id: payload.intervention_id,
          type: "system",
          content: payload.message || "Connecting you with support...",
          payload,
          timestamp: Date.now(),
        });
        this.render();
        this.scrollMessages();
        if (payload.voice_enabled && payload.voice_script && this.config.voiceAutoPlay !== false) {
          this.voiceManager?.speak(payload.voice_script).catch(() => {});
        }
        break;
    }
  }

  /**
   * Called by bridge when the server acks a voice_query.
   * Clears the typing indicator if the query was rejected (disabled / error).
   * On "ok" the server will follow up with a real "intervention" message.
   */
  handleVoiceQueryAck(data: { status: string }): void {
    if (data.status !== "ok") {
      this.isTyping = false;
      const errMsg = data.status === "disabled"
        ? "Voice assistance is not enabled on this site."
        : "Sorry, I couldn't process that. Please try again.";
      this.messages.push({
        id: `sys_${Date.now()}`,
        type: "system",
        content: errMsg,
        timestamp: Date.now(),
      });
      this.micHandle?.setState("idle");
      this.render();
      this.scrollMessages();
    }
  }

  // ---- RENDER ORCHESTRATOR ----

  private render(): void {
    this.renderNudge();
    this.renderPanelView();
    this.renderToggle();
  }

  private renderToggle(): void {
    updateToggleButton(
      this.toggleBtn,
      this.state,
      this.hasUnread,
      this.config,
      this.currentNudge ? deriveLabelText(this.currentNudge) : undefined,
    );
  }

  private renderNudge(): void {
    this.nudgeContainer.innerHTML = "";
    if (
      (this.state === "minimized" || this.state === "signal") &&
      this.currentNudge
    ) {
      const payload = this.currentNudge;
      const showVoiceMute =
        payload.voice_enabled === true && !this.voiceManager?.isMuted;

      const nudge = renderNudgeBubble({
        config: this.config,
        message: payload.message || "",
        frictionId: payload.friction_id,
        ctaLabel: payload.cta_label,
        voiceEnabled: showVoiceMute,
        onVoiceMute: showVoiceMute
          ? () => {
              this.voiceManager?.mute(payload.intervention_id);
            }
          : undefined,
        onCtaClick: () => this.handleNudgeCtaClick(),
        onSoftDismiss: () => {
          this.voiceManager?.stopCurrent();
          this.onMicroOutcome(payload.intervention_id, "soft_dismiss");
          this.onDismiss(payload.intervention_id);
          this.currentNudge = null;
          this.state = "minimized";
          this.hasUnread = false;
          this.render();
        },
        onHardDismiss: () => {
          this.voiceManager?.stopCurrent();
          this.onMicroOutcome(payload.intervention_id, "hard_dismiss");
          this.onDismiss(payload.intervention_id);
          this.currentNudge = null;
          this.state = "minimized";
          this.hasUnread = false;
          this.render();
        },
        onFeedback: (feedback: "helpful" | "not_helpful") => {
          this.voiceManager?.stopCurrent();
          this.onFeedback(payload.intervention_id, feedback);
          this.onMicroOutcome(payload.intervention_id, feedback === "helpful" ? "cta_click" : "not_helpful");
          if (feedback === "not_helpful") this.onIgnored(payload.intervention_id);
          this.currentNudge = null;
          this.state = "minimized";
          this.hasUnread = false;
          this.render();
        },
      });
      this.nudgeContainer.appendChild(nudge);
    }
  }

  private renderPanelView(): void {
    if (this.state !== "expanded") {
      this.panelContainer.style.display = "none";
      return;
    }
    this.panelContainer.style.display = "block";
    this.panelContainer.innerHTML = "";

    // Find the most recent voice-enabled intervention payload for the panel
    const voiceMsg = [...this.messages]
      .reverse()
      .find((m) => m.payload?.voice_enabled === true);
    const panelVoiceEnabled =
      voiceMsg !== undefined && !this.voiceManager?.isMuted;

    const panel = renderPanel({
      config: this.config,
      isMobile: this.isMobile,
      voiceEnabled: panelVoiceEnabled,
      onVoiceMute: panelVoiceEnabled && voiceMsg?.payload
        ? () => {
            this.voiceManager?.mute(voiceMsg.payload!.intervention_id);
          }
        : undefined,
      onMinimize: () => {
        this.voiceManager?.stopCurrent();
        this.dismissActiveInterventions();
        this.state = "minimized";
        this.hasUnread = false;
        this.render();
      },
    });

    // --- Lead area ---
    const leadArea = panel.querySelector("#ava-lead-area") as HTMLElement;

    if (this.isTyping) {
      leadArea.appendChild(renderLeadSkeleton());
    } else {
      const lead = [...this.messages]
        .reverse()
        .find((m) => m.type === "assistant" || m.type === "system");

      if (lead && lead.content) {
        const leadCard = renderLeadCard({
          config: this.config,
          frictionId: lead.payload?.friction_id,
          message: lead.content,
          ctaLabel:
            lead.payload?.cta_label &&
            !lead.payload?.products?.length &&
            !lead.payload?.comparison
              ? lead.payload.cta_label
              : undefined,
          onCtaClick: lead.payload?.cta_label
            ? () => {
                if (!lead.payload) return;
                this.reportedOutcomes.add(lead.id);
                this.onConvert(lead.id, lead.payload.cta_action || "cta_click");
                this.onUserAction(lead.payload.cta_action || "cta_click", lead.payload.meta);
              }
            : undefined,
          onFeedback: lead.payload
            ? (feedback: "helpful" | "not_helpful") => {
                if (!lead.payload) return;
                this.onFeedback(lead.payload.intervention_id, feedback);
                this.onMicroOutcome(lead.payload.intervention_id, feedback === "helpful" ? "cta_click" : "not_helpful");
                if (feedback === "not_helpful") this.onIgnored(lead.payload.intervention_id);
                this.reportedOutcomes.add(lead.id);
              }
            : undefined,
        });
        leadArea.appendChild(leadCard);
      }
    }

    // --- Supporting content ---
    const contentEl = panel.querySelector("#ava-panel-content") as HTMLDivElement;
    this.messagesContainer = contentEl;

    const hasSupporting = this.messages.some(
      (m) =>
        m.type === "user" ||
        (m.type === "system" && m.id.startsWith("msg_")) ||
        (m.payload?.products && m.payload.products.length > 0) ||
        m.payload?.comparison,
    );

    if (!hasSupporting && !this.isTyping) {
      contentEl.appendChild(renderEmptyState(this.config));
    } else {
      for (const msg of this.messages) {
        const wrapper = this.el("div");

        // User messages and system confirmations (e.g. "✓ Added to cart")
        if (
          msg.content &&
          (msg.type === "user" ||
            (msg.type === "system" && msg.id.startsWith("msg_")))
        ) {
          const isUser = msg.type === "user";
          const bubble = this.el("div", {
            style: `max-width:85%;
              margin-left:${isUser ? "auto" : "0"};
              margin-right:${isUser ? "0" : "auto"};
              background:${isUser ? `var(--ava-primary,${this.config.brandColor})` : "#f0fdf4"};
              color:${isUser ? "#fff" : "#166534"};
              padding:${isUser ? "9px 13px" : "6px 12px"};
              border-radius:${isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px"};
              font-size:13px;line-height:1.5;
              border:${isUser ? "none" : "1px solid #bbf7d0"};
              animation:sa-fadeIn 0.2s ease-out;word-wrap:break-word;`,
          });
          bubble.textContent = msg.content;
          wrapper.appendChild(bubble);
        }

        // Product cards
        if (msg.payload?.products && msg.payload.products.length > 0) {
          const cardsWrap = this.el("div", {
            style: "display:flex;flex-direction:column;gap:8px;",
          });
          msg.payload.products
            .slice(0, this.config.maxCardsToShow)
            .forEach((card, idx) => {
              const cardEl = renderProductCard({
                config: this.config,
                card,
                index: idx,
                onAddToCart: (productId) => this.handleAddToCart(
                  productId,
                  msg.payload?.action_code === "AGENT_ADD_TO_CART" ? msg.payload.meta : undefined,
                ),
                onMoreLikeThis: (productId) => {
                  if (msg.payload) {
                    this.onMicroOutcome(msg.payload.intervention_id, "more_like_this");
                    this.onUserAction("more_like_this", { product_id: productId });
                  }
                },
              });
              cardsWrap.appendChild(cardEl);
            });
          wrapper.appendChild(cardsWrap);
        }

        // Comparison card
        if (msg.payload?.comparison) {
          const compEl = renderComparisonCard({
            config: this.config,
            comparison: msg.payload.comparison,
            onSelect: (productId) => {
              this.handleAddToCart(productId);
              this.reportedOutcomes.add(msg.id);
              if (msg.payload) {
                this.onConvert(msg.payload.intervention_id, "select_comparison");
              }
            },
          });
          wrapper.appendChild(compEl);
        }

        if (wrapper.hasChildNodes()) contentEl.appendChild(wrapper);
      }
    }

    // --- Footer input ---
    const footerEl = panel.querySelector("#ava-panel-footer") as HTMLDivElement;
    this.buildInputBar(footerEl);

    this.panelContainer.appendChild(panel);
  }

  // ---- HELPERS ----

  private buildInputBar(container: HTMLDivElement): void {
    const wrap = this.el("div", {
      style: "display:flex;gap:8px;align-items:center;",
    });

    // 🎙 Mic button — only shown when ASR is initialised
    if (this.speechRecognizer) {
      this.micHandle = renderMicButton({
        onClick: () => this.handleMicClick(),
      });
      wrap.appendChild(this.micHandle.element);
    }

    this.inputEl = this.el("input", {
      style: `flex:1;border:1px solid #e5e7eb;border-radius:10px;
              padding:9px 13px;font-size:13px;
              font-family:${this.config.fontFamily};
              outline:none;transition:border-color 0.2s ease;
              background:#fafafa;color:#111827;`,
    }) as HTMLInputElement;
    this.inputEl.type = "text";
    this.inputEl.placeholder = this.speechRecognizer ? "Ask or speak…" : "Ask anything...";
    this.inputEl.value = this.inputValue;

    this.inputEl.addEventListener("input", (e) => {
      this.inputValue = (e.target as HTMLInputElement).value;
      this.updateSendButton();
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleSendMessage();
    });
    this.inputEl.addEventListener("focus", () => {
      this.inputEl.style.borderColor = `var(--ava-primary,${this.config.brandColor})`;
      this.inputEl.style.background = "#fff";
    });
    this.inputEl.addEventListener("blur", () => {
      this.inputEl.style.borderColor = "#e5e7eb";
      this.inputEl.style.background = "#fafafa";
    });

    const sendBtn = this.el("button", {
      id: "ava-send-btn",
      style: `background:${this.inputValue.trim() ? `var(--ava-primary,${this.config.brandColor})` : "#e5e7eb"};
              color:${this.inputValue.trim() ? "#fff" : "#9ca3af"};
              border:none;border-radius:10px;width:38px;height:38px;
              cursor:${this.inputValue.trim() ? "pointer" : "default"};
              display:flex;align-items:center;justify-content:center;
              font-size:16px;transition:all 0.2s ease;flex-shrink:0;`,
    }) as HTMLButtonElement;
    sendBtn.textContent = "\u2191";
    sendBtn.addEventListener("click", () => this.handleSendMessage());

    wrap.appendChild(this.inputEl);
    wrap.appendChild(sendBtn);
    container.appendChild(wrap);
  }

  private handleMicClick(): void {
    if (!this.speechRecognizer) return;
    if (this.speechRecognizer.isRecording) {
      this.speechRecognizer.stop();
    } else if (!this.speechRecognizer.isProcessing) {
      this.speechRecognizer.start().catch((err) => {
        this.micHandle?.setState("idle");
        console.warn("[AVA] Mic start failed:", err);
      });
    }
  }

  /**
   * Called when Deepgram STT returns a transcript from user speech.
   * Shows it as a user message, stops TTS playback, and sends it to the server.
   */
  private handleVoiceTranscript(transcript: string): void {
    // Stop any TTS that may be playing so the reply isn't overlaid
    this.voiceManager?.stopCurrent();

    // Show the user's spoken text as a chat bubble
    this.messages.push({
      id: `msg_${Date.now()}`,
      type: "user",
      content: transcript,
      timestamp: Date.now(),
    });

    // Show typing indicator while server processes the voice query
    this.isTyping = true;
    this.render();
    this.scrollMessages();

    // Forward to server via the onVoiceQuery callback (wired in index.ts)
    this.onVoiceQuery(transcript);
  }

  private handleToggleClick(): void {
    if (this.state === "expanded") {
      this.voiceManager?.stopCurrent();
      this.dismissActiveInterventions();
      this.state = "minimized";
      this.hasUnread = false;
    } else {
      // If a nudge is showing, carry its message into the panel before clearing
      if (this.currentNudge && !this.messages.some((m) => m.id === this.currentNudge?.intervention_id)) {
        const n = this.currentNudge;
        this.messages.push({
          id: n.intervention_id,
          type: "assistant",
          content: n.message || "",
          payload: n,
          timestamp: Date.now(),
        });
      }
      this.state = "expanded";
      this.currentNudge = null;
      this.hasUnread = false;
      if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
    }
    this.render();
  }

  private handleNudgeCtaClick(): void {
    if (!this.currentNudge) return;
    const payload = this.currentNudge;
    this.onConvert(payload.intervention_id, payload.cta_action || "open");
    this.onUserAction(payload.cta_action || "open", payload.meta);
    if (
      payload.cta_action === "open_assistant" ||
      payload.cta_action === "open_guided_search" ||
      !payload.cta_action
    ) {
      this.state = "expanded";
      // Carry nudge message into panel so lead card isn't blank
      if (!this.messages.some((m) => m.id === payload.intervention_id)) {
        this.messages.push({
          id: payload.intervention_id,
          type: "assistant",
          content: payload.message || "",
          payload,
          timestamp: Date.now(),
        });
      }
    }
    this.currentNudge = null;
    if (this.signalCollapseTimeout) clearTimeout(this.signalCollapseTimeout);
    this.render();
  }

  private handleAddToCart(productId: string, meta?: Record<string, unknown>): void {
    // Fire the DOM click on the store's add-to-cart button when this came from
    // the shopping agent (AGENT_ADD_TO_CART) — this is the "shopper confirmation" step:
    // the user already confirmed by clicking "Add to Cart" in the panel.
    if (meta) {
      this.tryClickStoreAddToCart(productId, meta.addToCartSelector as string | undefined);
    }
    this.onUserAction("add_to_cart", { product_id: productId });
    this.messages.push({
      id: `msg_${Date.now()}`,
      type: "system",
      content: "\u2713 Added to cart",
      timestamp: Date.now(),
    });
    this.render();
    this.scrollMessages();
  }

  /**
   * Locate and click the host store's add-to-cart button after shopper confirmation.
   * Tries the verified selector from onboarding first, then common heuristics.
   * Silent on failure — cart action is best-effort; shopper can always click manually.
   */
  private tryClickStoreAddToCart(productId: string, verifiedSelector?: string): void {
    // 1. Verified selector from onboarding trackingConfig (most reliable)
    if (verifiedSelector) {
      const el = document.querySelector(verifiedSelector) as HTMLElement | null;
      if (el) { el.click(); return; }
    }

    // 2. Product-scoped selector: find the container for this product_id then its ATC button
    const productContainers = [
      `[data-product-id="${productId}"]`,
      `[data-product="${productId}"]`,
      `[data-id="${productId}"]`,
    ];
    for (const containerSel of productContainers) {
      const container = document.querySelector(containerSel);
      if (container) {
        const btn = container.querySelector("button[type='submit'], [data-action='add-to-cart'], .add-to-cart") as HTMLElement | null;
        if (btn) { btn.click(); return; }
      }
    }

    // 3. Generic heuristics for common e-commerce platforms
    const heuristics = [
      "[data-action='add-to-cart']",
      "button[name='add']",
      "form[action*='/cart'] button[type='submit']",
      ".add-to-cart",
      "#AddToCart",
      ".btn-add-to-cart",
      "[data-add-to-cart]",
    ];
    for (const sel of heuristics) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) { el.click(); return; }
    }
  }

  private handleSendMessage(): void {
    if (!this.inputValue.trim()) return;
    this.messages.push({
      id: `msg_${Date.now()}`,
      type: "user",
      content: this.inputValue.trim(),
      timestamp: Date.now(),
    });
    this.onUserMessage(this.inputValue.trim());
    this.inputValue = "";
    this.isTyping = true;
    this.render();
    this.scrollMessages();
  }

  private dismissActiveInterventions(): void {
    for (const msg of this.messages) {
      if (
        msg.payload &&
        (msg.type === "assistant" || msg.type === "system") &&
        !this.reportedOutcomes.has(msg.payload.intervention_id)
      ) {
        this.reportedOutcomes.add(msg.payload.intervention_id);
        this.onDismiss(msg.payload.intervention_id);
      }
    }
  }

  private updateSendButton(): void {
    const sendBtn = this.shadow.getElementById(
      "ava-send-btn",
    ) as HTMLButtonElement | null;
    if (sendBtn) {
      sendBtn.style.background = this.inputValue.trim() ? `var(--ava-primary,${this.config.brandColor})` : "#e5e7eb";
      sendBtn.style.color = this.inputValue.trim() ? "#fff" : "#9ca3af";
      sendBtn.style.cursor = this.inputValue.trim() ? "pointer" : "default";
    }
  }

  private scrollMessages(): void {
    if (this.messagesContainer) {
      requestAnimationFrame(() => {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      });
    }
  }

  /**
   * Apply CSS custom property overrides to the shadow host.
   * Host sites can pass cssVars in config to theme AVA without touching brand colors.
   */
  private applyCSSVars(): void {
    const host = this.shadow.host as HTMLElement;
    // Always set brand color defaults so var(--ava-primary) works even without cssVars config
    host.style.setProperty("--ava-primary", this.config.brandColor);
    host.style.setProperty("--ava-primary-light", this.config.brandColorLight ?? this.config.brandColor);
    host.style.setProperty("--ava-accent", this.config.accentColor ?? this.config.brandColor);
    host.style.setProperty("--ava-font", this.config.fontFamily);
    host.style.setProperty("--ava-radius", "18px");
    // Override with explicit cssVars if provided by host site
    const vars = this.config.cssVars;
    if (!vars) return;
    if (vars.primaryColor) {
      host.style.setProperty("--ava-primary", vars.primaryColor);
      host.style.setProperty("--ava-primary-light", vars.primaryColor);
      host.style.setProperty("--ava-accent", vars.primaryColor);
    }
    if (vars.fontFamily) host.style.setProperty("--ava-font", vars.fontFamily);
    if (vars.borderRadius) host.style.setProperty("--ava-radius", vars.borderRadius);
  }

  // ---- DOM HELPER ----

  private el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string>,
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        element.setAttribute(key, value);
      }
    }
    return element;
  }
}
