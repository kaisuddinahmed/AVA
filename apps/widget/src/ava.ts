import type {
  WidgetConfig,
  InterventionPayload,
  WidgetMessage,
  WidgetState,
} from "./config.js";
import { injectGlobalStyles } from "./ui/styles/global-styles.js";
import { PassiveExecutor } from "./tracker/passive-executor.js";
import { renderNudgeBubble } from "./ui/components/nudge-bubble.js";
import { renderProductCard } from "./ui/components/product-card.js";
import { renderComparisonCard } from "./ui/components/comparison-card.js";
import { renderTypingIndicator } from "./ui/components/typing-indicator.js";

/**
 * AVA Widget — Pure vanilla TypeScript, Shadow DOM isolated.
 * Zero external dependencies.
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

  // Root containers
  private root!: HTMLDivElement;
  private nudgeContainer!: HTMLDivElement;
  private panelContainer!: HTMLDivElement;
  private messagesContainer!: HTMLDivElement;
  private inputEl!: HTMLInputElement;
  private toggleBtn!: HTMLButtonElement;
  private unreadDot: HTMLDivElement | null = null;

  // External callbacks (wired by index.ts)
  onDismiss: (id: string) => void = () => {};
  onConvert: (id: string, action: string) => void = () => {};
  onIgnored: (id: string) => void = () => {};
  onUserMessage: (text: string) => void = () => {};
  onUserAction: (action: string, data?: Record<string, unknown>) => void =
    () => {};

  private nudgeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(shadow: ShadowRoot, config: WidgetConfig) {
    this.shadow = shadow;
    this.config = config;
  }

  mount(): void {
    // Inject styles into shadow root
    injectGlobalStyles(this.shadow);

    // Build DOM structure
    this.root = this.el("div", {
      id: "shopassist-widget",
      style: `position:fixed;bottom:20px;${this.config.position === "bottom-right" ? "right" : "left"}:20px;z-index:${this.config.zIndex};font-family:${this.config.fontFamily};`,
    });

    // Nudge container
    this.nudgeContainer = this.el("div", { id: "ava-nudge" });
    this.root.appendChild(this.nudgeContainer);

    // Expanded panel container
    this.panelContainer = this.el("div", { id: "ava-panel" });
    this.panelContainer.style.display = "none";
    this.root.appendChild(this.panelContainer);

    // Toggle button
    this.toggleBtn = this.buildToggleButton();
    this.root.appendChild(this.toggleBtn);

    this.shadow.appendChild(this.root);
    this.render();
  }

  // Track intervention IDs that have already reported a terminal outcome
  private reportedOutcomes = new Set<string>();

  // ---- PUBLIC: called by bridge ----

  handleIntervention(payload: InterventionPayload): void {
    switch (payload.type) {
      case "passive":
        // Passive adjustments operate on the host page, not shadow DOM
        if (payload.ui_adjustment) {
          try {
            PassiveExecutor.execute(payload.ui_adjustment);
            this.onIgnored(payload.intervention_id);
          } catch {
            this.onIgnored(payload.intervention_id);
          }
        } else {
          // No UI adjustment to apply — report as ignored
          this.onIgnored(payload.intervention_id);
        }
        break;

      case "nudge":
        this.currentNudge = payload;
        this.hasUnread = true;
        this.render();
        if (this.nudgeTimeout) clearTimeout(this.nudgeTimeout);
        this.nudgeTimeout = setTimeout(() => {
          if (
            this.currentNudge?.intervention_id === payload.intervention_id
          ) {
            this.onIgnored(payload.intervention_id);
            this.currentNudge = null;
            this.render();
          }
        }, 10000);
        break;

      case "active":
        this.currentNudge = null;
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
        }, 800);
        break;

      case "escalate":
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
        break;
    }
  }

  /**
   * Report "dismissed" for any active/escalate interventions shown in the panel
   * that haven't already reported a terminal outcome.
   * Called when user minimizes or closes the expanded panel.
   */
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

  // ---- RENDER ----

  private render(): void {
    // --- Nudge ---
    this.nudgeContainer.innerHTML = "";
    if (this.state === "minimized" && this.currentNudge) {
      const nudge = renderNudgeBubble({
        config: this.config,
        message: this.currentNudge.message || "",
        ctaLabel: this.currentNudge.cta_label,
        onCtaClick: () => this.handleNudgeCtaClick(),
        onDismiss: () => {
          if (this.currentNudge) {
            this.onDismiss(this.currentNudge.intervention_id);
            this.currentNudge = null;
            this.render();
          }
        },
      });
      this.nudgeContainer.appendChild(nudge);
    }

    // --- Panel ---
    if (this.state === "expanded") {
      this.panelContainer.style.display = "block";
      this.buildPanel();
    } else {
      this.panelContainer.style.display = "none";
    }

    // --- Toggle button ---
    this.toggleBtn.textContent =
      this.state === "expanded" ? "\u00d7" : "\uD83D\uDECD\uFE0F";
    this.toggleBtn.setAttribute(
      "aria-label",
      this.state === "expanded" ? "Close assistant" : "Open assistant",
    );
    this.toggleBtn.style.animation =
      this.hasUnread && this.state !== "expanded"
        ? "sa-breathe 2s ease-in-out infinite"
        : "none";

    // Unread dot
    if (this.unreadDot) {
      this.unreadDot.remove();
      this.unreadDot = null;
    }
    if (this.hasUnread && this.state !== "expanded") {
      this.unreadDot = this.el("div", {
        style: `position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:${this.config.accentColor};border:2px solid #fff;animation:sa-scaleIn 0.3s ease-out;`,
      });
      this.toggleBtn.appendChild(this.unreadDot);
    }
  }

  private buildPanel(): void {
    this.panelContainer.innerHTML = "";
    const isRight = this.config.position === "bottom-right";

    const panel = this.el("div", {
      style: `position:absolute;bottom:72px;${isRight ? "right" : "left"}:0;width:370px;max-height:520px;background:#fff;border-radius:20px;box-shadow:0 12px 60px rgba(0,0,0,0.15),0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;overflow:hidden;animation:sa-slideUp 0.3s ease-out;`,
    });

    // --- Header ---
    const header = this.el("div", {
      style: `background:linear-gradient(135deg,${this.config.brandColor},${this.config.brandColorLight});padding:16px 20px;display:flex;align-items:center;justify-content:space-between;`,
    });

    const headerLeft = this.el("div", {
      style: "display:flex;align-items:center;gap:10px;",
    });
    const icon = this.el("div", {
      style: "width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;",
    });
    icon.textContent = "\uD83D\uDECD\uFE0F";

    const nameWrap = this.el("div");
    const nameEl = this.el("div", {
      style: "font-size:15px;font-weight:700;color:#fff;",
    });
    nameEl.textContent = this.config.assistantName;
    const subEl = this.el("div", {
      style: "font-size:11px;color:rgba(255,255,255,0.7);",
    });
    subEl.textContent = "Your shopping assistant";
    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(subEl);
    headerLeft.appendChild(icon);
    headerLeft.appendChild(nameWrap);

    const minimizeBtn = this.el("button", {
      style: "background:rgba(255,255,255,0.15);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background 0.2s ease;",
    }) as HTMLButtonElement;
    minimizeBtn.textContent = "\u2193";
    minimizeBtn.setAttribute("aria-label", "Minimize");
    minimizeBtn.addEventListener("click", () => {
      this.dismissActiveInterventions();
      this.state = "minimized";
      this.hasUnread = false;
      this.render();
    });
    minimizeBtn.addEventListener("mouseenter", () => {
      minimizeBtn.style.background = "rgba(255,255,255,0.25)";
    });
    minimizeBtn.addEventListener("mouseleave", () => {
      minimizeBtn.style.background = "rgba(255,255,255,0.15)";
    });

    header.appendChild(headerLeft);
    header.appendChild(minimizeBtn);
    panel.appendChild(header);

    // --- Messages ---
    this.messagesContainer = this.el("div", {
      style: "flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#fafafa;min-height:200px;max-height:340px;",
    });

    if (this.messages.length === 0 && !this.isTyping) {
      const empty = this.el("div", {
        style: "text-align:center;padding:40px 20px;color:#9ca3af;font-size:13px;",
      });
      const wave = this.el("div", { style: "font-size:28px;margin-bottom:8px;" });
      wave.textContent = "\uD83D\uDC4B";
      empty.appendChild(wave);
      empty.appendChild(document.createTextNode("I'm here if you need anything"));
      this.messagesContainer.appendChild(empty);
    }

    for (const msg of this.messages) {
      const wrapper = this.el("div");

      // Text bubble
      if (msg.content) {
        const isUser = msg.type === "user";
        const isSystem = msg.type === "system";
        const bubble = this.el("div", {
          style: `max-width:85%;margin-left:${isUser ? "auto" : "0"};margin-right:${isUser ? "0" : "auto"};background:${isUser ? this.config.brandColor : isSystem ? "#f0fdf4" : "#fff"};color:${isUser ? "#fff" : isSystem ? "#166534" : "#1a1a2e"};padding:${isSystem ? "8px 14px" : "10px 16px"};border-radius:${isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px"};font-size:${isSystem ? "12px" : "14px"};line-height:1.5;font-weight:${isSystem ? "500" : "400"};box-shadow:${msg.type === "assistant" ? "0 1px 4px rgba(0,0,0,0.04)" : "none"};border:${msg.type === "assistant" ? "1px solid #f0f0f0" : isSystem ? "1px solid #bbf7d0" : "none"};animation:sa-fadeIn 0.2s ease-out;`,
        });
        bubble.textContent = msg.content;
        wrapper.appendChild(bubble);
      }

      // Product cards
      if (msg.payload?.products && msg.payload.products.length > 0) {
        const cardsWrap = this.el("div", {
          style: "display:flex;flex-direction:column;gap:8px;margin-top:8px;max-width:95%;",
        });
        msg.payload.products
          .slice(0, this.config.maxCardsToShow)
          .forEach((card, idx) => {
            const cardEl = renderProductCard({
              config: this.config,
              card,
              index: idx,
              onAddToCart: (productId) => this.handleAddToCart(productId),
            });
            cardsWrap.appendChild(cardEl);
          });
        wrapper.appendChild(cardsWrap);
      }

      // Comparison card
      if (msg.payload?.comparison) {
        const compWrap = this.el("div", {
          style: "margin-top:8px;max-width:95%;",
        });
        const compEl = renderComparisonCard({
          config: this.config,
          comparison: msg.payload.comparison,
          onSelect: (productId) => {
            this.handleAddToCart(productId);
            this.reportedOutcomes.add(msg.id);
            this.onConvert(msg.id, "select_comparison");
          },
        });
        compWrap.appendChild(compEl);
        wrapper.appendChild(compWrap);
      }

      // CTA button
      if (
        msg.payload?.cta_label &&
        !msg.payload.products?.length &&
        !msg.payload.comparison
      ) {
        const ctaBtn = this.el("button", {
          style: `margin-top:8px;background:${this.config.accentColor};color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;font-family:${this.config.fontFamily};animation:sa-fadeIn 0.3s ease-out 0.2s both;transition:opacity 0.2s ease;`,
        }) as HTMLButtonElement;
        ctaBtn.textContent = msg.payload.cta_label;
        const payload = msg.payload;
        const msgId = msg.id;
        ctaBtn.addEventListener("click", () => {
          this.reportedOutcomes.add(msgId);
          this.onConvert(msgId, payload.cta_action || "cta_click");
          this.onUserAction(
            payload.cta_action || "cta_click",
            payload.meta,
          );
        });
        wrapper.appendChild(ctaBtn);
      }

      this.messagesContainer.appendChild(wrapper);
    }

    if (this.isTyping) {
      this.messagesContainer.appendChild(renderTypingIndicator());
    }

    panel.appendChild(this.messagesContainer);

    // --- Input area ---
    const inputArea = this.el("div", {
      style: "padding:12px 16px;border-top:1px solid #f0f0f0;background:#fff;display:flex;gap:8px;align-items:center;",
    });

    this.inputEl = this.el("input", {
      style: `flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;font-family:${this.config.fontFamily};outline:none;transition:border-color 0.2s ease;background:#fafafa;`,
    }) as HTMLInputElement;
    this.inputEl.type = "text";
    this.inputEl.placeholder = "Ask anything...";
    this.inputEl.value = this.inputValue;
    this.inputEl.addEventListener("input", (e) => {
      this.inputValue = (e.target as HTMLInputElement).value;
      this.updateSendButton();
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleSendMessage();
    });
    this.inputEl.addEventListener("focus", () => {
      this.inputEl.style.borderColor = this.config.brandColor;
      this.inputEl.style.background = "#fff";
    });
    this.inputEl.addEventListener("blur", () => {
      this.inputEl.style.borderColor = "#e5e7eb";
      this.inputEl.style.background = "#fafafa";
    });

    const sendBtn = this.el("button", {
      id: "ava-send-btn",
      style: `background:${this.inputValue.trim() ? this.config.brandColor : "#e5e7eb"};color:${this.inputValue.trim() ? "#fff" : "#9ca3af"};border:none;border-radius:10px;width:40px;height:40px;cursor:${this.inputValue.trim() ? "pointer" : "default"};display:flex;align-items:center;justify-content:center;font-size:16px;transition:all 0.2s ease;flex-shrink:0;`,
    }) as HTMLButtonElement;
    sendBtn.textContent = "\u2191";
    sendBtn.addEventListener("click", () => this.handleSendMessage());

    inputArea.appendChild(this.inputEl);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    this.panelContainer.appendChild(panel);
  }

  // ---- TOGGLE BUTTON ----

  private buildToggleButton(): HTMLButtonElement {
    const btn = this.el("button", {
      style: `width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,${this.config.brandColor},${this.config.brandColorLight});color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 20px rgba(0,0,0,0.15);transition:transform 0.2s ease,box-shadow 0.2s ease;position:relative;`,
    }) as HTMLButtonElement;
    btn.textContent = "\uD83D\uDECD\uFE0F";
    btn.setAttribute("aria-label", "Open assistant");

    btn.addEventListener("click", () => {
      if (this.state === "expanded") {
        this.dismissActiveInterventions();
        this.state = "minimized";
      } else {
        this.state = "expanded";
        this.currentNudge = null;
        this.hasUnread = false;
      }
      this.render();
    });

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.05)";
      btn.style.boxShadow = "0 6px 28px rgba(0,0,0,0.2)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)";
    });

    return btn;
  }

  // ---- HANDLERS ----

  private handleNudgeCtaClick(): void {
    if (!this.currentNudge) return;
    this.onConvert(
      this.currentNudge.intervention_id,
      this.currentNudge.cta_action || "open",
    );

    if (
      this.currentNudge.cta_action === "open_assistant" ||
      this.currentNudge.cta_action === "open_guided_search"
    ) {
      this.state = "expanded";
    }

    this.onUserAction(
      this.currentNudge.cta_action || "open",
      this.currentNudge.meta,
    );
    this.currentNudge = null;
    this.render();
  }

  private handleAddToCart(productId: string): void {
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

  private updateSendButton(): void {
    const sendBtn = this.shadow.getElementById(
      "ava-send-btn",
    ) as HTMLButtonElement | null;
    if (sendBtn) {
      sendBtn.style.background = this.inputValue.trim()
        ? this.config.brandColor
        : "#e5e7eb";
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
