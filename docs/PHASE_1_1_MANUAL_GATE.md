# Phase 1.1 — Shopify Vertical Slice: Manual Cold-Start Gate

This checklist is the **manual half of the Phase 1.1.6 gate**. The automated
half (`apps/server/src/api/onboarding-shopify.test.ts`) catches regressions
in CI; this run-through proves the path works against a live Shopify store.

**Run it once before declaring Phase 1.1 cleared, and again any time the
Shopify Storefront API version bump (`API_VERSION` in `shopify-storefront.client.ts`)
changes.**

---

## Pre-flight

- [ ] Node 20.x active (`nvm use`)
- [ ] `.env` populated with at least `DATABASE_URL=file:./dev.db`, `GROQ_API_KEY=…`
- [ ] `npm install` clean, `npm run db:setup` succeeds
- [ ] `npm run ci` green (build + typecheck + test)

## Prep — a real Shopify dev store

A Shopify Partner account gives you free `quickstart-XXXX.myshopify.com`
development stores in seconds.

- [ ] Create a new Shopify dev store at <https://partners.shopify.com>
- [ ] Seed it with **at least 5 products** (Shopify Admin → Products → Add)
      across **at least 2 collections** (Catalog → Collections)
- [ ] Generate a **public Storefront API access token**:
  1. Shopify Admin → Apps → "Develop apps"
  2. Create an app → API credentials → Storefront API access tokens
  3. Grant scopes: `unauthenticated_read_product_listings`,
     `unauthenticated_read_product_inventory`, `unauthenticated_read_collection_listings`
  4. Copy the token (starts with `shpat_…`)
- [ ] Confirm the store is **online** (no password page): Online Store →
      Preferences → Password protection OFF (or set the storefront password
      in the wizard test).

## Cold-start run

- [ ] Start the server: `npm run dev:server`
- [ ] Start the wizard with the Shopify-quick route:
      `npm run dev:wizard` then open <http://localhost:3002/?platform=shopify>
- [ ] Note the wall-clock time, paste:
      - Shop URL: `quickstart-XXXX.myshopify.com`
      - Storefront token: `shpat_…`
- [ ] Click **Analyze store**
- [ ] Stop the clock when the preview renders

## Acceptance criteria

| Gate | Target | Observed |
|------|--------|----------|
| Cold-start time | < 5 minutes (wall clock) | __:__ |
| `detection.platform` | `shopify` | |
| `detection.confidence` | ≥ 0.8 | |
| Products ingested | == products in dev store (±0) | |
| Sitemap classified URLs | ≥ 5 | |
| PDP mapping confidence | ≥ 0.75 (1 PDP) or ≥ 0.85 (≥3 PDPs) | |
| Category mapping confidence | ≥ 0.75 | |
| Cart mapping detected | Yes (if `/cart` in sitemap) | |
| Sample PDP links in preview | Resolve to real product pages | |

If any row fails, **don't activate**. File a bug against Phase 1.1 with the
preview JSON pasted in.

## Activation verification

- [ ] Click **Activate AVA**
- [ ] Preview transitions to "AVA is active"
- [ ] Server log shows `[Onboarding/Shopify] page ingested`, `[PageMap] walk complete`
- [ ] `sqlite3 dev.db "SELECT pageType, urlPattern, pageCount FROM SiteMap WHERE siteUrl LIKE '%quickstart%';"`
      returns one row per detected pageType
- [ ] `sqlite3 dev.db "SELECT COUNT(*) FROM SiteCatalog WHERE siteUrl LIKE '%quickstart%';"`
      matches the product count from the store

## Downstream

- [ ] Dashboard at <http://localhost:3000> activates within 5 seconds
      (Channel-4 polling per CLAUDE.md activation rules)
- [ ] Open the dev store in another tab → verify the AVA widget renders
      (bottom-right by default)
- [ ] Browse to a product page → server log shows `pageType=pdp` events

## Cleanup

- [ ] Uninstall the dev app token if you won't reuse it
- [ ] Delete the test SiteConfig row if you don't want it in `dev.db`:
      `sqlite3 dev.db "DELETE FROM SiteConfig WHERE siteUrl LIKE '%quickstart%';"`

---

## When this gate fails

Most failures fall into three buckets, all of which the automated test
covers — the manual run usually finds one of:

1. **`detection.confidence < 0.8`** — the dev store is using an unusual
   theme that hides the standard Shopify markers. Add the theme's signature
   to `voteByHtml` in `platform-detect.service.ts`.

2. **Products ingested mismatch** — likely a scope issue on the Storefront
   token. Re-grant `unauthenticated_read_product_listings`. If still off,
   the token is rate-limited (check for 429 in server logs).

3. **Sitemap classified URLs < 5** — the dev store didn't generate a full
   sitemap yet (Shopify rebuilds it lazily). Visit
   `https://quickstart-XXXX.myshopify.com/sitemap.xml` in a browser to
   confirm content. If it's empty, browse a few storefront pages to
   trigger generation, then retry.

Re-run this gate after every fix.
