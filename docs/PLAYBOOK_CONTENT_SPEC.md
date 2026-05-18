# F-code Playbook Content Spec

This is the authoring contract for AVA's F-code playbooks — the dialog
scripts the voice assistant uses to respond to specific shopping friction
scenarios. Written for an eventual content owner (sales-trained writer)
who is not necessarily an engineer.

**Status:** draft. Schema not yet implemented. This doc exists to unblock
hiring + sourcing — a writer can't author against an undefined schema.

---

## Why this exists

AVA detects 325 friction scenarios (F001–F325). Each scenario needs a
*playbook* — a short voice dialog the AI uses to acknowledge the friction
and move the shopper forward. The current playbook catalog covers ~10
F-codes well; the remaining ~315 fall back to generic templates that
sound robotic.

Engineering can ship the scaffolding. Engineering should **not** ship the
scripts. Voice quality decays the moment a non-writer touches a line,
because the dialog is sales craft, not code.

---

## File format

One YAML file per F-code. Path: `content/playbooks/F042.yaml`
(numeric F-code suffix; one digit per file name).

```yaml
# ── Frontmatter (machine-readable) ─────────────────────────────────────
friction_id: F042                       # MUST match filename + catalog
name: "Hesitation on add-to-cart"       # human label, displayed in dashboard
status: ready                           # draft | ready | deprecated
last_reviewed: 2026-05-17               # ISO date — content review timestamp
owner: "alice@ava.example"              # content owner email; CODEOWNERS routes to them
voice_persona: warm-direct              # see "Personas" below
mswim_tiers: [active, escalate]         # which tiers may fire this playbook
# Optional flags:
allow_objection_followup: true          # whether step 2 can chain on a known objection
locale: en-US                           # one playbook per locale; default en-US

# ── Dialog steps (the sales craft) ─────────────────────────────────────
steps:
  - step: 1
    objective: "Acknowledge the hesitation without naming it"
    voice_script: |
      Hey, looks like you're thinking it over.
      Anything I can clear up?
    sales_dialog: |
      I noticed you've been on this page for a bit — totally normal.
      Most people who hesitate here have one of three questions: sizing,
      shipping, or whether the price is right. Which one is it for you?
    # Chat-bubble rendering of `sales_dialog`. The widget shows both.

  - step: 2
    objective: "Handle the objection the shopper actually voiced"
    branch_on: shopper_objection         # see "Branching" below
    branches:
      too_expensive:
        voice_script: |
          Fair. Want me to flag if it goes on sale, or show you something
          similar at a lower price?
        sales_dialog: |
          Totally fair — and you'd be surprised how often we run a
          15-20% promo on this. Want me to ping you when it drops, or
          pull up a couple of similar options in a lower tier?
      sizing:
        voice_script: |
          Got it. Want me to pull up the size chart or compare your usual?
        sales_dialog: |
          Sizing is the #1 reason people pause on this product. The chart
          runs a touch large — most reviewers say to size down. Want me
          to show you the chart, or compare to a brand you usually wear?
      # ... more branches per known objection
```

### Required fields

| Field | Type | Constraint |
|---|---|---|
| `friction_id` | string | Must match filename and exist in F-code catalog |
| `name` | string | ≤ 80 chars |
| `status` | enum | `draft` blocks production fire; `ready` is live; `deprecated` is read-only |
| `last_reviewed` | ISO date | Must be ≤ 90 days old when `status: ready` (lint rule) |
| `owner` | email | Used by CODEOWNERS to route PRs |
| `voice_persona` | enum | See "Personas" — empty defaults to `warm-direct` |
| `mswim_tiers` | array<enum> | `passive` / `nudge` / `active` / `escalate` |
| `steps` | array | At least 1, no more than 4 |

### Voice script length limits (HARD — CLAUDE.md gotcha)

| Tier | Max characters |
|---|---|
| `passive` | 60 |
| `nudge` | 80 |
| `active` | 80 |
| `escalate` | 120 |

These limits exist so TTS pacing stays natural. Lint rule enforces them.

### Sales-dialog (chat) length

No hard cap. Aim for ≤ 300 chars per step. Longer dialogs land in the
chat bubble but voice still uses `voice_script`.

---

## Personas

A voice persona is a tone register the writer chooses per playbook. The
TTS engine respects this via prompt + SSML.

| Persona | When to use | Example tone |
|---|---|---|
| `warm-direct` (default) | Cart hesitation, price questions, mid-funnel | "Hey, totally fair. Want me to ..." |
| `expert-helpful` | Spec / sizing / compatibility questions | "Quick one — the sizing runs a touch large. Most reviewers..." |
| `assured-closer` | Checkout-stage objections, returning shoppers | "You're 30 seconds from done. Want me to ..." |
| `apologetic` | Errors, out-of-stock, shipping delays | "Ah, that one's actually out till Thursday. Want me to ..." |

Personas are NOT phrasing templates — they're a stance. Same persona
across two F-codes still produces two different scripts.

---

## Branching (step 2+)

Step 1 is unconditional — it acknowledges. Step 2 can branch on an
extracted shopper objection. Supported branch keys (initial set):

- `too_expensive`
- `sizing`
- `shipping_time`
- `return_policy`
- `out_of_stock`
- `general_hesitation` (fallback)

A playbook does NOT need to cover every branch. If a shopper expresses
`shipping_time` and the playbook only has `too_expensive`, the engine
falls back to a generic shipping reply.

---

## Authoring rules (for the writer)

1. **Acknowledge, don't sell.** Step 1 should never include a CTA.
2. **One micro-question per step.** "Want me to X, or Y?" — never X, Y, AND Z.
3. **Match the shopper's vocabulary.** If they said "expensive", don't
   reply with "price-conscious".
4. **No marketing-speak.** "Industry-leading" / "world-class" / "premium"
   are banned. Plain words win.
5. **Time-bounded specifics.** "Most reviewers" is fine. "9 out of 10
   customers" is a claim we can't substantiate per-store.
6. **Brand-neutral.** Never mention competitor brands. Never imply
   the merchant's product is "better" than a named alternative.

---

## Review workflow

1. Writer opens a PR adding/editing `content/playbooks/F<NNN>.yaml`.
2. CODEOWNERS routes the PR to the named `owner` in the frontmatter
   (or, while the content owner role is unfilled, to the founder as
   the forcing function).
3. CI lints schema + length limits.
4. On merge, the playbook ships at the next server reload — no engineering
   touch required.

A playbook is "live" when `status: ready` AND the lint passes AND
`last_reviewed` is within 90 days.

---

## What this spec does NOT do

- Define the runtime LOADER (engineering concern — separate spec).
- Define the LLM prompt template that consumes these playbooks (already
  in `apps/server/src/voice/`).
- Cover non-English locales (defer until the en-US catalog is at
  ≥80% coverage of the 325 F-codes).
- Replace the F-code catalog itself — that lives in
  `packages/shared/src/constants/friction-catalog.ts`.

---

## Open questions for the content owner

These are the calls a writer makes once, not per playbook:

1. **Persona inventory** — do the four personas above cover real
   stylistic differences, or do we need more? Fewer?
2. **Branch taxonomy** — six objection keys is a starting point. As the
   writer authors more playbooks, expect the list to grow to 10–15.
3. **Length limits per tier** — current caps come from TTS pacing
   research, but a sales writer may push back. Negotiate before
   committing.
4. **Locale strategy** — when do we start translation? Probably not
   until 80%+ en-US coverage, but the writer should weigh in.

---

## Implementation order (engineering, downstream of this spec)

1. Build the YAML loader (`apps/server/src/voice/playbook-loader.ts`).
2. Migrate the ~10 existing playbooks from TypeScript constants to
   YAML files.
3. Add lint rule for schema + length limits.
4. Add CODEOWNERS entry routing `content/playbooks/*` to the content
   owner.
5. Hand the empty F-code slots to the writer in priority order
   (highest-frequency frictions first — pull from
   `InterventionRepo.countOutcomesByFriction` on a live merchant once
   we have one).

None of this should start before the content owner exists, even
informally. Per Codex's review: "ship CODEOWNERS pointing to engineering
is worse than no CODEOWNERS." The structure is theatre without a real
reviewer.
