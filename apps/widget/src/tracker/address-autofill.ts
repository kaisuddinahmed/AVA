// ============================================================================
// Address Autofill — localStorage-backed address memory for checkout pages.
//
// Detects checkout form fields (Shopify, WooCommerce, and generic patterns),
// reads any previously saved address from localStorage, and pre-fills the
// detected inputs. On form submit, captures the filled values and persists
// them for future visits.
//
// Zero external dependencies — vanilla DOM + localStorage only.
// ============================================================================

const STORAGE_KEY_PREFIX = "ava:addr:";

export interface SavedAddress {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// ── Field selector map ─────────────────────────────────────────────────────
// Each entry maps a logical address field to an ordered list of CSS selectors.
// The first matching selector wins. Covers Shopify, WooCommerce, and generic
// checkout forms found in the wild.

const FIELD_SELECTORS: Record<keyof SavedAddress, string[]> = {
  firstName: [
    'input[name="checkout[shipping_address][first_name]"]', // Shopify
    'input[name="billing_first_name"]',                     // WooCommerce
    'input[name="billing[first_name]"]',
    'input[autocomplete="given-name"]',
    'input[name*="first_name"]',
    'input[id*="first-name"]',
    'input[id*="firstName"]',
    'input[placeholder*="First name"]',
  ],
  lastName: [
    'input[name="checkout[shipping_address][last_name]"]',
    'input[name="billing_last_name"]',
    'input[name="billing[last_name]"]',
    'input[autocomplete="family-name"]',
    'input[name*="last_name"]',
    'input[id*="last-name"]',
    'input[id*="lastName"]',
    'input[placeholder*="Last name"]',
  ],
  email: [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="checkout[email]"]',
    'input[autocomplete="email"]',
    'input[id*="email"]',
  ],
  phone: [
    'input[type="tel"]',
    'input[name="phone"]',
    'input[autocomplete="tel"]',
    'input[name*="phone"]',
    'input[id*="phone"]',
  ],
  address1: [
    'input[name="checkout[shipping_address][address1]"]',
    'input[name="billing_address_1"]',
    'input[name="billing[address_line1]"]',
    'input[autocomplete="address-line1"]',
    'input[name*="address_1"]',
    'input[name*="address1"]',
    'input[id*="address-1"]',
    'input[id*="address1"]',
    'input[placeholder*="Address"]',
  ],
  address2: [
    'input[name="checkout[shipping_address][address2]"]',
    'input[name="billing_address_2"]',
    'input[name="billing[address_line2]"]',
    'input[autocomplete="address-line2"]',
    'input[name*="address_2"]',
    'input[name*="address2"]',
    'input[id*="address-2"]',
  ],
  city: [
    'input[name="checkout[shipping_address][city]"]',
    'input[name="billing_city"]',
    'input[name="billing[city]"]',
    'input[autocomplete="address-level2"]',
    'input[name*="city"]',
    'input[id*="city"]',
    'input[placeholder*="City"]',
  ],
  state: [
    'select[name="checkout[shipping_address][province]"]',
    'select[name="billing_state"]',
    'select[name="billing[state]"]',
    'input[autocomplete="address-level1"]',
    'select[autocomplete="address-level1"]',
    'select[name*="state"]',
    'select[name*="province"]',
    'input[name*="state"]',
    'input[id*="state"]',
  ],
  zip: [
    'input[name="checkout[shipping_address][zip]"]',
    'input[name="billing_postcode"]',
    'input[name="billing[postal_code]"]',
    'input[autocomplete="postal-code"]',
    'input[name*="zip"]',
    'input[name*="postcode"]',
    'input[id*="zip"]',
    'input[id*="postal"]',
  ],
  country: [
    'select[name="checkout[shipping_address][country]"]',
    'select[name="billing_country"]',
    'select[name="billing[country]"]',
    'select[autocomplete="country"]',
    'select[name*="country"]',
  ],
};

// ── Storage helpers ────────────────────────────────────────────────────────

function storageKey(): string {
  return STORAGE_KEY_PREFIX + (window.location.origin ?? "unknown");
}

export function loadSavedAddress(): SavedAddress | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw) as SavedAddress;
  } catch {
    return null;
  }
}

export function saveAddress(addr: SavedAddress): void {
  try {
    // Only save non-empty fields
    const clean: SavedAddress = {};
    for (const [k, v] of Object.entries(addr)) {
      if (v && String(v).trim()) {
        (clean as Record<string, string>)[k] = String(v).trim();
      }
    }
    if (Object.keys(clean).length > 0) {
      localStorage.setItem(storageKey(), JSON.stringify(clean));
    }
  } catch {
    // localStorage may be disabled (private mode, quota exceeded) — fail silently
  }
}

// ── Field detection ────────────────────────────────────────────────────────

function findField(selectors: string[]): HTMLInputElement | HTMLSelectElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(sel);
    if (el && !el.disabled && el.closest("form")) return el;
  }
  return null;
}

function findCheckoutForm(): HTMLFormElement | null {
  // Prefer forms with checkout-related names/ids/actions
  const candidates = Array.from(document.querySelectorAll("form"));
  for (const form of candidates) {
    const attr = `${form.id} ${form.name} ${form.action}`.toLowerCase();
    if (attr.includes("checkout") || attr.includes("billing") || attr.includes("shipping")) {
      return form;
    }
  }
  // Fallback: the form containing the most address-like inputs
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

// ── Autofill ───────────────────────────────────────────────────────────────

function setFieldValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  // React and Vue intercept native value changes via property descriptors;
  // fire both the setter and an input/change event so framework state syncs.
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;

  if (el instanceof HTMLSelectElement) {
    nativeSelectValueSetter?.call(el, value);
  } else {
    nativeInputValueSetter?.call(el, value);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Attempt to autofill checkout form fields from the saved address.
 * Returns true if at least one field was filled.
 */
export function autofillCheckout(saved: SavedAddress): boolean {
  let filled = 0;

  for (const [field, selectors] of Object.entries(FIELD_SELECTORS) as Array<[keyof SavedAddress, string[]]>) {
    const value = saved[field];
    if (!value) continue;

    const el = findField(selectors);
    if (!el) continue;

    // Don't overwrite values the user has already typed
    if (el.value && el.value.trim()) continue;

    setFieldValue(el, value);
    filled++;
  }

  return filled > 0;
}

// ── Capture on submit ──────────────────────────────────────────────────────

function captureFromForm(_form: HTMLFormElement): SavedAddress {
  const addr: SavedAddress = {};

  for (const [field, selectors] of Object.entries(FIELD_SELECTORS) as Array<[keyof SavedAddress, string[]]>) {
    const el = findField(selectors);
    if (el?.value?.trim()) {
      (addr as Record<string, string>)[field] = el.value.trim();
    }
  }

  return addr;
}

// ── Main entry ─────────────────────────────────────────────────────────────

let _attached = false;

/**
 * Initialize address memory for the current page.
 *
 * - On checkout pages: loads saved address and autofills detected fields.
 * - Attaches a submit listener to the checkout form to capture and persist
 *   the address for future visits.
 * - Idempotent — safe to call multiple times; only initialises once per page.
 */
export function initAddressAutofill(): void {
  if (_attached) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const isCheckout =
    window.location.pathname.includes("checkout") ||
    window.location.pathname.includes("billing") ||
    document.title.toLowerCase().includes("checkout") ||
    !!document.querySelector('[data-page-type="checkout"]');

  if (!isCheckout) {
    // Not a checkout page — attach a lightweight MutationObserver to detect
    // if the page transitions to checkout (SPA navigation).
    const observer = new MutationObserver(() => {
      if (
        window.location.pathname.includes("checkout") ||
        window.location.pathname.includes("billing")
      ) {
        observer.disconnect();
        _attached = false; // allow re-init on the new page
        initAddressAutofill();
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
    return;
  }

  _attached = true;

  // Wait a tick so the form is in the DOM (SPA transitions paint on next frame)
  const tryInit = () => {
    const saved = loadSavedAddress();
    if (saved) {
      autofillCheckout(saved);
    }

    const form = findCheckoutForm();
    if (form && !form.dataset.avaAutofillAttached) {
      form.dataset.avaAutofillAttached = "1";
      form.addEventListener("submit", () => {
        const captured = captureFromForm(form);
        saveAddress(captured);
      }, { once: false });
    }
  };

  // Try immediately, then retry after 500ms in case form renders async
  tryInit();
  setTimeout(tryInit, 500);
}
