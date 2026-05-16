#!/usr/bin/env bash
# ============================================================================
# Phase 1.5 commit plan — Generic adapter + LLM mapper + drift
#
# 6 logical commits. Run from repo root after running ci locally.
#
# Prereqs:
#   nvm use
#   npm install
#   npm run db:generate          # picks up new SiteSelectorFingerprint columns
#   npm run db:push
#   npm run build --workspace=@ava/db
#   npm run typecheck --workspace=apps/server
#   npm run test --workspace=apps/server   # confirm 464/464
# ============================================================================

set -e
echo "Branch:"
git rev-parse --abbrev-ref HEAD
echo "Status before:"
git status --short

# ---------------------------------------------------------------------------
# Commit 1 — Phase 1.5.1: deterministic generic structured-data ingest
# ---------------------------------------------------------------------------
git add \
  apps/server/src/crawl/generic-product.extractor.ts \
  apps/server/src/crawl/generic-product.test.ts \
  apps/server/src/crawl/catalog-ingest.service.ts \
  apps/server/src/crawl/catalog-ingest.test.ts

git commit -m "[Story 11] Phase 1.5.1 — Generic PDP structured-data ingest

Deterministic only — no LLM, no drift. Composes the Phase 1.2 BFS crawler
+ structured-data extractor + page classifier into an ingest path for
sites that are neither Shopify nor WooCommerce.

- generic-product.extractor.ts: JSON-LD → microdata → OpenGraph priority.
  Handles single Offer, AggregateOffer, Offer arrays, \`@graph\` unwrap,
  schema.org availability normalization. Refuses to invent rows when
  there's no Product node with a name.
- ingestGenericCatalog() in catalog-ingest.service.ts: filters crawled
  pages to PDPs, runs the extractor, upserts with
  source: 'generic_structured_data:{jsonld|microdata|opengraph}'.
  Reports pdpCount / extractedCount / coverage / bySource for the
  wizard preview.
- 21 new tests (16 extractor + 5 ingest).
"

# ---------------------------------------------------------------------------
# Commit 2 — Phase 1.5.2: LLM DOM mapper fallback (feature-flagged + capped)
# ---------------------------------------------------------------------------
git add \
  apps/server/src/crawl/llm-product-mapper.service.ts \
  apps/server/src/crawl/llm-product-mapper.test.ts

git commit -m "[Story 11] Phase 1.5.2 — LLM DOM mapper fallback (capped + flagged)

Optional fallback when structured-data extraction yields nothing on a
PDP. Behind LLM_DOM_MAPPER_ENABLED — off by default, never invoked
implicitly.

Codex safety boundaries enforced:
- Feature-flagged. Disabled → no Groq call.
- HTML region trimmed to <main>/<article>/<body>, scripts/styles/svg
  stripped, capped by UTF-8 byte budget (default 20KB). True-byte
  truncation backs off to a UTF-8 boundary to never overshoot the cap.
- zod-validated JSON output. Invalid → null, never a hallucinated row.
- Per-site call cap (default 50). \`{_no_product: true}\` escape hatch.
- In-memory telemetry: callsMade / successCount / invalidCount / tokens.
- LlmClient interface is injectable so tests mock Groq. No live calls
  in CI — assertion in CLAUDE.md.

18 unit tests (incl. multibyte regression test for the byte budget).
"

# ---------------------------------------------------------------------------
# Commit 3 — Phase 1.5.3: unified /api/onboarding/quick router
# ---------------------------------------------------------------------------
git add \
  apps/server/src/api/onboarding-quick.api.ts \
  apps/server/src/api/onboarding-quick.test.ts \
  apps/server/src/api/routes.ts \
  apps/server/src/validation/schemas.ts \
  packages/db/src/repositories/site-config.repo.ts

git commit -m "[Story 11] Phase 1.5.3 — Unified POST /api/onboarding/quick

One endpoint, internal dispatch. The wizard no longer needs to know
which platform's endpoint to call — paste a URL, server detects, server
routes.

- Detects platform from homepage HTML + headers.
- Shopify → forwards to shopifyQuickOnboard (requires storefrontToken;
  400 with { requires: ['storefrontToken'], detection } otherwise).
- WooCommerce → forwards to wooCommerceQuickOnboard.
- Otherwise (custom / low-confidence) → inline orchestration: bounded
  BFS crawl → ingestGenericCatalog → walkPageMap. LLM fallback only
  when LLM_DOM_MAPPER_ENABLED=true.
- WooCommerceQuickOnboardSchema reused for the input. installGenericSite
  added to SiteConfigRepo (platform=custom).
- Existing per-platform endpoints kept for backwards compat.

9 dispatch tests cover all three branches + validation + 502 on
detection failure.
"

# ---------------------------------------------------------------------------
# Commit 4 — Phase 1.5.4: wizard auto-detect path
# ---------------------------------------------------------------------------
git add \
  apps/wizard/src/components/auto-quick.js \
  apps/wizard/src/main.js \
  apps/wizard/src/styles.css

git commit -m "[Story 11] Phase 1.5.4 — Wizard auto-detect path (?platform=auto)

Single component that posts to /api/onboarding/quick and renders the
appropriate preview based on response.platform.

- State machine adds a 'needs_token' stage: when server returns 400
  with requires: ['storefrontToken'], the wizard re-prompts inline.
- Generic preview adds a coverage section with bySource breakdown
  (jsonld / microdata / opengraph / llm) so merchants can see how the
  deterministic extractor performed.
- Activation through the canonical POST /api/integration/:id/activate
  — same discipline as Shopify/Woo paths.
- main.js routes ?platform=auto → new wizard; legacy platform-specific
  routes preserved for backwards compat.
- Two new CSS rules (.sq-coverage, .sq-source-breakdown).
"

# ---------------------------------------------------------------------------
# Commit 5 — Phase 1.5.5: drift baseline + comparison service (split lifecycle)
# ---------------------------------------------------------------------------
git add \
  apps/server/src/crawl/selector-drift.service.ts \
  apps/server/src/crawl/selector-drift.test.ts \
  packages/db/prisma/schema.prisma \
  packages/db/src/repositories/site-selector-fingerprint.repo.ts

git commit -m "[Story 11] Phase 1.5.5 — Selector-drift baseline + comparison (split)

Lifecycle split per Codex review: baseline first (explicit), comparison
second. No comparison until a trusted baseline exists.

Schema:
- SiteSelectorFingerprint adds baselineHash, baselineSelectors,
  baselineCapturedAt. The current fingerprint stays in fingerprintHash;
  baseline columns are populated ONCE per (siteUrl, pageType) via
  markAsBaseline().

Repo (site-selector-fingerprint.repo.ts):
- markAsBaseline / hasBaseline / listForSite / listSitesWithBaselines.

Service (selector-drift.service.ts):
- compareFingerprints() — pure Jaccard-like similarity over selector
  key sets. Hash match shortcuts to score=1.
- checkDriftForSite() — loads all rows, skips rows without baseline
  (invariant: 'no comparison without baseline'), emits DriftAlerts
  with alertType='selector_drift'. severity 'warning' below 0.7,
  'critical' below 0.4. 6h dedup via DriftAlertRepo.hasRecentAlert.

13 unit tests cover the math, the no-baseline skip, alert emission,
severity bands, the 6h dedup window, and per-pageType dedup
independence.
"

# ---------------------------------------------------------------------------
# Commit 6 — Phase 1.5.6 + 1.5.7: drift API/job integration + gate hardening
# ---------------------------------------------------------------------------
git add \
  apps/server/src/api/drift.api.ts \
  apps/server/src/api/drift-selector.test.ts \
  apps/server/src/api/routes.ts \
  apps/server/src/jobs/nightly-batch.job.ts \
  docs/PHASE_1_5_MANUAL_GATE.md \
  .gitignore

git commit -m "[Story 11] Phase 1.5.6 + 1.5.7 — Drift API/job wiring + Codex P1 fix

API extensions (apps/server/src/api/drift.api.ts):
- POST /api/drift/selector-baseline   — promote current fingerprint to baseline
- GET  /api/drift/selector-status     — per-pageType baseline + drift state
- POST /api/drift/selector-check      — manual trigger of comparison

Nightly job (nightly-batch.job.ts):
- New selector_drift subtask iterates listSitesWithBaselines() and runs
  checkDriftForSite per site. Sites without baselines are skipped at
  the runner layer too (split-lifecycle invariant honoured top-to-bottom).

Codex Phase 1.5 review fixes:
- P1 (availability): generic ingest no longer coerces 'unknown' to
  'in_stock'. Schema documents 'unknown' as a valid SiteCatalog
  availability value. Regression-guard tests added in
  catalog-ingest.test.ts (round-trip + the three known values).
- P3 (byte length): extractProductRegion now uses real UTF-8 byte
  length (Buffer.byteLength) instead of string length. Truncation backs
  off to a UTF-8 boundary so the cap is never exceeded even by a
  replacement-char byte expansion. Multibyte regression test added.

docs/PHASE_1_5_MANUAL_GATE.md added (tracked via .gitignore exception).

Final state: 464/464 server tests pass, typecheck at the
pre-existing 51-error baseline (no new errors).

Phase 1 (Shopify-first site awareness) now fully cleared on the
automated side: 1.1 Shopify → 1.2 crawler hardening → 1.3 OAuth +
webhooks → 1.4 Woo → 1.5 generic adapter + LLM + drift.
"

# ---------------------------------------------------------------------------
echo ""
echo "=== Commit log (last 6) ==="
git log --oneline -n 6
echo ""
echo "Push when ready:"
echo "  git push origin \$(git rev-parse --abbrev-ref HEAD)"
