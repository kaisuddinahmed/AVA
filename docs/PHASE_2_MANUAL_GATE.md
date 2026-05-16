# Phase 2 — Exceptional Voice: Manual Gate

The locked Phase 2 gate from CLAUDE.md:

> **Gate:** voice recovers an abandoned cart on demo store, <1s first token,
> 5+ turn memory holds.

Two of the three legs are covered by the automated harness in
`apps/server/src/voice/phase-2-gate.test.ts` — first-chunk latency and
multi-turn memory across reload. This checklist covers the third leg
(cart-recovery end-to-end on the demo store) plus the manual half of the
voice / widget integration that the automated suite cannot prove on its own.

**Run this once before declaring Phase 2 cleared.**

---

## Pre-flight

- [ ] Node 20.x active (`nvm use`)
- [ ] `.env` populated with at least:
  - `GROQ_API_KEY=...` (Groq for the LLM responder)
  - `DEEPGRAM_API_KEY=...` (for TTS + STT)
  - `VOICE_ENABLED=true`
  - `VOICE_STREAMING_ENABLED=true` (TTS WebSocket path)
  - `VOICE_STT_STREAMING_ENABLED=true` (STT WebSocket path)
  - Optional for autofill: `VOICE_AUTOFILL_ENABLED=true`
- [ ] `npm install` clean
- [ ] `npm run db:generate && npm run db:push`
- [ ] `npm run ci` green (build + typecheck + full server suite)

## Prep — the demo store

Use the in-repo three-panel demo. It iframes:

| Port | App | Role |
|------|-----|------|
| 3002 | `apps/wizard` | Activation flow |
| 3001 | `apps/store` | Demo store with 6 products + cart |
| 3000 | `apps/dashboard` | Merchant intervention dashboard |
| 4002 | `apps/demo` | Three-panel shell |

- [ ] Terminal 1: `npm run dev:server` (HTTP :8080, WS :8081)
- [ ] Terminal 2: `npm run dev:demo`
- [ ] Open `http://localhost:4002`
- [ ] Click through the wizard (port 3002 panel) until the dashboard shows
      "AVA is active"

## Leg 1 — Voice recovers an abandoned cart

This is the locked business-USP test.

### Setup the friction

- [ ] In the store panel (3001), browse to any PDP.
- [ ] Add 2-3 products to the cart.
- [ ] Open the cart page, then **hover** the **close** / **back** action
      without clicking. Hold for ~5 seconds. (The exit-intent + dwell
      patterns combine to push MSWIM toward ESCALATE for F042 / F128.)
- [ ] Watch the dashboard panel (3000) — an `Evaluation` row should land
      with tier=ESCALATE (or at least ACTIVE) and the F-code that matches
      the playbook (F042 / F100 / F128 are the easiest to trigger).

### Verify the proactive voice fires

- [ ] Audio plays within ~1 second of the friction landing. The first
      utterance should be the playbook's curated `voice_script` (≤80 chars
      per the playbook spec) — *not* generic LLM filler.
- [ ] The chat bubble shows the richer `sales_dialog` text from the same
      playbook step (longer, salesperson-style copy).
- [ ] The dashboard row carries `actionCode: PROACTIVE_VOICE` (or the
      decision's actionCode) and `frictionId` matching the playbook's F-code
      — **not** rewritten to F036 (Codex Phase 2.3 P1 guard).
- [ ] The intervention payload in the WS frame contains both `voice_script`
      AND `sales_dialog` AND `playbook_objective`.

### Confirm the recovery actually happens

- [ ] Engage with AVA — say "yes please" or click the cart-confirm button
      surfaced by the playbook. The cart should remain populated (or
      proceed to checkout) instead of being abandoned.

## Leg 2 — <1s first audio chunk

The automated harness asserts this against a mocked Deepgram. The manual
gate is a sanity check against the **real** Deepgram WebSocket.

- [ ] In the store panel, trigger any voice intervention (cart friction
      from Leg 1 works).
- [ ] On the server's stdout, find the `[VoiceResponder] streaming TTS
      finished` log line. It carries `firstChunkMs`.
- [ ] **Pass criterion:** `firstChunkMs < 1000` for at least 3 of 4
      consecutive runs on a normal network.
- [ ] If `outcome` ever reads `disabled` here, double-check
      `VOICE_STREAMING_ENABLED=true` — the legacy REST TTS fallback would
      satisfy the audio playback but NOT the latency gate.

## Leg 3 — 5+ turn memory survives reload

- [ ] In the panel, click the mic + ask "show me shoes."
- [ ] Have a 5-turn conversation:
  1. "show me shoes"
  2. "what about in blue"
  3. "size medium please"
  4. "and the price"
  5. "free shipping?"
- [ ] **Reload** the demo iframe (Cmd+R on the store panel).
- [ ] Ask one more turn: "and free returns?"
- [ ] AVA's reply must reference the prior context (e.g. "Yes, free returns
      apply to those blue size-M shoes you were looking at."). If the reply
      reads like a cold-start ("What can I help you find?"), memory was lost.

## Leg 4 — Barge-in (Phase 2.7 manual)

Streaming TTS + STT must coexist; the user can interrupt AVA mid-sentence.

- [ ] Trigger a long-ish voice reply (a playbook step ≥60 chars works).
- [ ] While AVA is speaking, start talking. (You'll need the widget mic
      capture loop wired — if not yet shipped, skip this leg and reopen as
      a 2.7.x follow-up.)
- [ ] Within ~200ms of you speaking, AVA's audio should stop and the STT
      pipeline should start delivering partial transcripts.
- [ ] Server logs show `[Track] barge-in cancelled in-flight TTS` and a
      subsequent `voice_chunk_end` broadcast with `outcome: "cancelled"`.

## Leg 5 — Voice autofill (Phase 2.8 manual)

Optional but recommended.

- [ ] On a checkout page, with the cart populated, say:
      *"Ship to 123 Main Street, San Francisco, California 94105."*
- [ ] The widget's checkout form should populate the address fields.
- [ ] In the DB: `SELECT addressLine1, city, state, postalCode FROM
      VisitorAddress WHERE siteUrl = 'http://localhost:3001'`. The row
      should match.
- [ ] No PII appears in the server log stream for that turn.
- [ ] On a PDP, say *"size medium in blue."* The variant swatches should
      switch accordingly.

## Gate decision

Mark Phase 2 **cleared** when:

- [ ] Leg 1 (cart recovery) passes end-to-end.
- [ ] Leg 2 (latency) passes against the real Deepgram WS.
- [ ] Leg 3 (5+ turn memory) reply references prior context.
- [ ] Leg 4 (barge-in) — pass OR explicitly tracked as 2.7.x follow-up if
      the widget mic loop hasn't shipped yet.
- [ ] Leg 5 (autofill) — pass OR explicitly tracked as 2.8.x if the widget
      checkout-form binding hasn't shipped yet.

After all five legs are accounted for, Phase 2 is **gated done** and we
move to Phase 3 (Intelligent Dashboard / Action Engine).
