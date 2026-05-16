# Phase 1.4 — WooCommerce Vertical Slice: Manual Cold-Start Gate

Mirrors `PHASE_1_1_MANUAL_GATE.md`. The automated half lives in
`apps/server/src/api/onboarding-woo.test.ts` and the unit + integration
suites for `woocommerce.client.ts` / `catalog-ingest.service.ts` /
`woocommerce-webhooks.api.ts`. This checklist proves the path holds against
a real WordPress + WooCommerce site.

**Run it once before declaring Phase 1.4 cleared, and again any time the
Woo client's `STORE_API_PATH` / `REST_V3_API_PATH` constants change.**

The execution-plan SLO for this phase is **cold-start under 10 minutes** on
a small Woo catalog.

---

## Pre-flight

- [ ] Node 20.x active (`nvm use`)
- [ ] `.env` populated: `DATABASE_URL=file:./dev.db`, `GROQ_API_KEY=…`
- [ ] `npm install` clean
- [ ] `npm run db:generate && npm run db:push` (picks up `wooConsumerKey` /
      `wooConsumerSecret` / `wooWebhookSecret` / `wooWebhookIds` columns)
- [ ] `npm run ci` green (build + typecheck + test, 391+/391+)

## Prep — a real WordPress + WooCommerce site

You need a publicly reachable site. Options ranked by ease:

1. **InstaWP** (free, 7-day staging) — <https://app.instawp.com>. Pick the
   "WooCommerce Storefront" template; site is live in ~60s with a seeded
   catalog of ~15 products. Easiest path.
2. **WordPress.com Business plan** — supports WooCommerce out of the box.
3. **Local dev + ngrok** — slower; required if you want to test webhooks
   against `localhost`.

Once your site is up:

- [ ] Confirm WooCommerce ≥ 8.0 is installed and active
- [ ] Confirm at least **5 published products** across **2+ categories**
- [ ] Confirm the site is **not** behind HTTP basic auth or a "Coming Soon"
      page — public homepage must return HTML 200

## Quick-onboard run — public Store API path (no creds)

The Store API path is the zero-friction default. No credentials needed.

- [ ] Start the server: `npm run dev:server` (port 8080)
- [ ] Start the wizard: `npm run dev:integration` (port 3002)
- [ ] Browse to `http://localhost:3002/?platform=woocommerce`
- [ ] Paste your Woo site URL into "Shop URL" — leave the REST v3 toggle off
- [ ] Click **Analyze store**

**Pass criteria:**

- [ ] Response lands within **10 minutes** (SLO; expect <30s on small catalogs)
- [ ] "Products ingested" matches your published product count (±skipped)
- [ ] "Pages mapped" ≥ your published page count (homepage + products + cart
      + checkout at minimum)
- [ ] At least **PDP** and (if Woo block-cart is enabled) **Cart** /
      **Checkout** page types appear in the page-type list
- [ ] Transport line in the preview reads **"WooCommerce Store API (public)"**

## Quick-onboard run — REST v3 path (authenticated)

Exercises the consumer key/secret transport. Pulls real inventory data.

- [ ] In WP-Admin: **WooCommerce → Settings → Advanced → REST API → Add key**
  - Description: `AVA gate test`
  - User: any admin
  - Permissions: **Read**
  - Copy the `ck_…` / `cs_…` pair
- [ ] In the wizard, click **Start over** if you're at the preview
- [ ] Tick the **Use REST v3 credentials** toggle
- [ ] Paste the consumer key and consumer secret
- [ ] Click **Analyze store**

**Pass criteria:**

- [ ] Transport line reads **"WooCommerce REST API v3 (authenticated)"**
- [ ] Products ingested ≥ public-path count (REST v3 returns drafts too —
      may be higher if you have unpublished products)
- [ ] `SiteCatalog` rows show `source: "woocommerce_rest"` in the DB

```sql
SELECT externalId, title, availability, source
FROM SiteCatalog WHERE siteUrl LIKE '%your-site%' LIMIT 10;
```

## Activation

- [ ] Click **Activate AVA**
- [ ] HTTP 200 from `POST /api/integration/:siteId/activate`
- [ ] Check the DB: `SiteConfig.integrationStatus` flipped from `mapped` to
      `limited_active` (or `active` if coverage thresholds passed)
- [ ] If the standalone dashboard (port 3000) is open in another tab, the
      activation gate flips on (poll cycle is 5s)

## Webhook delivery — manual

This validates Phase 1.4.5. You'll register one webhook by hand against
your real Woo store, edit a product, and confirm AVA upserts.

- [ ] Generate a webhook secret locally: `openssl rand -hex 32` — paste it
      into the `SiteConfig.wooWebhookSecret` column for your site
      (`UPDATE SiteConfig SET wooWebhookSecret = '<hex>' WHERE siteUrl = '…'`)
- [ ] Expose your local server publicly (e.g. `ngrok http 8080`) and note
      the `https://*.ngrok.app` URL
- [ ] In WP-Admin: **WooCommerce → Settings → Advanced → Webhooks → Add**
  - Name: `AVA — products.updated`
  - Status: Active
  - Topic: `Product updated`
  - Delivery URL: `https://<your-ngrok>.app/api/woocommerce/webhooks/products/update`
  - Secret: paste the same hex you stored in `wooWebhookSecret`
  - API Version: WP REST API Integration v3
- [ ] Save → Woo fires a "ping" delivery; confirm `200 OK` in the webhook
      log and `"Woo/products.update] ping ack"` in the server logs
- [ ] In WP-Admin: edit any published product (change the title) → Save
- [ ] Within ~5s, confirm in the server log:

```
[Woo/products.update] catalog upserted {"source":"https://<your-site>","productId":<id>,"topic":"product.updated"}
```

- [ ] Confirm in DB: `SELECT title, updatedAt FROM SiteCatalog WHERE
      externalId = 'wc:<id>'` shows the updated title.

**Negative test:**

- [ ] In WP-Admin → Webhooks, edit the AVA webhook → change the **Secret**
      to something else → Save → trigger another product save
- [ ] Server returns **401** (HMAC mismatch). Restore the original secret
      after confirming.

## Gate decision

Mark Phase 1.4 **cleared** when:

- [ ] Cold-start Store API path under 10 minutes
- [ ] Cold-start REST v3 path under 10 minutes
- [ ] Widget identifies PDP and Cart on the live Woo site (visible via the
      page-type preview in the wizard)
- [ ] Webhook delivery upserts SiteCatalog within 5s of a product edit
- [ ] Tampered/unsigned webhook deliveries are rejected with 401

If any of the above fails, file the failure with reproducer in the gate
issue and **do not advance to Phase 1.5**.
