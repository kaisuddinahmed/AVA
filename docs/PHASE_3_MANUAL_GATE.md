# Phase 3 — Intelligent Dashboard / Action Engine: Manual Gate

The locked Phase 3 gate from CLAUDE.md:

> **Gate:** fresh Shopify install → wizard map <5min → live widget + voice +
> nudges → live dashboard → first weekly digest email lands.

The wizard / install / live-widget legs are covered by Phase 1 and Phase 2.
This checklist covers the **Phase 3 control-room loop** end-to-end. The
data-driven half is enforced by
`apps/server/src/insights/phase-3-gate.test.ts` — engine → approve →
outcome → digest → email. This document covers the human-in-the-loop half
that the automated harness can't observe: the dashboard UX, the freshness
feedback, and the actual email landing in an inbox.

**Run this once before declaring Phase 3 cleared.**

---

## Pre-flight

- [ ] Node 20.x active (`nvm use`)
- [ ] `.env` populated with at least:
  - `GROQ_API_KEY=...`
  - `EMAIL_PROVIDER=console` (recommended for the local gate — flip to
    `resend` for the Leg 5 real-delivery sanity check)
  - `DIGEST_EMAIL_RECIPIENT=you@example.com`
  - Optional real send: `RESEND_API_KEY=...`, `EMAIL_FROM=ava@yourdomain`
- [ ] `npm install` clean
- [ ] `npm run db:generate && npm run db:push`
- [ ] `npm run ci` green (build + typecheck + full server suite — Phase 2
      gate test + the new `phase-3-gate.test.ts` must both pass)

## Prep — the demo

Use the in-repo three-panel demo as in Phase 2 (`npm run dev:server` plus
`npm run dev:demo` against `http://localhost:4002`). Click through the
wizard until the dashboard shows "AVA is active." Recommendations only fire
once interventions have outcomes — drive a few abandoned-cart sessions in
the store panel so the engine has signal.

## Leg 1 — Approvals queue surfaces real recommendations

- [ ] Open the dashboard, switch to **INTERVENE → Approvals**.
- [ ] After at least ~25 interventions on the same F-code, click
      **↻ Regenerate** in the panel header. (Background nightly job runs
      automatically — manual button is for impatient gate runs.)
- [ ] A recommendation card appears within ~1s:
  - F-code tag (e.g. `F042`), action code (e.g. `PLAYBOOK_F042`)
  - Intervention tier pill (`active` / `nudge` / `passive`)
  - Expected lift % + confidence % + sample size
  - Rationale sentence referencing the firing count + conversion rate
- [ ] The **+ payload** toggle shows formatted JSON. For a playbook-backed
      F-code, payload contains `voice_script`, `sales_dialog`, and
      `playbook_objective`.
- [ ] The "Updated Xs ago" badge in the header ticks (Phase 3.5 freshness
      indicator).

## Leg 2 — Approval auto-creates and starts an experiment

- [ ] Click **✓ Approve & launch** on any pending card.
- [ ] Card disappears from the queue within ~1s (cross-link reload).
- [ ] Switch to the **A/B Experiments** sub-tab. The newly-created experiment
      is listed:
  - Name: `Rec F042 → PLAYBOOK_F042` (or similar)
  - Status: `running` (auto-start succeeded)
  - Variants: control / treatment, 50/50 split
- [ ] Switch back to **Approvals** — the same recommendation now appears in
      the **Live results** section at the bottom of the panel with
      `status=approved`.

## Leg 3 — Reject path

- [ ] Trigger another recommendation (re-regenerate after seeding more
      friction) and click **✕ Reject** on it.
- [ ] An inline reason input appears. Type a few words, press Enter.
- [ ] Card disappears. Calling
      `GET /api/recommendations?siteUrl=...&status=rejected` returns the
      row with `rejectedReason` populated.

## Leg 4 — Live results show attributed revenue

The Live results section is the visible payoff of the locked Phase 3 pitch:
*"AVA noticed → recommends → merchant approves → experiment runs → revenue
impact appears."*

- [ ] In the same store demo, complete some conversions while the
      experiment is running. (Hit `add_to_cart` → `purchase_success` for
      sessions assigned to the treatment variant; the SHA-256 splitter is
      deterministic, so half the sessions land there.)
- [ ] In the dashboard, click **↻ Recompute** on the recommendation's row.
- [ ] Within ~1s:
  - **Attributed revenue** > $0
  - **CR delta** colored green if positive, red if negative
  - **Treatment / control** counts populated (e.g. `12/40 · 5/38`)
  - **p-value** present (will read `1.0000` until samples are larger)
  - A decision pill (`ship` / `extend` / `inconclusive`) is set
- [ ] Header summary reads "N approved · $X.XX attributed."

## Leg 5 — Weekly digest preview + email

- [ ] Switch to **INTERVENE → Weekly Digest** sub-tab.
- [ ] The panel renders within ~1s with:
  - Period range header (e.g. `2026-05-10 → 2026-05-17 (7d)`)
  - Big revenue number = sum of `attributedRevenue` across all outcomes
    this week
  - WoW sessions delta — green for positive, red for negative
  - Decision pills (ship / rollback / extend / inconclusive) with counts
  - Recommendations counts: approved / rejected / active / pending
  - Top frictions list with bar chart + CR + dismiss rate
- [ ] Trigger the email via the API
      (`curl -X POST http://localhost:8080/api/insights/digest/send -H
      "content-type: application/json" -d '{"siteUrl":"http://localhost:3001"}'`).
  - With `EMAIL_PROVIDER=console`, the server log shows the rendered
    email and the response carries `provider:"console"` + a synthesised
    `messageId`.
  - With `EMAIL_PROVIDER=resend`, a real email lands in the inbox of
    `DIGEST_EMAIL_RECIPIENT`. **This is the gate-clearing leg** — the
    locked criterion requires "first weekly digest email lands."
- [ ] Inspect the delivered email:
  - Subject: `AVA weekly: $X attributed · N shipped · M pending`
  - Body lists each top-friction row with conversion + dismiss percentages
  - Plain-text fallback renders cleanly in a no-HTML client

## Leg 6 — Click heatmap

- [ ] Switch to **TRACK** tab. Scroll to the Audience section.
- [ ] The **Click Heatmap** renders an SVG with:
  - Page selector dropdown (most-clicked page selected by default)
  - Color gradient from transparent → blue → orange → red
  - Legend strip beneath
  - "N clicks · max density M" summary
- [ ] Switching the page dropdown swaps the rendered heatmap in place.

## Leg 7 — Realtime freshness

- [ ] Switch to a different tab in the browser for ~30 seconds, then return.
      The "Updated Xs ago" badges should fire an immediate reload on focus
      return (Phase 3.5 visibility handling).
- [ ] In a second tab, approve a different recommendation. After ~15s the
      first dashboard's Approvals queue picks up the change via the poll
      (or instantly on tab-focus).

## Gate decision

Mark Phase 3 **cleared** when:

- [ ] Leg 1 — Approvals queue surfaces real recommendations.
- [ ] Leg 2 — Approval auto-creates a running experiment.
- [ ] Leg 3 — Reject path persists a reason.
- [ ] Leg 4 — Live results render attributed revenue + decision.
- [ ] Leg 5 — Weekly digest email lands (console for local gate, Resend for
      production gate).
- [ ] Leg 6 — Heatmap SVG renders and the page selector works.
- [ ] Leg 7 — Polling pauses on hidden tabs and resumes on focus.

After all seven legs are accounted for, Phase 3 is **gated done** and we
move to Phase 4 (Distribution + Durability).
