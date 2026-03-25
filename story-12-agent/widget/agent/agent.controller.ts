/**
 * Widget Agent Controller — Story 12: Conversational Shopping Agent
 * Copy to: apps/widget/src/agent/agent.controller.ts
 *
 * Orchestrates the widget side of the shopping agent:
 *   • Accepts voice transcripts (from VoiceManager) and typed input (InputBar)
 *   • Sends agent_query messages over the WS transport
 *   • Receives agent_response and agent_typing messages
 *   • Renders conversation thread in the panel (Story 2 prerequisite)
 *   • Manages add-to-cart confirmation flow
 *   • Calls InterventionHandler for product/comparison rendering
 */

import type { AgentResponse, ProductResult } from './agent.types.js';
import { InterventionHandler } from './intervention-handler.js';

// ─── Minimal interface contracts ──────────────────────────────────────────────
// These match the patterns used by the existing widget infrastructure.
// Adjust import paths to match your actual module locations.

interface WsTransport {
  send(msg: Record<string, unknown>): void;
  on(event: string, handler: (data: Record<string, unknown>) => void): void;
  off(event: string, handler: (data: Record<string, unknown>) => void): void;
}

interface Panel {
  appendMessage(role: 'user' | 'assistant', content: string, extra?: HTMLElement | null): void;
  showTypingIndicator(): void;
  hideTypingIndicator(): void;
  scrollToBottom(): void;
  clearMessages(): void;
}

interface PageContextProvider {
  getContext(): {
    pageType: string;
    pageUrl: string;
    productsInView?: Array<{ id: string; title: string; price: number }>;
    cartContents?: Array<{ id: string; title: string; quantity: number; price: number }>;
  };
}

export interface AgentControllerOptions {
  ws: WsTransport;
  panel: Panel;
  sessionId: string;
  siteUrl: string;
  shopifyStorefrontToken?: string;
  searchUrl?: string;
  addToCartSelector?: string;   // From onboarding friction mapping
  pageContextProvider: PageContextProvider;
  onTtsRequest?: (text: string) => void;  // Hook into existing VoiceManager TTS
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class AgentController {
  private readonly handler: InterventionHandler;
  private lastProducts: ProductResult[] = [];
  private pendingCartProduct: ProductResult | null = null;
  private awaitingCartConfirmation = false;
  private readonly wsHandler: (data: Record<string, unknown>) => void;

  constructor(private readonly opts: AgentControllerOptions) {
    this.handler = new InterventionHandler({
      addToCartSelector: opts.addToCartSelector,
      onCartConfirm: this.handleCartConfirmResult.bind(this),
    });

    this.wsHandler = this.onWsMessage.bind(this);
    opts.ws.on('message', this.wsHandler);
  }

  // ─── Input entry points ──────────────────────────────────────────────────

  /** Called by VoiceManager when speech recognition produces a transcript */
  handleVoiceInput(transcript: string): void {
    this.submit(transcript, 'voice');
  }

  /** Called by InputBar when the shopper submits typed text */
  handleTextInput(text: string): void {
    this.submit(text, 'text');
  }

  // ─── Confirmation responses ───────────────────────────────────────────────

  /** Called when shopper confirms add-to-cart (voice "yes" or button tap) */
  confirmCartAdd(): void {
    if (!this.awaitingCartConfirmation || !this.pendingCartProduct) return;
    this.handler.executeCartAdd(this.pendingCartProduct);
    this.awaitingCartConfirmation = false;
    this.pendingCartProduct = null;
    // Log confirmed action
    this.opts.ws.send({
      type: 'agent_query',
      sessionId: this.opts.sessionId,
      query: 'yes add it',
      pageContext: this.opts.pageContextProvider.getContext(),
      siteConfig: this.buildSiteConfig(),
    });
  }

  cancelCartAdd(): void {
    this.awaitingCartConfirmation = false;
    this.pendingCartProduct = null;
    this.opts.panel.appendMessage('assistant', 'No problem — I\'ll leave the cart as is.');
    this.opts.onTtsRequest?.('No problem — I\'ll leave the cart as is.');
  }

  // ─── Session management ───────────────────────────────────────────────────

  clearConversation(): void {
    this.opts.panel.clearMessages();
    this.lastProducts = [];
    this.awaitingCartConfirmation = false;
    this.pendingCartProduct = null;
    // Notify server to clear session history
    fetch(`/api/agent/session/${this.opts.sessionId}`, { method: 'DELETE' }).catch(() => {});
  }

  destroy(): void {
    this.opts.ws.off('message', this.wsHandler);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private submit(query: string, _source: 'voice' | 'text'): void {
    if (!query.trim()) return;

    // Handle yes/no for pending cart confirmation
    if (this.awaitingCartConfirmation) {
      const lq = query.toLowerCase().trim();
      if (/^(yes|yeah|yep|sure|ok|okay|do it|add it|confirm)$/.test(lq)) {
        this.confirmCartAdd();
        return;
      }
      if (/^(no|nope|cancel|stop|don'?t|never mind)$/.test(lq)) {
        this.cancelCartAdd();
        return;
      }
    }

    // Display user bubble immediately
    this.opts.panel.appendMessage('user', query);
    this.opts.panel.showTypingIndicator();
    this.opts.panel.scrollToBottom();

    this.opts.ws.send({
      type: 'agent_query',
      sessionId: this.opts.sessionId,
      query,
      pageContext: this.opts.pageContextProvider.getContext(),
      siteConfig: this.buildSiteConfig(),
      addToCartSelector: this.opts.addToCartSelector,
    });
  }

  private buildSiteConfig() {
    return {
      siteUrl: this.opts.siteUrl,
      shopifyStorefrontToken: this.opts.shopifyStorefrontToken,
      searchUrl: this.opts.searchUrl,
    };
  }

  private onWsMessage(data: Record<string, unknown>): void {
    if (data.sessionId !== this.opts.sessionId) return;

    if (data.type === 'agent_typing') {
      this.opts.panel.showTypingIndicator();
      return;
    }

    if (data.type !== 'agent_response' && data.type !== 'agent_error') return;
    this.opts.panel.hideTypingIndicator();

    const resp = data as unknown as AgentResponse;
    this.renderResponse(resp);
  }

  private renderResponse(resp: AgentResponse): void {
    // Speak the message via TTS
    if (resp.message) this.opts.onTtsRequest?.(resp.message);

    switch (resp.type) {
      case 'products': {
        const products = resp.products ?? [];
        this.lastProducts = products;
        const el = products.length
          ? this.handler.renderProductList(products)
          : null;
        this.opts.panel.appendMessage('assistant', resp.message, el);
        break;
      }

      case 'comparison': {
        const products = resp.products ?? [];
        const el = products.length >= 2
          ? this.handler.renderComparison(products[0], products[1])
          : null;
        this.opts.panel.appendMessage('assistant', resp.message, el);
        break;
      }

      case 'cart_confirm': {
        if (resp.cartTarget?.product) {
          this.pendingCartProduct = resp.cartTarget.product;
          this.awaitingCartConfirmation = true;
          const el = this.handler.renderCartConfirm(
            resp.cartTarget.product,
            () => this.confirmCartAdd(),
            () => this.cancelCartAdd(),
          );
          this.opts.panel.appendMessage('assistant', resp.message, el);
        } else {
          this.opts.panel.appendMessage('assistant', resp.message);
        }
        break;
      }

      case 'navigate': {
        this.opts.panel.appendMessage('assistant', resp.message);
        if (resp.navigateTo) {
          setTimeout(() => { window.location.href = resp.navigateTo!; }, 1500);
        }
        break;
      }

      default:
        this.opts.panel.appendMessage('assistant', resp.message);
    }

    this.opts.panel.scrollToBottom();
  }

  private handleCartConfirmResult(product: ProductResult, confirmed: boolean): void {
    if (confirmed) {
      this.opts.panel.appendMessage('assistant', `Adding the ${product.title} to your cart now.`);
      this.opts.onTtsRequest?.(`Adding the ${product.title} to your cart now.`);
    } else {
      this.cancelCartAdd();
    }
  }
}
