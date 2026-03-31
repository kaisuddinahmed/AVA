import { FISMBridge } from "./ws-transport.js";

/**
 * BehaviorCollector — richly-contextualized behavioral event tracking.
 *
 * Tracks: page views, product views, product clicks, add-to-cart,
 * category navigation, search, scroll milestones, rage clicks,
 * exit intent, form friction, idle, and more.
 *
 * Every event includes extracted product/element context from the DOM
 * so the server and dashboard see *what* the user interacted with.
 */
export class BehaviorCollector {
  private bridge: FISMBridge;
  private observers: MutationObserver[] = [];
  private timers: number[] = [];
  private scrollDepth = 0;
  private pageEnterTime = Date.now();
  private rageClickTracker = { count: 0, lastTime: 0, lastX: 0, lastY: 0 };
  private scrollMilestones = new Set<number>();
  private scrollBackFired = false;
  private lastCartActionAt: number = 0;
  private lastProductModalId: string | null = null;
  private productModalOpenedAt: number = 0;
  private sizeGuideOpenedAt: number = 0;
  private _sizeGuideCloseFired = false;
  private sequenceNumber = 0;

  constructor(bridge: FISMBridge, _sessionId: string, _userId: string | null) {
    this.bridge = bridge;
  }

  /**
   * Extract the current (discounted) price from a price element.
   * When a product is on sale the store renders both prices inside one element:
   *   <span id="modal-price">
   *     <span class="text-red-600">$94.00</span>
   *     <span class="line-through">$110.00</span>
   *   </span>
   * Using `textContent` naïvely produces "$94.00$110.00".
   * This helper clones the element, strips any line-through children, then
   * returns the remaining trimmed text — which is always the current price.
   */
  private extractCurrentPrice(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>("[class*='line-through']").forEach((s) => s.remove());
    return clone.textContent?.trim() ?? "";
  }

  startCollecting(): void {
    this.emitPageView();
    this.trackProductViews();
    this.trackClicks();
    this.trackSort();
    this.trackScrollDepth();
    this.trackRageClicks();
    this.trackHoverIntent();
    this.trackFormFriction();
    this.trackCopyEvents();
    this.trackExitIntent();
    this.trackIdleTime();
    this.trackPageVisibility();
    this.trackSearch();
  }

  // ── Helpers ──────────────────────────────────────────────────

  /** Build a standard track event payload and send it. */
  private send(
    category: string,
    eventType: string,
    signals: Record<string, any>,
    frictionId: string | null = null,
  ): void {
    this.sequenceNumber++;
    this.bridge.sendTrackEvent({
      event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      friction_id: frictionId,
      category,
      event_type: eventType,
      raw_signals: { ...signals, session_sequence_number: this.sequenceNumber },
      page_context: {
        page_type: this.detectPageType(),
        page_url: window.location.href,
        time_on_page_ms: Date.now() - this.pageEnterTime,
        scroll_depth_pct: this.scrollDepth,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        device: this.detectDevice(),
      },
      timestamp: Date.now(),
    });
  }

  /** Extract product context from the nearest product card or modal. */
  private extractProductContext(el: HTMLElement): Record<string, any> | null {
    // 1. Inside a product card (.product-card[data-id])
    const card = el.closest(".product-card, [data-id]") as HTMLElement | null;
    if (card) {
      const name = card.querySelector("h3")?.textContent?.trim()
        || card.querySelector("[class*='product-name']")?.textContent?.trim();
      const price = card.querySelector("[data-analyze='price'], .price-tag")?.textContent?.trim();
      const category = card.querySelector("[class*='text-amber']")?.textContent?.trim()
        || card.querySelector(".category")?.textContent?.trim();
      return {
        product_id: card.dataset.id || null,
        product_name: name || null,
        product_price: price || null,
        product_category: category || null,
        source: "product_card",
      };
    }

    // 2. Inside the product detail modal (#product-modal)
    const modal = el.closest("#product-modal") || document.getElementById("product-modal");
    if (modal && !modal.classList.contains("hidden")) {
      // Use specific IDs — avoids mis-matching category span as price (both are span.font-bold)
      const name = (modal.querySelector("#modal-title") as HTMLElement)?.textContent?.trim()
        || modal.querySelector("h2")?.textContent?.trim();
      const modalPriceEl = modal.querySelector("#modal-price") as HTMLElement | null;
      const price = modalPriceEl
        ? this.extractCurrentPrice(modalPriceEl)
        : (modal.querySelector("[data-analyze='price'], .price-tag") as HTMLElement | null)?.textContent?.trim();
      const category = (modal.querySelector("#modal-category") as HTMLElement)?.textContent?.trim();
      return {
        product_name: name || null,
        product_price: price || null,
        product_category: category || null,
        source: "product_modal",
      };
    }

    return null;
  }

  /** Extract meaningful text from an element */
  private getElementLabel(el: HTMLElement): string {
    return (
      el.getAttribute("aria-label")
      || el.getAttribute("title")
      || el.textContent?.trim().slice(0, 80)
      || el.tagName
    );
  }

  // ── Page View ────────────────────────────────────────────────

  private emitPageView(): void {
    this.send("navigation", "page_view", {
      referrer: document.referrer || "direct",
      previous_page_url: document.referrer || undefined,
      page_title: document.title,
    });
  }

  // ── Product Detail View (modal open detection) ───────────────

  private trackProductViews(): void {
    const modal = document.getElementById("product-modal");
    if (!modal) return;

    const observer = new MutationObserver(() => {
      if (!modal.classList.contains("hidden")) {
        // Modal visible — extract product info
        setTimeout(() => {
          const name = modal.querySelector("h2")?.textContent?.trim();
          const modalPriceEl = modal.querySelector("#modal-price") as HTMLElement | null;
          const price = modalPriceEl
            ? this.extractCurrentPrice(modalPriceEl)
            : (modal.querySelector("[data-analyze='price'], .price-tag") as HTMLElement | null)?.textContent?.trim()
              || (modal.querySelector(".font-bold.text-2xl, .font-bold.text-xl") as HTMLElement | null)?.textContent?.trim();
          const category = modal.querySelector("[class*='text-amber']")?.textContent?.trim();

          const productKey = name || "";
          if (productKey && productKey !== this.lastProductModalId) {
            this.lastProductModalId = productKey;
            this.productModalOpenedAt = Date.now();
            this.send("product", "product_detail_view", {
              product_name: name || "Unknown",
              product_price: price || "N/A",
              product_category: category || "unknown",
            });
          }
        }, 100); // slight delay for DOM to populate
      } else {
        if (this.lastProductModalId) {
          const viewDurationMs = Date.now() - this.productModalOpenedAt;
          this.send("product", "product_detail_close", {
            product_name: this.lastProductModalId,
            view_duration_ms: viewDurationMs,
          });
        }
        this.lastProductModalId = null;
        this.productModalOpenedAt = 0;
      }
    });

    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
    this.observers.push(observer);
  }

  // ── Click Tracking (rich context) ────────────────────────────

  private trackClicks(): void {
    // Capture-phase listener: runs before store onclick handlers.
    // Used for: (1) events where the store's handler mutates DOM before bubbling,
    //           (2) filter buttons whose handler calls stopPropagation().
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      // --- Size guide close (popup removed from DOM before bubble fires) ---
      const sizeGuidePopup = document.getElementById("size-guide-popup");
      if (sizeGuidePopup && target.closest("#size-guide-popup button")) {
        const viewDuration = this.sizeGuideOpenedAt
          ? Date.now() - this.sizeGuideOpenedAt
          : 0;
        this.send("product", "size_guide_close", {
          view_duration_ms: viewDuration,
          view_duration_s: Math.round(viewDuration / 1000),
        });
        this.sizeGuideOpenedAt = 0;
        this._sizeGuideCloseFired = true; // suppress bubble-phase generic fallback
      }

      // --- Wishlist top-nav button (calls stopPropagation — must be in capture phase) ---
      // Only emit when the dropdown is currently hidden (i.e., user is opening it).
      // When collapsing, the dropdown is already visible — skip tracking in that case.
      if (target.closest("#wishlist-btn")) {
        const dropdown = document.getElementById("wishlist-dropdown");
        const isOpening = dropdown?.classList.contains("hidden") ?? true;
        if (isOpening) {
          let count = 0;
          try {
            const wState = (window as any).wishlistState as Map<string, boolean> | undefined;
            if (wState) {
              count = Array.from(wState.values()).filter(Boolean).length;
            } else {
              const saved = localStorage.getItem("wishlist");
              if (saved) {
                const entries = JSON.parse(saved) as Array<[string, boolean]>;
                count = entries.filter(([, active]) => active).length;
              }
            }
          } catch { /* ignore parse errors */ }
          this.send("engagement", "wishlist_view", { item_count: count });
        }
      }

      // --- Wishlist dropdown remove (✕) button (calls stopPropagation — capture runs before it) ---
      const wishlistRemoveBtn = target.closest(
        "#wishlist-items button[title='Remove from wishlist']",
      ) as HTMLElement | null;
      if (wishlistRemoveBtn) {
        const row = wishlistRemoveBtn.closest("div.flex") as HTMLElement | null;
        const name = (row?.querySelector(".font-bold") as HTMLElement)?.textContent?.trim() || null;
        const price = (row?.querySelector(".text-gray-400") as HTMLElement)?.textContent?.trim() || null;
        this.send("product", "wishlist_remove", {
          product_name: name,
          product_price: price,
          source: "wishlist_dropdown",
        });
      }

      // --- Filter buttons (store's handler calls stopPropagation — capture runs before it) ---
      const filterBtn = target.closest(".filter-btn") as HTMLElement | null;
      if (filterBtn) {
        const filterType = filterBtn.dataset.filterType || (filterBtn.dataset.filter === "sale" ? "sale" : "price");
        const filterVal = filterBtn.dataset.filter;
        const filterLabel = filterBtn.textContent?.trim();
        if (filterVal) {
          this.send("navigation", "filter_applied", {
            filter_type: filterType,
            filter_value: filterVal,
            filter_label: filterLabel,
          });
        }
      }
    }, { capture: true });

    // Bubble-phase listener: main click handler.
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      // --- Suppress bubble if capture-phase already handled this event ---
      if (this._sizeGuideCloseFired) {
        this._sizeGuideCloseFired = false;
        return;
      }

      // --- Color/Size filter toggle buttons (just open/close dropdown — not meaningful to track) ---
      if (target.closest("#color-filter-btn") || target.closest("#size-filter-btn")) {
        return;
      }

      // --- Add to Cart (by ID covers modal button whose text changes to "Added to Bag") ---
      const atcButton = (
        target.closest("[data-action='add-to-cart'], .add-to-cart") ||
        target.closest("#modal-add-cart")
      ) as HTMLElement | null;
      const isAtcByText = !atcButton && (
        target.closest("button")?.textContent?.toLowerCase().includes("add to cart")
      );
      if (atcButton || isAtcByText) {
        const product = this.extractProductContext(target);
        const qtyEl = document.getElementById("modal-qty");
        const qty = parseInt(qtyEl?.textContent?.trim() || "1");
        this.lastCartActionAt = Date.now();
        this.send("cart", "add_to_cart", {
          ...product,
          quantity: qty,
          button_text: "Add to Cart",
        });
        return;
      }

      // --- Quick-add + button on product card ---
      const quickAdd = target.closest(".btn-add[data-id]") as HTMLElement | null;
      if (quickAdd) {
        const product = this.extractProductContext(target);
        this.lastCartActionAt = Date.now();
        this.send("cart", "quick_add", {
          product_id: quickAdd.dataset.id,
          ...product,
        });
        return;
      }

      // --- Product card click (opens modal) ---
      // Skipped: the MutationObserver on #product-modal fires a
      // "product_detail_view" event which is richer and avoids duplicates.
      const productTrigger = target.closest(".product-trigger") as HTMLElement | null;
      if (productTrigger) {
        return; // let product_detail_view handle it
      }

      // --- Cart button in nav bar (check before nav_click — cart button has data-nav="internal") ---
      const cartCountEl = document.getElementById("cart-count");
      if (cartCountEl) {
        const cartBtn = cartCountEl.closest("button, a");
        if (cartBtn && (cartBtn === target || cartBtn.contains(target))) {
          const count = cartCountEl.textContent?.trim() || "0";
          const totalEl = document.getElementById("cart-total");
          const total = totalEl?.textContent?.trim() || "$0.00";
          this.send("cart", "cart_view", {
            cart_count: count,
            cart_total: total,
          });
          return;
        }
      }

      // --- Top-level gender nav buttons (Men / Women — .nav-link, no data-cat) ---
      const topNavBtn = target.closest(".nav-link") as HTMLElement | null;
      if (topNavBtn) {
        const label = topNavBtn.textContent?.trim();
        if (label) {
          this.send("navigation", "category_browse", {
            category: label,
            gender: label.toLowerCase(),
            level: "top",
          });
          return;
        }
      }

      // --- Subcategory navigation links (.nav-category or .nav-menu-action with data-gender) ---
      const navCategory = target.closest(".nav-category, .nav-menu-action, [data-cat]") as HTMLElement | null;
      if (navCategory) {
        const gender = navCategory.getAttribute("data-gender");       // "men" | "women" | null
        const label  = navCategory.getAttribute("data-label") || navCategory.textContent?.trim();
        const catType = navCategory.getAttribute("data-cat");
        const genderPart = gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : "";
        const category = [genderPart, label].filter(Boolean).join(": "); // "Men: Shoes" | "Women: Accessories"
        this.send("navigation", "category_browse", {
          category,
          gender:        gender    || null,
          sub_category:  label     || null,
          cat_type:      catType   || null,
          level: "sub",
        });
        return;
      }

      // --- Nav links ---
      const navLink = target.closest("[data-nav], nav a") as HTMLElement | null;
      if (navLink) {
        this.send("navigation", "nav_click", {
          link_text: navLink.textContent?.trim(),
          href: (navLink as HTMLAnchorElement).href || null,
        });
        return;
      }

      // --- Color/Size selection ---
      const colorOption = target.closest(".color-option, [data-color]") as HTMLElement | null;
      if (colorOption) {
        const product = this.extractProductContext(target);
        this.send("product", "color_select", {
          color: colorOption.getAttribute("data-color") || colorOption.getAttribute("title") || "unknown",
          ...product,
        });
        return;
      }

      const sizeOption = target.closest(".size-option, [data-size]") as HTMLElement | null;
      if (sizeOption) {
        const product = this.extractProductContext(target);
        this.send("product", "size_select", {
          size: sizeOption.textContent?.trim() || sizeOption.getAttribute("data-size"),
          ...product,
        });
        return;
      }

      // --- Description Read More / Show Less toggle ---
      // Store's onclick changes text before bubbling, so we read the *new* desc class
      // state: if desc now has line-clamp-4 it was just collapsed; if not, just expanded.
      if (target.id === "modal-read-more" || target.closest("#modal-read-more")) {
        const desc = document.getElementById("modal-desc");
        const justExpanded = !desc?.classList.contains("line-clamp-4");
        const product = this.extractProductContext(target);
        this.send("product", "description_toggle", {
          action: justExpanded ? "expanded" : "collapsed",
          ...product,
        });
        return;
      }

      // --- Wishlist button (SVG-only button, falls through generic without specific check) ---
      if (target.closest("#modal-wishlist-btn")) {
        const product = this.extractProductContext(target);
        const wishlistBtn = document.getElementById("modal-wishlist-btn");
        // After store onclick runs, bg-amber-500/10 class indicates wishlisted state
        const justAdded = wishlistBtn?.classList.contains("bg-amber-500/10") ?? false;
        this.send("product", justAdded ? "wishlist_add" : "wishlist_remove", {
          ...product,
        });
        return;
      }

      // --- Size guide open ---
      if (target.closest("#btn-size-guide")) {
        this.sizeGuideOpenedAt = Date.now();
        const product = this.extractProductContext(target);
        this.send("product", "size_guide_open", { ...product });
        return;
      }

      // --- Quantity change (+/-) ---
      // Use trim() because button HTML has surrounding whitespace.
      // Read #modal-qty AFTER store's updateModalQty updates the span.
      const btnText = target.textContent?.trim();
      if (target.tagName === "BUTTON" && (btnText === "+" || btnText === "-")) {
        const product = this.extractProductContext(target);
        const qtyEl = document.getElementById("modal-qty");
        const newQty = parseInt(qtyEl?.textContent?.trim() || "1");
        this.send("cart", "quantity_change", {
          direction: btnText === "+" ? "increase" : "decrease",
          current_qty: newQty,
          ...product,
        });
        return;
      }

      // --- Tab click (Details/Returns/Reviews inside modal) ---
      const modal = document.getElementById("product-modal");
      if (modal && !modal.classList.contains("hidden") && target.closest("button, [role='tab']")) {
        const text = target.textContent?.trim();
        if (text && ["Details", "Returns", "Reviews"].includes(text)) {
          const product = this.extractProductContext(target);
          this.send("product", "tab_view", {
            tab_name: text,
            ...product,
          });
          return;
        }
      }

      // --- Cart icon ---
      if (target.closest("#cart-count, .cart-icon, [data-cart]")) {
        this.send("cart", "cart_icon_click", {
          cart_count: document.getElementById("cart-count")?.textContent?.trim() || "0",
        });
        return;
      }

      // --- Generic interactive click (last resort) ---
      const interactive = target.closest("a, button") as HTMLElement | null;
      if (interactive) {
        const product = this.extractProductContext(target);
        const label = this.getElementLabel(interactive);
        if (label.length <= 1 && !product) return;
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        this.send("engagement", "click", {
          element: interactive.tagName,
          text: label,
          x_pct: Math.round((e.clientX / vw) * 1000) / 1000,
          y_pct: Math.round((e.clientY / vh) * 1000) / 1000,
          client_x: e.clientX,
          client_y: e.clientY,
          viewport_width: vw,
          viewport_height: vh,
          ...product,
        });
      }
    });
  }

  // ── Search ───────────────────────────────────────────────────

  private trackSearch(): void {
    const searchInput = document.getElementById("store-search") as HTMLInputElement | null;
    if (!searchInput) return;

    let debounce: number | null = null;
    searchInput.addEventListener("input", () => {
      if (debounce) clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        const query = searchInput.value.trim();
        if (query.length >= 2) {
          this.send("search", "search_query", {
            query,
            query_length: query.length,
          });
        }
      }, 800);
    });
  }

  // ── Sort ─────────────────────────────────────────────────────

  private trackSort(): void {
    const sortSelect = document.getElementById("sort-select") as HTMLSelectElement | null;
    if (!sortSelect) return;
    sortSelect.addEventListener("change", () => {
      const selectedOption = sortSelect.options[sortSelect.selectedIndex];
      this.send("navigation", "sort_change", {
        sort_value: sortSelect.value,
        sort_name: selectedOption?.text || sortSelect.value,
      });
    });
  }

  // ── Scroll Depth ─────────────────────────────────────────────

  private trackScrollDepth(): void {
    if (this.detectPageType() === "checkout") return;

    const handler = () => {
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      const scrolled = window.scrollY + window.innerHeight;
      const depth = Math.round((scrolled / docHeight) * 100);
      this.scrollDepth = Math.max(this.scrollDepth, depth);

      for (const m of [25, 50, 75, 100]) {
        if (depth >= m && !this.scrollMilestones.has(m)) {
          this.scrollMilestones.add(m);
          this.send("navigation", "scroll_depth", { depth_pct: m });
        }
      }

      if (depth >= 95 && !this.scrollMilestones.has(95)) {
        const clicks = parseInt(sessionStorage.getItem("sa_click_count") || "0");
        if (clicks === 0) {
          this.scrollMilestones.add(95);
          this.send("navigation", "scroll_without_click", { scroll_depth: depth, click_count: 0 }, "F015");
        }
      }

      // ── Scroll-back detection ─────────────────────────────────
      // Scroll-back-to-top: was deep (≥50%), now near top (≤15%)
      if (!this.scrollBackFired && this.scrollDepth >= 50 && depth <= 15) {
        this.scrollBackFired = true;
        this.send("navigation", "scroll_back_to_top", {
          peak_depth_pct: this.scrollDepth,
          current_depth_pct: depth,
        });
      }
      // Reset so it can fire again if user scrolls deep again
      if (depth >= 50) this.scrollBackFired = false;

      // Scroll-back after cart action: within 60s of add-to-cart, scrolled up ≥30%
      if (
        this.lastCartActionAt > 0 &&
        Date.now() - this.lastCartActionAt < 60000 &&
        this.scrollDepth - depth >= 30
      ) {
        this.lastCartActionAt = 0; // fire once per cart action
        this.send("navigation", "scroll_back_after_cart", {
          peak_depth_pct: this.scrollDepth,
          current_depth_pct: depth,
        });
      }
    };
    window.addEventListener("scroll", handler, { passive: true });
  }

  // ── Rage Clicks ──────────────────────────────────────────────

  private trackRageClicks(): void {
    document.addEventListener("click", (e) => {
      const now = Date.now();
      const dx = Math.abs(e.clientX - this.rageClickTracker.lastX);
      const dy = Math.abs(e.clientY - this.rageClickTracker.lastY);

      if (now - this.rageClickTracker.lastTime < 500 && dx < 30 && dy < 30) {
        this.rageClickTracker.count++;
        if (this.rageClickTracker.count >= 3) {
          const target = e.target as HTMLElement;
          const product = this.extractProductContext(target);
          this.send("technical", "rage_click", {
            target_element: target.tagName,
            target_text: target.textContent?.trim().slice(0, 50),
            click_count: this.rageClickTracker.count,
            ...product,
          }, "F400");
          this.rageClickTracker.count = 0;
        }
      } else {
        this.rageClickTracker.count = 1;
      }

      this.rageClickTracker.lastTime = now;
      this.rageClickTracker.lastX = e.clientX;
      this.rageClickTracker.lastY = e.clientY;

      const count = parseInt(sessionStorage.getItem("sa_click_count") || "0");
      sessionStorage.setItem("sa_click_count", String(count + 1));
    });
  }

  // ── Hover Intent ─────────────────────────────────────────────

  private trackHoverIntent(): void {
    let hoverTimer: number | null = null;

    document.addEventListener("mouseover", (e) => {
      const target = e.target as HTMLElement;
      // Use exact match on direct button text (not .includes) to avoid
      // parent containers whose aggregated textContent contains "add to cart".
      const isATC =
        target.closest("[data-action='add-to-cart']")
        || target.closest(".add-to-cart")
        || (target.tagName === "BUTTON" && target.textContent?.trim().toLowerCase() === "add to cart");

      if (isATC) {
        hoverTimer = window.setTimeout(() => {
          const product = this.extractProductContext(target);
          this.send("product", "hover_add_to_cart", {
            hover_duration_ms: 3000,
            ...product,
          }, "F058");
        }, 3000);
      }
    });

    document.addEventListener("mouseout", () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    });
  }

  // ── Form Friction ────────────────────────────────────────────

  private trackFormFriction(): void {
    let fieldErrorCount = 0;

    document.addEventListener("invalid", (e) => {
      fieldErrorCount++;
      if (fieldErrorCount >= 2) {
        this.send("checkout", "form_validation_error", {
          error_count: fieldErrorCount,
          field_name: (e.target as HTMLInputElement)?.name,
        }, "F091");
      }
    }, true);

    document.addEventListener("focusin", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === "INPUT" && target.type !== "hidden") {
        target.dataset.saFocusTime = String(Date.now());
      }
    });

    document.addEventListener("focusout", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.dataset.saFocusTime) {
        const duration = Date.now() - parseInt(target.dataset.saFocusTime);
        if (duration > 30000 && (target.name?.includes("card") || target.name?.includes("payment"))) {
          this.send("checkout", "payment_hesitation", {
            field_name: target.name,
            hesitation_ms: duration,
          }, "F094");
        }
      }
    });
  }

  // ── Copy Events ──────────────────────────────────────────────

  private trackCopyEvents(): void {
    document.addEventListener("copy", () => {
      const selection = window.getSelection()?.toString() || "";
      if (/\$[\d,.]+/.test(selection)) {
        this.send("product", "copy_price", { copied_text: selection.slice(0, 50) }, "F060");
      } else if (selection.length > 3) {
        this.send("engagement", "copy_text", { copied_text: selection.slice(0, 80) });
      }
    });
  }

  // ── Exit Intent ──────────────────────────────────────────────

  private trackExitIntent(): void {
    document.addEventListener("mouseout", (e) => {
      if ((e as MouseEvent).clientY <= 0 && (e as MouseEvent).relatedTarget === null) {
        const cartValue = parseFloat(sessionStorage.getItem("sa_cart_value") || "0");
        if (cartValue > 0) {
          this.send("cart", "exit_intent_with_cart", { cart_value: cartValue }, "F068");
        }
      }
    });
  }

  // ── Idle Time ────────────────────────────────────────────────

  private trackIdleTime(): void {
    let idleTimer: number;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        const cartItems = parseInt(sessionStorage.getItem("sa_cart_items") || "0");
        if (cartItems > 0) {
          this.send("cart", "idle_with_cart", { idle_ms: 300000, cart_items: cartItems }, "F069");
        }
      }, 300000);
    };
    ["mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, resetIdle, { passive: true });
    });
    resetIdle();
  }

  // ── Page Visibility ──────────────────────────────────────────

  private trackPageVisibility(): void {
    let hiddenAt: number | null = null;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt) {
        const away = Date.now() - hiddenAt;
        if (away > 60000) {
          this.send("engagement", "tab_return", { away_duration_ms: away });
        }
        hiddenAt = null;
      }
    });
  }

  // ── Utility ──────────────────────────────────────────────────

  private detectPageType(): string {
    const path = window.location.pathname.toLowerCase();
    if (path === "/" || path === "/home") return "landing";
    if (path.includes("/category") || path.includes("/collection")) return "category";
    if (path.includes("/search")) return "search_results";
    if (path.includes("/product") || path.includes("/item") || path.includes("/p/")) return "pdp";
    if (path.includes("/cart") || path.includes("/bag")) return "cart";
    if (path.includes("/checkout")) return "checkout";
    if (path.includes("/account") || path.includes("/profile")) return "account";
    return "other";
  }

  private detectDevice(): "mobile" | "tablet" | "desktop" {
    const w = window.innerWidth;
    if (w < 768) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  stopCollecting(): void {
    this.observers.forEach((o) => o.disconnect());
    this.timers.forEach((t) => clearTimeout(t));
  }
}
