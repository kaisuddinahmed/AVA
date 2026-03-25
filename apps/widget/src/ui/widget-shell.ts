import { injectGlobalStyles } from "./styles/global-styles.js";
import type { WidgetConfig } from "../config.js";
import { AgentController } from '../agent/agent.controller.js';

/**
 * Widget Shell — Creates and manages the Shadow DOM container.
 * Provides style isolation from the host page and manages the root layout.
 */
export class WidgetShell {
  private hostEl: HTMLDivElement;
  private shadow: ShadowRoot;
  private root: HTMLDivElement;
  constructor(config: WidgetConfig) {

    // Create host element
    this.hostEl = document.createElement("div");
    this.hostEl.id = "ava-widget-root";
    this.hostEl.setAttribute("style", "all:initial;position:fixed;z-index:2147483647;");
    document.body.appendChild(this.hostEl);

    // Create Shadow DOM for full style isolation
    this.shadow = this.hostEl.attachShadow({ mode: "open" });

    // Inject base styles
    injectGlobalStyles(this.shadow);

    // Create root container
    this.root = document.createElement("div");
    this.root.id = "ava-root";
    this.root.setAttribute(
      "style",
      `position:fixed;bottom:20px;${config.position === "bottom-right" ? "right" : "left"}:20px;z-index:${config.zIndex};font-family:${config.fontFamily};`,
    );
    this.shadow.appendChild(this.root);
  }

  getShadow(): ShadowRoot {
    return this.shadow;
  }

  getRoot(): HTMLDivElement {
    return this.root;
  }

  /**
   * Append a child element to the widget root.
   */
  append(el: HTMLElement): void {
    this.root.appendChild(el);
  }

  /**
   * Remove a child element from the widget root.
   */
  remove(el: HTMLElement): void {
    if (this.root.contains(el)) {
      this.root.removeChild(el);
    }
  }

  /**
   * Query within shadow DOM.
   */
  querySelector(selector: string): HTMLElement | null {
    return this.shadow.querySelector(selector);
  }

  /**
   * Update position dynamically.
   */
  setPosition(position: "bottom-right" | "bottom-left"): void {
    this.root.style.removeProperty("right");
    this.root.style.removeProperty("left");
    if (position === "bottom-right") {
      this.root.style.right = "20px";
    } else {
      this.root.style.left = "20px";
    }
  }

  /**
   * Show/hide the entire widget shell.
   */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "block" : "none";
  }

  /**
   * Clean up and remove from DOM.
   */
  destroy(): void {
    this.hostEl.remove();
  }

  // ── Story 12: Conversational Shopping Agent ───────────────────────────────
  const _agentCtrl = new AgentController({
    ws: wsTransport as unknown as { send(m: Record<string, unknown>): void; on(e: string, h: (d: Record<string, unknown>) => void): void; off(e: string, h: (d: Record<string, unknown>) => void): void },
    panel: panel as unknown as { appendMessage(role: 'user'|'assistant', content: string, extra?: HTMLElement|null): void; showTypingIndicator(): void; hideTypingIndicator(): void; scrollToBottom(): void; clearMessages(): void },
    sessionId: sessionId ?? crypto.randomUUID(),
    siteUrl: config?.siteUrl ?? window.location.origin,
    shopifyStorefrontToken: config?.shopifyStorefrontToken,
    searchUrl: config?.searchUrl,
    addToCartSelector: config?.addToCartSelector,
    pageContextProvider: { getContext: () => ({ pageType: 'other' as const, pageUrl: window.location.href }) },
    onTtsRequest: (text: string) => (voiceManager as unknown as { speak?: (t: string) => void })?.speak?.(text),
  });

}
