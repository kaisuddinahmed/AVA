# AVA — Shopify App Store Listing

Submission checklist for AVA's Shopify App Store listing. Mirrors the
2026 requirements at
https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
and https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review.

**Status:** draft — populate the TODO fields before submission. The technical
gates (compliance webhooks, OAuth, billing) are implemented and tested. The
listing UI/legal fields are the gate.

---

## Pre-submission checklist

### Configuration

- [ ] **App URL** — production deployment URL, no "Shopify" in the domain.
      TODO: `https://app.ava.example`
- [ ] **Allowed redirect URLs** — OAuth callback. TODO: `https://app.ava.example/auth/shopify/callback`
- [ ] **App icon** — 1200×1200 px PNG or JPEG. TODO: `apps/dashboard/public/app-icon-1200.png`
- [ ] **API contact email** — does NOT contain "Shopify" or variants. TODO: `engineering@ava.example`
- [ ] **Emergency contact** — email + phone for critical issues. TODO: fill in Partner Dashboard.
- [ ] **Allowed senders** — add `app-submissions@shopify.com` and `noreply@shopify.com`
      to the Partner-account email's allow list.

### Compliance webhooks (mandatory — implemented Phase 1.3 + Phase 4.6)

These three endpoints exist, HMAC-verify the raw body, and return 200 OK.
Tests live at `apps/server/src/api/shopify-gdpr-webhooks.test.ts`.

| Topic | Endpoint | Behaviour |
|---|---|---|
| `customers/data_request` | `POST /api/shopify/webhooks/gdpr/customers/data_request` | Log + acknowledge. AVA stores NO customer PII — anonymous `visitorId` fingerprint only. |
| `customers/redact` | `POST /api/shopify/webhooks/gdpr/customers/redact` | Log + acknowledge. No-op (nothing to redact). |
| `shop/redact` | `POST /api/shopify/webhooks/gdpr/shop/redact` | Cascade-marks the shop's SiteConfig and all related rows for deletion. |

### Listing — required fields (per `app-requirements-checklist`)

- [ ] **Primary language** — English
- [ ] **App name** — `AVA — AI Shopping Assistant`
- [ ] **Tagline** (≤30 chars) — `Voice salesperson for Shopify`
- [ ] **Short description** (≤500 chars) — Shopify-first framing. AVA's
      headline value is the voice salesperson + cart recovery loop, not
      "works on any site". Sample draft:
      > AVA is the AI voice salesperson for your Shopify store. It detects
      > shopping friction in real time, talks shoppers through hesitation,
      > and recovers carts that would have been abandoned. Built natively
      > on Shopify (OAuth, Storefront API, Billing API). WooCommerce
      > coming next; custom-platform deploys available on request.
- [ ] **Long description** (≤3000 chars) — TODO. Order: (1) voice-led
      cart recovery, (2) live friction detection on PDP/cart/checkout,
      (3) revenue attribution merchants can trust, (4) weekly insight
      digest. **Do NOT claim "works with any website"** — the locked
      product plan (CLAUDE.md) ships Shopify excellence first, WooCommerce
      after, generic later. Marketing copy must match the build order.
- [ ] **Categories** — primary `Conversion` + secondary `Analytics`
- [ ] **Screenshots** (1600×900, 5 minimum) — TODO; capture from `apps/dashboard`:
  - Approvals queue (Phase 3.3)
  - Live results panel (Phase 3.4)
  - Weekly digest (Phase 3.6)
  - Heatmap (Phase 3.8)
  - Voice in action (Phase 2)
- [ ] **Demo video** (optional but strongly recommended)
- [ ] **Privacy policy URL** — see `docs/PRIVACY_POLICY.md`
- [ ] **Terms of service URL** — see `docs/TERMS_OF_SERVICE.md`
- [ ] **Support URL / email** — TODO

### Pricing tiers (declared at Partner Dashboard, mirrored in `billing-plans.ts`)

| Plan | Recurring | Trial | Usage cap | Pricing source |
|---|---|---|---|---|
| Free | $0 | — | n/a | local-only, no Shopify subscription |
| Starter | $29 / 30 days | 14 days | $100 / 30d | `appSubscriptionCreate` (Phase 4.5) |
| Pro | $99 / 30 days | 14 days | $500 / 30d | `appSubscriptionCreate` (Phase 4.5) |

### Protected customer data

AVA does NOT request access to protected customer data. The "Protected
customer data" step in the review wizard should be **opted out**.

### Automated checks (run from the Shopify App Store review page)

- [ ] All automated checks pass before clicking Submit
- [ ] Lighthouse impact ≤ 10 points (widget is zero-dependency vanilla TS,
      Shadow DOM, no blocking scripts — should pass comfortably)

---

## Submission flow

1. Open the Shopify Partner Dashboard → Apps → AVA → Distribution → "App Store listing".
2. Complete the configuration section (URLs, icon, contact, webhooks).
3. Create the listing with the fields above.
4. Run all automated checks. Address any flagged items.
5. Click **Submit for review**.
6. Add `app-submissions@shopify.com` and `noreply@shopify.com` to allowed
   senders so review correspondence doesn't get spam-filtered.
7. Typical review window: 5–10 business days.

## Post-approval (Built for Shopify badge)

After listing goes live, optionally pursue the Built for Shopify badge
(higher visibility) — separate review tracked at
https://shopify.dev/docs/apps/launch/built-for-shopify.

## Common rejection causes — preflight

Per the Shopify review team's published patterns:

- **Brand name violations** — never use "Shopify" or misspellings in domains,
  emails, or copy.
- **Missing GDPR webhooks** — covered.
- **Incomplete OAuth scope justification** — list each scope in the listing
  description with a one-line reason.
- **Privacy policy missing data retention + deletion sections** — covered in
  `PRIVACY_POLICY.md`.
- **App listing description doesn't match what the app actually does** —
  ensure the screenshots and copy reflect Phase 1–3 functionality.
