// ============================================================================
// Address Autofill — server-persisted shipping address for repeat visitors.
//
// Flow:
//   1. On checkout page, fetch saved address from server (visitorKey + siteUrl)
//   2. If address found AND isRepeatVisitor: show offer banner
//   3. Shopper taps "Yes, fill it in" or says "yes" → autofill fields
//   4. On form submit: capture non-PII fields, POST to server (explicit save)
//   5. "Forget my address" → DELETE from server
//
// No PII stored: no name, email, phone. Scoped to visitorKey + siteUrl.
// Zero external dependencies — vanilla DOM + fetch only.
// ============================================================================

const SERVER_BASE: string =
  (window as Window & { __AVA_CONFIG__?: { serverUrl?: string } }).__AVA_CONFIG__?.serverUrl ?? "";

// ── Address shape (no PII) ─────────────────────────────────────────────────

export interface SavedAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  lastUsedAt?: string;
}

// ── Field selector map ─────────────────────────────────────────────────────

type AddressField = "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country";

const FIELD_SELECTORS: Record<AddressField, string[]> = {
  addressLine1: [
    'input[name="checkout[shipping_address][address1]"]',
    'input[name="billing_address_1"]',
    'input[name="billing[address_line1]"]',
    'input[autocomplete="address-line1"]',
    'input[name*="address1"]',
    'input[name*="address_line_1"]',
    'input[id*="address1"]',
    'input[placeholder*="Address"]',
  ],
  addressLine2: [
    'input[name="checkout[shipping_address][address2]"]',
    'input[name="billing_address_2"]',
    'input[autocomplete="address-line2"]',
    'input[name*="address2"]',
    'input[name*="address_line_2"]',
    'input[id*="address2"]',
    'input[placeholder*="Apartment"]',
  ],
  city: [
    'input[name="checkout[shipping_address][city]"]',
    'input[name="billing_city"]',
    'input[autocomplete="address-level2"]',
    'input[name*="city"]',
    'input[id*="city"]',
    'input[placeholder*="City"]',
  ],
  state: [
    'select[name="checkout[shipping_address][province]"]',
    'select[name="billing_state"]',
    'select[autocomplete="address-level1"]',
    'input[autocomplete="address-level1"]',
    'select[name*="state"]',
    'select[name*="province"]',
    'input[name*="state"]',
    'input[id*="state"]',
  ],
  postalCode: [
    'input[name="checkout[shipping_address][zip]"]',
    'input[name="billing_postcode"]',
    'input[autocomplete="postal-code"]',
    'input[name*="zip"]',
    'input[name*="postal"]',
    'input[id*="zip"]',
    'input[id*="postal"]',
    'input[placeholder*="ZIP"]',
    'input[placeholder*="Postal"]',
  ],
  country: [
    'select[name="checkout[shipping_address][country]"]',
    'select[name="billing_country"]',
    'select[autocomplete="country"]',
    'select[name*="country"]',
    'input[autocomplete="country"]',
  ],
};

// ── DOM helpers ────────────────────────────────────────────────────────────

function findField(selectors: string[]): HTMLInputElement | HTMLSelectElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(sel);
    if (el && !el.disabled && el.closest("form")) return el;
  }
  return null;
}

function setFieldValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  if (el instanceof HTMLSelectElement) {
    nativeSelectSetter?.call(el, value);
  } else {
    nativeInputSetter?.call(el, value);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function findCheckoutForm(): HTMLFormElement | null {
  const candidates = Array.from(document.querySelectorAll("form"));
  for (const form of candidates) {
    const attr = `${form.id} ${form.name} ${form.action}`.toLowerCase();
    if (attr.includes("checkout") || attr.includes("billing") || attr.includes("shipping")) return form;
  }
  return candidates
    .map((f) => ({
      form: f,
      score: [
        'input[autocomplete="address-line1"]',
        'input[name*="address"]',
        'input[autocomplete="postal-code"]',
        'input[name*="zip"]',
        'input[name*="city"]',
      ].filter((s) => f.querySelector(s)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .find(({ score }) => score >= 2)?.form ?? null;
}

// ── Server API ─────────────────────────────────────────────────────────────

async function fetchSavedAddress(visitorKey: string, siteUrl: string): Promise<SavedAddress | null> {
  try {
    const resp = await fetch(
      `${SERVER_BASE}/api/address?visitorKey=${encodeURIComponent(visitorKey)}&siteUrl=${encodeURIComponent(siteUrl)}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { address: SavedAddress | null };
    return data.address;
  } catch {
    return null;
  }
}

async function persistAddress(visitorKey: string, siteUrl: string, addr: SavedAddress): Promise<void> {
  try {
    await fetch(`${SERVER_BASE}/api/address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorKey, siteUrl, ...addr }),
    });
  } catch {
    // fire-and-forget
  }
}

/** Called from widget settings panel — removes address from server. */
export async function forgetAddress(visitorKey: string, siteUrl: string): Promise<void> {
  try {
    await fetch(
      `${SERVER_BASE}/api/address?visitorKey=${encodeURIComponent(visitorKey)}&siteUrl=${encodeURIComponent(siteUrl)}`,
      { method: "DELETE" },
    );
  } catch {
    // fire-and-forget
  }
}

// ── Autofill ───────────────────────────────────────────────────────────────

function autofillCheckout(saved: SavedAddress): boolean {
  let filled = 0;
  for (const [field, selectors] of Object.entries(FIELD_SELECTORS) as Array<[AddressField, string[]]>) {
    const value = saved[field as AddressField];
    if (!value) continue;
    const el = findField(selectors);
    if (!el) continue;
    if (el.value && el.value.trim()) continue; // don't overwrite existing input
    setFieldValue(el, value);
    filled++;
  }
  return filled > 0;
}

function captureFromForm(): SavedAddress | null {
  const addr: Partial<SavedAddress> = {};
  for (const [field, selectors] of Object.entries(FIELD_SELECTORS) as Array<[AddressField, string[]]>) {
    const el = findField(selectors);
    if (el?.value?.trim()) {
      (addr as Record<string, string>)[field] = el.value.trim();
    }
  }
  if (!addr.addressLine1 || !addr.city || !addr.postalCode) return null;
  return addr as SavedAddress;
}

// ── Offer banner ───────────────────────────────────────────────────────────

let _offerEl: HTMLElement | null = null;

function showOfferBanner(onAccept: () => void, onDecline: () => void): void {
  if (_offerEl) return;

  const banner = document.createElement("div");
  banner.setAttribute("data-ava-autofill-offer", "1");
  banner.style.cssText = [
    "position:fixed", "bottom:80px", "right:20px", "z-index:2147483647",
    "background:#0d1f27", "border:1px solid rgba(232,155,59,0.5)",
    "border-radius:8px", "padding:12px 16px", "max-width:280px",
    "font-family:system-ui,sans-serif", "box-shadow:0 4px 16px rgba(0,0,0,0.4)",
  ].join(";");

  banner.innerHTML = `
    <div style="font-size:12px;color:#e89b3b;font-weight:700;margin-bottom:6px;">AVA</div>
    <div style="font-size:11px;color:#ccc;line-height:1.4;margin-bottom:10px;">
      Want me to fill in your shipping address from last time?
    </div>
    <div style="display:flex;gap:8px;">
      <button data-ava-accept style="flex:1;background:#e89b3b;color:#000;border:none;
        border-radius:4px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;">
        Yes, fill it in
      </button>
      <button data-ava-decline style="flex:1;background:transparent;color:#888;
        border:1px solid #333;border-radius:4px;padding:6px 10px;font-size:11px;cursor:pointer;">
        No thanks
      </button>
    </div>`;

  banner.querySelector("[data-ava-accept]")?.addEventListener("click", () => {
    onAccept();
    banner.remove();
    _offerEl = null;
  });
  banner.querySelector("[data-ava-decline]")?.addEventListener("click", () => {
    onDecline();
    banner.remove();
    _offerEl = null;
  });

  document.body.appendChild(banner);
  _offerEl = banner;
}

export function dismissOfferBanner(): void {
  _offerEl?.remove();
  _offerEl = null;
}

// ── Voice confirmation hook ────────────────────────────────────────────────
// voice-responder checks getPendingAddressAccept() when transcript is "yes"
// and the offer banner is shown.

let _pendingAccept: (() => void) | null = null;

export function getPendingAddressAccept(): (() => void) | null {
  return _pendingAccept;
}

export function clearPendingAddressAccept(): void {
  _pendingAccept = null;
}

// ── Main entry ─────────────────────────────────────────────────────────────

let _attached = false;

/**
 * Initialize address autofill for the current page.
 *
 * @param visitorKey      Anonymous visitor fingerprint (no PII)
 * @param siteUrl         Merchant site URL — scopes the address server-side
 * @param isRepeatVisitor Whether this visitor has checked out before
 */
export async function initAddressAutofill(
  visitorKey: string,
  siteUrl: string,
  isRepeatVisitor: boolean,
): Promise<void> {
  if (_attached) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const isCheckout =
    window.location.pathname.includes("checkout") ||
    window.location.pathname.includes("billing") ||
    document.title.toLowerCase().includes("checkout") ||
    !!document.querySelector('[data-page-type="checkout"]');

  if (!isCheckout) {
    // Watch for SPA navigation to checkout
    const observer = new MutationObserver(() => {
      if (
        window.location.pathname.includes("checkout") ||
        window.location.pathname.includes("billing")
      ) {
        observer.disconnect();
        _attached = false;
        initAddressAutofill(visitorKey, siteUrl, isRepeatVisitor);
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
    return;
  }

  _attached = true;

  const tryInit = async () => {
    if (isRepeatVisitor) {
      const saved = await fetchSavedAddress(visitorKey, siteUrl);
      if (saved) {
        const doFill = () => {
          autofillCheckout(saved);
        };

        // Register for voice "yes" confirmation
        _pendingAccept = () => { doFill(); _pendingAccept = null; };

        showOfferBanner(
          () => { doFill(); _pendingAccept = null; },
          () => { _pendingAccept = null; },
        );
      }
    }

    // Attach form submit listener — captures and persists on explicit checkout
    const form = findCheckoutForm();
    if (form && !form.dataset.avaAutofillAttached) {
      form.dataset.avaAutofillAttached = "1";
      form.addEventListener("submit", () => {
        const captured = captureFromForm();
        if (captured) {
          persistAddress(visitorKey, siteUrl, captured);
        }
      }, { once: false });
    }
  };

  await tryInit();
  setTimeout(tryInit, 500);
}
