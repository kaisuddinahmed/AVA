# Phase 1.5 — Generic Adapter + LLM Mapper + Drift: Manual Cold-Start Gate

Mirrors `PHASE_1_1_MANUAL_GATE.md` and `PHASE_1_4_MANUAL_GATE.md`. The
automated half lives in the test suite (461 server tests). This checklist
proves the path holds against a **real non-Shopify, non-WooCommerce**
ecommerce site — the whole reason Phase 1.5 exists.

**Run it once before declaring Phase 1.5 cleared, and again any time the
generic extractor or LLM mapper schema changes.**

Phase 1 locked-plan gate clause covered here: *"generic adapter functional
on one non-platform site."*

---

## Pre-flight

- [ ] Node 20.x active (`nvm use`)
- [ ] `.env` populated: `DATABASE_URL=file:./dev.db`, `GROQ_API_KEY=…`
- [ ] `npm install` clean
- [ ] `npm run db:generate && npm run db:push` (picks up the new
      `baselineHash`, `baselineSelectors`, `baselineCapturedAt` columns on
      `SiteSelectorFingerprint`)
- [ ] `npm run ci` green (build + typecheck + 461/461 tests)

## Prep — a real non-platform ecommerce site

The site must NOT be on Shopify or WooCommerce (those have their own
phases). Good candidates, easiest first:

1. **Magento demo store** — <https://magento.softwaretestingboard.com/>.
   Public, has JSON-LD on PDPs, no auth required.
2. **BigCommerce demo** — request a 15-day trial at <https://www.bigcommerce.com>.
3. **A demo Squarespace / Wix store** — varies in structured-data quality.
4. **Your own staging site** if you have one running on a custom stack.

The site must:

- Be publicly reachable (no HTTP basic auth, no "Coming Soon" gate)
- Have at least **5 visible product pages**
- Allow crawling (`robots.txt` must not blanket-disallow `User-agent: *`)

## Path A — Deterministic structured-data ingest (no LLM)

The cheapest, default path. No env flags needed.

- [ ] Start the server: `npm run dev:server` (port 8080)
- [ ] Start the wizard: `npm run dev:integration` (port 3002)
- [ ] Open `http://localhost:3002/?platform=auto`
- [ ] Paste the site's URL — leave the Advanced toggle off
- [ ] Click **Analyze store**

**Pass criteria:**

- [ ] Response lands within ~30 s for a small catalog
- [ ] Preview heading reads **"Detected: Custom / generic"** (not Shopify, not Woo)
- [ ] **Transport:** `generic_crawl` shown in the preview
- [ ] "Products ingested" is `> 0` (assumes at least one PDP exposes structured data)
- [ ] The **Generic extraction coverage** section shows a `bySource`
      breakdown — at least one of `JSON-LD / Microdata / OpenGraph` is non-zero
- [ ] Coverage percentage is reasonable (Magento demo usually clears 80%)
- [ ] In the DB:

```sql
SELECT externalId, title, source, availability
FROM SiteCatalog
WHERE siteUrl LIKE '%your-site-host%'
LIMIT 10;
```

Each row's `source` should match `generic_structured_data:{jsonld|microdata|opengraph}`.

## Path B — LLM DOM mapper fallback

Required for any PDP that DOESN'T publish structured data. Behind a feature
flag so it never burns Groq budget by accident.

- [ ] Stop the server
- [ ] Export the flag + give it a tight cap for the gate run:

```bash
export LLM_DOM_MAPPER_ENABLED=true
export LLM_DOM_MAPPER_MAX_CALLS_PER_SITE=10
```

- [ ] `npm run dev:server`
- [ ] Re-run the wizard analyze flow against the same site
- [ ] In the wizard preview, `bySource.llm` should be `> 0` if the site has
      PDPs with no structured data (depends on the site)
- [ ] Watch the server logs for `[LLM mapper]` lines — confirm:
  - At least one `catalog upserted` line with `source: "generic_structured_data:llm"`
  - **No** lines reporting `schema validation failed` for rows that ended up persisted (validation rejects → null, never a row)
  - Cap is honoured: total `[LLM mapper] call cap reached` lines = 0 unless the site has many PDPs

**Telemetry probe (optional):**

```bash
curl -s 'http://localhost:8080/api/drift/selector-status?siteUrl=https://your-site' | jq
```

That endpoint is selector-drift focused, but the in-memory LLM telemetry
will be reflected in subsequent calls' headers / debug logs once Phase 3
wires it into the dashboard.

## Path C — Activation

- [ ] Click **Activate AVA** in the wizard
- [ ] HTTP 200 on `POST /api/integration/:siteId/activate`
- [ ] `SiteConfig.integrationStatus` flips from `mapped` to `limited_active`
      (or `active`, depending on coverage thresholds)
- [ ] If the dashboard (port 3000) is open, its activation gate unlocks
      within 5 s (Channel 4 polling)

## Path D — Drift baseline + comparison lifecycle

This validates 1.5.5 and 1.5.6 end-to-end.

### Capture baselines

For each pageType that was fingerprinted during ingest:

- [ ] Promote the fingerprint to baseline:

```bash
curl -s -X POST http://localhost:8080/api/drift/selector-baseline \
  -H 'Content-Type: application/json' \
  -d '{"siteUrl":"https://your-site","pageType":"pdp"}' | jq
```

Expect a 200 with `baselineHash` + `baselineCapturedAt`. Repeat for `cart`,
`checkout`, etc. as available.

- [ ] Confirm baseline state:

```bash
curl -s 'http://localhost:8080/api/drift/selector-status?siteUrl=https://your-site' | jq
```

Every pageType you promoted should show `hasBaseline: true` and `hashesMatch: true`.

### Run a drift check (no-op expected immediately after baseline)

- [ ] Trigger a manual check:

```bash
curl -s -X POST http://localhost:8080/api/drift/selector-check \
  -H 'Content-Type: application/json' \
  -d '{"siteUrl":"https://your-site"}' | jq
```

Expect `overallSimilarity: 1` and zero alerts emitted — current fingerprint
matches the just-captured baseline exactly.

### Simulate drift (optional — easier on a staging site you control)

If the site is yours:

- [ ] Change the CSS class on the cart button (`.add-to-cart` → `.add-to-cart-v2`)
- [ ] Re-run the BFS fingerprint capture (re-invoke the unified onboarding endpoint or wait for the nightly batch on a configured site)
- [ ] Run another `selector-check` — expect overallSimilarity to drop, a
      `selector_drift` alert in `GET /api/drift/alerts`
- [ ] Re-run the check within 6 hours → second alert is SUPPRESSED (no duplicate)
- [ ] Re-run after 6h+ → fresh alert is allowed

If the site is not yours, skip the staging part and confirm only the
no-drift no-op case + the dedup behavior is exercised by the automated
tests (`selector-drift.test.ts` covers 13 cases).

## Path E — Nightly batch integration

Optional but recommended for full confidence:

- [ ] Trigger the nightly batch on demand:

```bash
curl -s -X POST http://localhost:8080/api/jobs/trigger \
  -H 'Content-Type: application/json' \
  -d '{"jobName":"nightly_batch"}' | jq
```

- [ ] Check the run's subtasks include `selector_drift` with a non-failing status
- [ ] Subtask summary should show `sitesWithBaselines` ≥ 1 if you ran Path D

## Gate decision

Mark Phase 1.5 **cleared** when:

- [ ] Path A passes: structured-data extraction works on the test site
- [ ] Path B passes: LLM fallback produces at least one row with
      `source: generic_structured_data:llm` AND honours the per-site cap
- [ ] Path C passes: activation succeeds through the canonical endpoint
- [ ] Path D passes: baseline promotion + no-op drift check + (if doable)
      simulated drift produces an alert + dedup holds
- [ ] Path E passes (or skipped with reason)
- [ ] Wizard preview correctly displays the generic-platform path with the
      coverage breakdown

If any of the above fails, file the failure with reproducer in the gate
issue and **do not advance to Phase 2**.

---

**Phase 1 closed when** this gate passes — the locked plan's overarching
gate (`Shopify <5min, WooCommerce <10min, generic functional on one
non-platform site`) is then fully satisfied across 1.1 → 1.5.
