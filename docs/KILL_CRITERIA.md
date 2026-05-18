# Kill Criteria

Per phase, one explicit failure metric + a date + a pre-decided descope
action. The locked execution plan in CLAUDE.md has *success* gates ("Phase 2
passes when voice recovers a cart, <1s first token, 5-turn memory holds").
Codex's review caught the missing half: what happens when a gate doesn't
clear.

**Rule:** kill criteria must be measurable, dated, and have a
pre-committed descope path. "If Shopify install is slow" is not a kill
criterion. "If p50 cold-start install > 5 min on day 30 of Phase 1.3, we
cut WooCommerce from Phase 1 and ship Shopify-only" is.

This file is **retroactive** for Phase 0–4 (audit + template) and **live**
for Phase 5+ (binding contract).

---

## Phase 0 — Hardened Foundations [closed]

**Locked metric:** all builds + typechecks + tests green; zero direct
Prisma calls outside `packages/db/`.

**Would-have-killed:** if by Phase 0 + 2 weeks the repository-only DB
access rule still had 5+ violations, defer the new Phase 0 models
(`SiteMap`, `SiteCatalog`, `SiteSelectorFingerprint`, `ConversationState`,
`Recommendation`, `RecommendationOutcome`) and ship them in their
respective downstream phases instead. Phase 0 itself would have shipped
with the smaller foundation set.

**Actual outcome:** passed. Retained as template.

---

## Phase 1.1 — Shopify vertical slice [closed]

**Locked metric:** shop URL → Shopify detection → Storefront API ingest
→ page classification → SiteMap persisted → wizard preview → activated.

**Would-have-killed:** if by Phase 1.1 + 2 weeks the end-to-end demo
took > 10 min (2× the locked 5-min cold-start target), we would have:
1. Dropped the wizard preview step (defer to 1.5).
2. Inlined the Storefront API ingest directly into the activation
   handler (bypass the analyzer-run abstraction).

Both descope actions would have shrunk the Phase 1.1 scope by ~40%.

**Actual outcome:** passed.

---

## Phase 1.3 — Shopify Admin API + OAuth + webhooks [closed]

**Locked metric:** Shopify cold-start install ≤ 5 min, p50.

**Would-have-killed:** if p50 install time > 5 min at end of Phase 1.3,
**cut WooCommerce from Phase 1** and ship Shopify-only. The reasoning is
that WooCommerce parity is downstream of Shopify excellence; if Shopify
isn't fast, broadening to a second platform multiplies the slowness
rather than fixing it. WooCommerce becomes a Phase 4+ initiative.

**Actual outcome:** passed (per existing manual gate `PHASE_1_4_MANUAL_GATE.md`).

---

## Phase 1.5 — Generic adapter + LLM DOM mapper + drift detection [closed]

**Locked metric:** generic adapter functional on one non-platform site;
selector-drift alert dedup within 6h.

**Would-have-killed:** if the generic adapter required > 3 LLM calls per
page to map a single product (cost-prohibitive) or had selector accuracy
< 70%, the generic-adapter path would have been **descoped to "manual
configuration only"** and the LLM DOM mapper deferred to Phase 4+.

**Actual outcome:** passed.

---

## Phase 2 — Exceptional Voice [closed]

**Locked metric:** voice recovers an abandoned cart on demo store,
<1s first audio chunk, 5+ turn memory holds across reload.

**Would-have-killed:** if first-chunk latency on the **real** Deepgram
WS was > 2× the target (>2s for ≥1 of 4 runs), we would have:
1. Switched the default TTS provider to a streaming-first ElevenLabs or
   AWS Polly path.
2. If still > 2s after that, descoped the proactive-voice surface and
   kept voice as a tap-to-talk shopper-initiated feature only.

**Actual outcome:** passed. Documented at `docs/PHASE_2_MANUAL_GATE.md`.

**Live kill criterion still in force:** voice intervention conversion
rate must stay above the baseline non-voice intervention rate by ≥ 20%
on month 1 of any merchant install. If it doesn't, **disable proactive
voice for that merchant** automatically and surface a dashboard banner
recommending tap-to-talk.

---

## Phase 3 — Intelligent Dashboard / Action Engine [closed]

**Locked metric:** fresh Shopify install → wizard map < 5 min → live
widget + voice + nudges → live dashboard → first weekly digest email
lands.

**Would-have-killed:** if recommendation-engine outcome attribution
showed merchants > 30% attribution error vs. their own ground-truth
checkout reports (or if the Codex P1 scoping bug had shipped to prod),
we would have:
1. Disabled the "Attributed revenue" headline on `LiveResultsPanel`.
2. Shipped only the "this is an experiment, here are the conversion
   counts" framing until attribution rigour caught up.

Merchant trust on revenue numbers is irrecoverable if we ship wrong
once.

**Actual outcome:** passed (post-Codex P1 scoping fix).

---

## Phase 4 — Distribution + Durability [closed]

**Locked metric:** GA4 + Mixpanel exports working; Shopify Billing API
live; App Store listing-ready; engine paths at ≥ 60% test coverage.

**Would-have-killed:** if GA4 or Mixpanel exports introduced > 10 ms
p99 latency to the track hot path, we would have:
1. Moved both forwarders to a separate worker process via queue.
2. Or, descoped Mixpanel for v1 (GA4 alone covers the analytics
   parity story).

The Codex 4.3.1/4.4.1 review locked the fire-and-forget contract
explicitly, with a regression test asserting < 100ms hot-path elapsed
even under slow exporter promises.

**Actual outcome:** passed.

---

## Phase 5 — Real-merchant pilot [LIVE — binding]

**Status:** not started. These criteria bind us when work begins.

**Hypothesis:** a fresh Shopify merchant who installs AVA from the App
Store will recover ≥ 1 cart on day 1 and see ≥ $50 attributed revenue
in week 1.

**Kill metrics:**

| # | Metric | Date | Descope action |
|---|---|---|---|
| 5.K1 | Cold-start install: p50 time from "Install" click to first intervention firing | end of pilot week 2 | If > 15 min, halt new-merchant onboarding and pull the App Store listing back to "unlisted". Root-cause the slow path before unblocking. |
| 5.K2 | Voice intervention completion rate (shopper engages ≥ 1 turn after voice fires) | end of pilot month 1 | If < 25%, **disable proactive voice for new merchants by default**. Existing merchants keep it; new installs get tap-to-talk + chat-bubble until we have a Phase 5.x prompt-engineering pass. |
| 5.K3 | Revenue attribution merchant-trust survey (NPS-style: "Do AVA's revenue numbers match what you see in Shopify Analytics?") | end of pilot month 1 | If ≥ 1 merchant says "No, off by > 20%", freeze the "Attributed revenue" headline on the dashboard and ship a "Recovered carts (count)" alternative card while attribution accuracy is investigated. |
| 5.K4 | Uninstall rate within 14 days of install | end of pilot month 1 | If > 25%, halt all marketing spend and conduct mandatory exit interviews with each uninstall. No new feature work until the pattern is understood. |
| 5.K5 | Customer support ticket volume per active merchant | end of pilot month 1 | If > 2 tickets/merchant/month average, prioritise stability over distribution for Phase 5.x. Defer GA4/Mixpanel UI work; freeze new exports. |

**Pre-decided escalation triggers (no further discussion needed):**

- Any K1–K5 failure triggers an automatic "Phase 5 pause" status in
  the Partner dashboard. Resumption requires a written plan.
- Two simultaneous K1–K5 failures triggers a Phase 5 abort: roll back
  the App Store listing to "unlisted", retain installed merchants, and
  enter a 4-week stabilisation sprint before any new-merchant work.

---

## Phase 6 — Network flywheel [DEFERRED until Phase 5 clears]

**Why deferred:** Network effects (cross-merchant pattern contributions
via `SiteConfig.networkOptIn`) only help when there's enough merchant
volume to make the patterns statistically meaningful. Setting kill
criteria before Phase 5 ships at least 10 active merchants is premature.

**Placeholder kill metric:** if network-derived patterns improve no
single merchant's conversion rate by ≥ 5% after 30 days of pattern-
sharing, freeze the network feature and ship merchant-local patterns
only.

---

## Process notes

- **Every new phase** gets entries in this file *before* work starts.
  No success gate without a paired kill criterion.
- **Re-read this file at every phase gate review.** A failure metric
  you've forgotten is a failure metric that won't fire.
- **Updating a kill criterion mid-phase** is allowed only with explicit
  written reasoning. "We got close, let's extend" is not an acceptable
  reason; that's how scope creep starts. Either descope per the locked
  action, or formally rewrite the criterion with a new date.
