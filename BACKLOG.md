# AVA Implementation Backlog

12 stories across 3 tiers. Tier 1 closes non-negotiable feature gaps. Tier 2 amplifies value. Tier 3 creates scale and moat.

---

## Tier 1 — Core Completion
*Non-negotiable features that are incomplete. Must be done before anything else.*

### Story 1: B001–B614 Pattern Runtime Engine
The 614 behavior patterns exist in constants but are NOT wired into live evaluation. Currently onboarding-only.

**As a merchant**, I want AVA to recognize specific shopper behavioral patterns in real time so that interventions are triggered by meaningful behavioral context, not just MSWIM signals alone.

**Acceptance Criteria:**
- [ ] Patterns classified into runtime-detectable groups (comparison, hesitation, discovery, exit behaviors)
- [ ] MSWIM signal calculators accept `activeBehaviorPatterns: string[]` from session context
- [ ] `BehaviorPatternMatcher` service maps incoming event sequences to B-codes via `BehaviorPatternMapping` table
- [ ] Session context passed to evaluator includes `activeBehaviorPatterns`
- [ ] EVALUATE tab shows which B-patterns were active during a session evaluation
- [ ] ≥20 high-frequency patterns detectable at runtime with unit test coverage
- [ ] Adding a new pattern requires no changes to signal calculators — data-driven via mapping table

---

### Story 2: Multi-Turn Voice Conversation
Voice is currently single-turn (one question → one response). A sales assistant needs conversation threading.

**As a shopper**, I want a back-and-forth voice conversation with AVA so that I can refine requests, follow up on recommendations, and get progressively better help — like talking to a store associate.

**Acceptance Criteria:**
- [ ] Server maintains `conversationHistory` array per session (in-memory, keyed by `sessionId`, max 10 turns)
- [ ] Each `voice_query` WS message includes prior conversation history as `{role, content}[]` when calling Groq
- [ ] Follow-up context works: "show me something cheaper" after a recommendation resolves correctly
- [ ] Widget displays full conversation thread — alternating user bubbles (transcript) and AVA bubbles (reply)
- [ ] History cleared on session end or page reload
- [ ] LLM system prompt includes current page context (page type, products in view, cart contents)
- [ ] Conversation history does not block response — same fire-and-respond pattern

---

### Story 3: Shipping Address Memory & Autofill
Shipping address capture and autofill is completely absent. No model, no widget UI, nothing.

**As a returning shopper**, I want AVA to recognize I've checked out before and offer to fill in my shipping address so I can complete checkout faster.

**Acceptance Criteria:**
- [ ] `VisitorAddress` model added: `id`, `visitorKey`, `siteUrl`, `addressLine1`, `addressLine2`, `city`, `state`, `postalCode`, `country`, `lastUsedAt` — no name, email, or PII
- [ ] Address captured only when shopper explicitly confirms ("yes, save my address") — never scraped silently
- [ ] On checkout page + `isRepeatVisitor: true`: AVA offers "Want me to fill in your shipping address from last time?"
- [ ] Shopper confirms by voice ("yes") or single tap in widget panel
- [ ] AVA fills fields via `document.querySelector` + `element.value` through the widget's shadow DOM bridge
- [ ] Autofill only fires if checkout field selectors were verified during onboarding
- [ ] "Forget my address" option accessible in widget panel settings
- [ ] Addresses scoped to `visitorKey + siteUrl` — never shared cross-site without separate explicit consent

---

### Story 4: Dedicated Friction Analytics Dashboard
Friction data is buried inside the general analytics Overview. No dedicated view.

**As a merchant**, I want a standalone friction analytics view so I can understand which friction points cost the most revenue, where they occur, and how they trend over time.

**Acceptance Criteria:**
- [ ] "FRICTION" collapsible section added inside TRACK tab (no new tab)
- [ ] Top 10 friction IDs: label, category, severity score, event count
- [ ] Each friction expandable: pages where it occurs, avg MSWIM score at detection, intervention fire rate, conversion rate when present
- [ ] Friction trend chart: daily counts for top 5 frictions over 30 days
- [ ] Severity distribution chart: low / medium / high / critical counts
- [ ] Friction heatmap by category: 25 categories with color intensity by event volume
- [ ] All sections filter by `?siteUrl=&since=`
- [ ] `GET /api/analytics/friction` endpoint returns all aggregated data above

---

### Story 5: Revenue Attribution Engine
AVA knows when a session converts but does not connect conversions to dollar amounts.

**As a merchant**, I want to see the revenue AVA directly assisted in recovering so I can calculate ROI and justify the subscription cost.

**Acceptance Criteria:**
- [ ] `Intervention` model gains: `cartValueAtFire`, `cartValueAtConversion`
- [ ] `Session` model gains: `attributedRevenue` — set when session converts with ≥1 prior intervention
- [ ] Attribution: intervention fires → session converts in same window → `cartValueAtConversion` attributed
- [ ] `GET /api/analytics/attribution`: `totalAttributedRevenue`, `avgOrderValue`, `interventionCount`, `conversionLiftVsControl`
- [ ] Attribution window configurable (default: same session; optional: 24h)
- [ ] TRACK overview card shows "Estimated revenue attributed to AVA: $X,XXX" with attribution model tooltip
- [ ] Revenue shown as "assisted conversions" — not claimed as "caused by AVA"
- [ ] 5% of sessions (configurable) receive no interventions for control group baseline

---

## Tier 2 — Value Amplification

### Story 6: Merchant Insight Reports
Dashboard is engineering-focused. Merchants need a plain-language "here's what's happening and what to fix" view.

**As a merchant**, I want a clear weekly summary and top recommendations so I can make decisions without reading raw dashboards.

**Acceptance Criteria:**
- [ ] "INSIGHTS" collapsible panel added inside TRACK tab (first section visible)
- [ ] Weekly digest card: sessions analyzed, frictions caught, attributed revenue, top 3 friction types, WoW delta %
- [ ] "AVA Recommendations" list: top 5 auto-generated suggestions — friction label + page + impact estimate + fix text (via Groq, 2 sentences max)
- [ ] Recommendations regenerated daily by nightly batch, cached in `InsightSnapshot` model
- [ ] Each recommendation confidence-labeled: "High confidence (847 sessions)" vs. "Low confidence (12 sessions)"
- [ ] `GET /api/insights/latest?siteUrl=` returns most recent `InsightSnapshot`

---

### Story 7: Predictive Abandonment Score
AVA intervenes after friction is detected. The higher value is intervening before the shopper decides to leave.

**As a merchant**, I want AVA to predict imminent abandonment so interventions fire at the inflection point, not after.

**Acceptance Criteria:**
- [ ] `abandonmentScore` (0–100) computed per session in `fast-evaluator.ts` (no LLM call)
- [ ] Inputs: session sequence number, time-on-page, scroll depth trajectory, prior exit intent count, cart state, page type
- [ ] Gate override: `abandonmentScore ≥80` forces LLM escalation regardless of composite
- [ ] MSWIM tier still controls intervention type — `abandonmentScore` only affects timing
- [ ] Stored in `Evaluation` model and visible in EVALUATE tab signal bars
- [ ] Nightly eval harness tracks: % of sessions with score ≥80 that actually abandoned

---

### Story 8: Autonomous CRO Recommendations
AVA only patches sessions in real time. Merchants also need structural site problem detection.

**As a merchant**, I want AVA to identify structural friction problems on my site so I can fix root causes instead of patching every session individually.

**Acceptance Criteria:**
- [ ] CRO analysis runs weekly via nightly batch: per-page friction concentration report
- [ ] Per problem: friction ID, affected page, event count, avg severity, sessions impacted, plain-English fix suggestion
- [ ] Fix suggestions stored in `InsightSnapshot` and surfaced in Story 6 Insights section
- [ ] Onboarding wizard "Site Analysis" step shows initial CRO findings immediately after mapping completes
- [ ] `GET /api/insights/cro?siteUrl=` returns latest CRO findings sorted by estimated impact
- [ ] Suggestions labeled "AVA suggestion" with disclaimer — AVA never auto-modifies HTML/CSS

---

### Story 9: Post-Session Behavioral Triggers
AVA knows why someone abandoned. No other tool does. That signal should flow into re-engagement.

**As a merchant**, I want AVA to emit structured exit signals to my email/SMS platform so re-engagement flows use the actual abandonment reason.

**Acceptance Criteria:**
- [ ] `session_exit` webhook emitted when session ends without conversion (TTL or explicit close)
- [ ] Payload: `visitorKey`, `exitPage`, top 3 `frictionIds`, `cartValue`, `productsViewed` (last 5), `mswimTierAtExit`, `abandonmentScore`, `sessionDurationMs`
- [ ] Webhook endpoint + secret configurable in `SiteConfig`
- [ ] Payload signed with HMAC-SHA256 using `webhookSecret`
- [ ] Retry: up to 3 attempts with exponential backoff
- [ ] `WebhookDelivery` model: `sessionId`, `url`, `status`, `attempts`, `lastAttemptAt`, `responseCode`
- [ ] OPERATE tab shows webhook delivery stats: 24h success rate, failure count, retry queue
- [ ] No PII in payload — `visitorKey` only (anonymous fingerprint)

---

## Tier 3 — Platform Scale

### Story 10: Cross-Merchant Behavioral Flywheel
Every new merchant improves predictions for all merchants. This is the data moat.

**As a new merchant**, I want my store to benefit from patterns learned across the AVA network so models are accurate from day one.

**Acceptance Criteria:**
- [ ] `NetworkPattern` model: anonymized aggregated patterns — friction ID, category, avg severity, avg conversion impact, merchant count, last updated. No session data. No site URLs.
- [ ] Network patterns computed weekly by nightly batch across opted-in merchants
- [ ] New merchants' fast evaluator uses network priors as fallback when site data < 50 sessions
- [ ] Opt-out via `SiteConfig.networkOptIn` (default `true`) — opted-out merchants still benefit but don't contribute
- [ ] OPERATE tab shows network learning status: opted in/out, contribution size
- [ ] Network data is strictly aggregated — no merchant can reconstruct another's data

---

### Story 11: Shopify Native App
Current install requires a developer. Shopify app distribution makes AVA accessible to 1.7M merchants.

**As a Shopify merchant**, I want to install AVA from the Shopify App Store with one click, no developer required.

**Acceptance Criteria:**
- [ ] Shopify OAuth app flow: install → authorize → `SiteConfig` auto-created
- [ ] Widget injected via Shopify ScriptTag API — no manual snippet
- [ ] Onboarding uses Shopify Admin API to pre-populate selector mappings — behavior coverage starts ≥90%
- [ ] Integration wizard embedded inside Shopify Admin via App Bridge
- [ ] Uninstall webhook stops tracking and cleans up `SiteConfig`
- [ ] GDPR webhooks handled (customer data request, erasure, shop erasure)
- [ ] `GET /api/shopify/install` and `GET /api/shopify/callback` OAuth endpoints on server

---

### Story 12: Full Conversational Shopping Agent
The logical end-state of AVA. Not "we nudge people" — "we are the AI store associate."

**As a shopper**, I want to tell AVA what I'm looking for in plain language and have it find, compare, and guide me to the right product.

**Acceptance Criteria:**
- [ ] Open-ended requests parsed into intent signals: category, price constraint, attribute (e.g., "trail shoes, overpronation, $150")
- [ ] `productSearchAdapter` with implementations for Shopify Storefront API, generic site search (via onboarding selectors), keyword fallback
- [ ] Results displayed as product cards in widget panel (image, name, price, attribute match)
- [ ] AVA narrates recommendation via TTS: "I found three options. The best match is…"
- [ ] "Compare the first two" → side-by-side comparison card
- [ ] "Add that to my cart" → locates add-to-cart button via verified selector, fires with shopper confirmation
- [ ] Requires Story 2 (multi-turn conversation) as prerequisite
- [ ] Graceful fallback when no product catalog access: navigation guidance instead
- [ ] Agent actions logged as interventions with `actionCode: AGENT_ACTION` for training capture

---

## Execution Order

| # | Story | Tier | Depends On |
|---|---|---|---|
| 1 | B001–B614 Pattern Runtime | 1 | — |
| 2 | Multi-Turn Voice | 1 | — |
| 3 | Shipping Address Autofill | 1 | — |
| 4 | Friction Analytics Dashboard | 1 | — |
| 5 | Revenue Attribution Engine | 1 | — |
| 6 | Merchant Insight Reports | 2 | 4 + 5 |
| 7 | Predictive Abandonment | 2 | 1 |
| 8 | Autonomous CRO Recommendations | 2 | 4 + 6 |
| 9 | Post-Session Behavioral Triggers | 2 | 5 |
| 10 | Cross-Merchant Flywheel | 3 | 1 + 5 |
| 11 | Shopify Native App | 3 | — (parallel) |
| 12 | Conversational Shopping Agent | 3 | 2 + 3 |

Stories 1–5 are independent and can be built in parallel.
