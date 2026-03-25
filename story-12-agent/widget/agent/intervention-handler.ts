/**
 * Intervention Handler — Story 12: Conversational Shopping Agent
 * Copy to: apps/widget/src/agent/intervention-handler.ts
 *
 * Renders all agent-driven UI components inside the widget panel:
 *   • Product list (up to 5 product cards)
 *   • Side-by-side comparison card
 *   • Add-to-cart confirmation prompt
 *   • Cart execution via verified selector from onboarding
 *
 * All elements are built as vanilla DOM nodes — no framework dependency.
 * Styles use inline CSS so they work inside the widget shadow DOM.
 */

import type { ProductResult } from './agent.types.js';

// ─── Styles (inline for shadow DOM compatibility) ─────────────────────────────

const S = {
  productList: 'display:flex;flex-direction:column;gap:8px;width:100%;margin-top:4px',
  card: [
    'display:flex;align-items:center;gap:10px;padding:10px 12px;',
    'background:#fff;border:1px solid #e5e7eb;border-radius:10px;',
    'cursor:pointer;transition:border-color 0.15s;',
  ].join(''),
  cardHover: 'border-color:#6366f1',
  img: 'width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0',
  cardBody: 'flex:1;min-width:0',
  title: 'font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
  price: 'font-size:12px;color:#6366f1;margin-top:2px',
  attrs: 'font-size:11px;color:#6b7280;margin-top:2px',
  addBtn: [
    'flex-shrink:0;padding:5px 10px;font-size:11px;font-weight:600;',
    'background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;',
    'white-space:nowrap',
  ].join(''),
  compGrid: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-top:4px',
  compCard: [
    'display:flex;flex-direction:column;align-items:center;text-align:center;',
    'padding:12px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:10px',
  ].join(''),
  compImg: 'width:64px;height:64px;object-fit:cover;border-radius:8px;margin-bottom:6px',
  compTitle: 'font-size:12px;font-weight:600;color:#111;line-height:1.3',
  compPrice: 'font-size:13px;font-weight:700;color:#6366f1;margin-top:4px',
  compAttrs: 'font-size:11px;color:#6b7280;margin-top:4px;line-height:1.4',
  confirmBox: [
    'padding:12px;background:#f0f0ff;border:1px solid #c7d2fe;',
    'border-radius:10px;width:100%;margin-top:4px',
  ].join(''),
  confirmTitle: 'font-size:12px;font-weight:600;color:#4338ca;margin-bottom:8px',
  confirmBtns: 'display:flex;gap:8px;margin-top:10px',
  yesBtn: [
    'flex:1;padding:8px;font-size:12px;font-weight:600;',
    'background:#6366f1;color:#fff;border:none;border-radius:7px;cursor:pointer',
  ].join(''),
  noBtn: [
    'flex:1;padding:8px;font-size:12px;font-weight:600;',
    'background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:7px;cursor:pointer',
  ].join(''),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, attrs?: Record<string, string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.setAttribute('style', css);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

function fmt(price: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export interface InterventionHandlerOptions {
  addToCartSelector?: string;
  onCartConfirm?: (product: ProductResult, confirmed: boolean) => void;
}

export class InterventionHandler {
  constructor(private opts: InterventionHandlerOptions = {}) {}

  // ── Product list ────────────────────────────────────────────────────────────

  renderProductList(products: ProductResult[]): HTMLElement {
    const list = el('div', S.productList);
    products.slice(0, 5).forEach(p => list.appendChild(this.buildProductCard(p)));
    return list;
  }

  private buildProductCard(p: ProductResult): HTMLElement {
    const card = el('div', S.card);
    card.addEventListener('mouseenter', () => card.setAttribute('style', S.card + S.cardHover));
    card.addEventListener('mouseleave', () => card.setAttribute('style', S.card));

    // Image
    if (p.imageUrl) {
      const img = el('img', S.img, { src: p.imageUrl, alt: p.title, loading: 'lazy' });
      card.appendChild(img);
    }

    // Body
    const body = el('div', S.cardBody);
    const title = el('div', S.title);
    title.textContent = p.title;
    const price = el('div', S.price);
    price.textContent = fmt(p.price, p.currency);
    body.appendChild(title);
    body.appendChild(price);
    if (p.matchedAttributes.length) {
      const attrs = el('div', S.attrs);
      attrs.textContent = p.matchedAttributes.join(' · ');
      body.appendChild(attrs);
    }
    card.appendChild(body);

    // Navigate to product page on card click
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if (p.productUrl) window.open(p.productUrl, '_blank');
    });

    // Add to cart button
    const btn = el('button', S.addBtn);
    btn.textContent = 'Add';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.opts.onCartConfirm?.(p, true);
    });
    card.appendChild(btn);

    return card;
  }

  // ── Comparison card ─────────────────────────────────────────────────────────

  renderComparison(a: ProductResult, b: ProductResult): HTMLElement {
    const grid = el('div', S.compGrid);
    [a, b].forEach(p => {
      const card = el('div', S.compCard);

      if (p.imageUrl) {
        const img = el('img', S.compImg, { src: p.imageUrl, alt: p.title });
        card.appendChild(img);
      }
      const title = el('div', S.compTitle);
      title.textContent = p.title;
      card.appendChild(title);

      const price = el('div', S.compPrice);
      price.textContent = fmt(p.price, p.currency);
      card.appendChild(price);

      if (p.matchedAttributes.length) {
        const attrs = el('div', S.compAttrs);
        attrs.textContent = p.matchedAttributes.map(a => `✓ ${a}`).join('\n');
        attrs.style.whiteSpace = 'pre-line';
        card.appendChild(attrs);
      }

      // View / add buttons
      const btnRow = el('div', 'display:flex;gap:6px;margin-top:8px;width:100%');
      const view = el('button', S.noBtn.replace('flex:1', 'flex:1;font-size:11px'));
      view.textContent = 'View';
      view.addEventListener('click', () => p.productUrl && window.open(p.productUrl, '_blank'));
      const add = el('button', S.yesBtn.replace('flex:1', 'flex:1;font-size:11px'));
      add.textContent = 'Add';
      add.addEventListener('click', () => this.opts.onCartConfirm?.(p, true));
      btnRow.appendChild(view);
      btnRow.appendChild(add);
      card.appendChild(btnRow);

      grid.appendChild(card);
    });
    return grid;
  }

  // ── Cart confirmation ────────────────────────────────────────────────────────

  renderCartConfirm(
    product: ProductResult,
    onYes: () => void,
    onNo: () => void,
  ): HTMLElement {
    const box = el('div', S.confirmBox);

    const title = el('div', S.confirmTitle);
    title.textContent = `${product.title} — ${fmt(product.price, product.currency)}`;
    box.appendChild(title);

    const btns = el('div', S.confirmBtns);
    const yes = el('button', S.yesBtn);
    yes.textContent = '✓ Add to cart';
    yes.addEventListener('click', onYes);
    const no = el('button', S.noBtn);
    no.textContent = 'Cancel';
    no.addEventListener('click', onNo);
    btns.appendChild(yes);
    btns.appendChild(no);
    box.appendChild(btns);

    return box;
  }

  // ── Cart execution (via onboarding-verified selectors) ───────────────────────

  /**
   * Attempts to add a product to cart by triggering the merchant\'s verified
   * add-to-cart button via selector mapping from onboarding.
   *
   * Operates through the widget\'s shadow DOM bridge: finds the button in the
   * host document (not the shadow DOM) and dispatches a click.
   */
  executeCartAdd(product: ProductResult): void {
    const selector = this.opts.addToCartSelector;
    if (!selector) {
      console.warn('[AVA agent] No add-to-cart selector configured — cannot auto-add');
      return;
    }

    try {
      // Walk through shadow DOM boundaries to reach host document
      const btn = document.querySelector(selector) as HTMLElement | null;
      if (!btn) {
        console.warn('[AVA agent] add-to-cart button not found:', selector);
        return;
      }
      btn.click();
      this.opts.onCartConfirm?.(product, true);
    } catch (err) {
      console.error('[AVA agent] Cart add failed:', err);
    }
  }
}
