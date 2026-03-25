# CLAUDE.md — AVA

## Product Vision

AVA is a plug-and-play AI shopping assistant for e-commerce. Six core capabilities — all non-negotiable and must work perfectly:

1. **Voice-first sales assistant** — product discovery, comparison, variant selection, shipping autofill, multi-turn conversation
2. **Product analytics** — GA4/Mixpanel equivalent: sessions, funnels, traffic sources, retention, heatmaps
3. **Behavioral analytics** — Amplitude equivalent + 614 behavior patterns (B001–B614): user paths, divergence, conversion vs. drop-off
4. **Friction detection** — 325 friction scenarios (F001–F325): real-time detection, analytics, severity scoring
5. **Plug-and-play install** — one snippet, auto site analysis, automated friction fix suggestions
6. **Merchant reporting** — revenue attribution, weekly insights, actionable recommendations

Implementation backlog (12 prioritized stories): `@BACKLOG.md`

Runtime flow: **ONBOARDING** (analyze → map → verify → activate) → **TRACK** → **EVALUATE** → **INTERVENE**. Managed via **OPERATE**.

---

## Architecture

Turborepo monorepo. Key workspaces:

| Path | Role | Port |
|---|---|---|
| `apps/server` | Express HTTP API | 8080 |
| `apps/server` | WebSocket server | 8081 |
| `apps/dashboard` | React + Vite merchant UI | 3000 |
| `apps/store` | Static demo store | 3001 |
| `apps/wizard` | Integration wizard standalone | 3002 |
| `apps/demo` | Three-panel demo (wizard + store + dashboard) | 4002 |
| `apps/widget` | Vanilla TS IIFE, Shadow DOM | — |
| `packages/shared` | All shared types + catalogs | — |
| `packages/db` | Prisma ORM + all repositories | — |

Import shared types as `@ava/shared`. Import DB as `@ava/db`.

---

## Key Catalogs (reference everywhere by ID)

- **B001–B614** — `packages/shared/src/constants/behavior-pattern-catalog.ts`
- **F001–F325** — `packages/shared/src/constants/friction-catalog.ts`
- **Severity scores** — `packages/shared/src/constants/severity-scores.ts`
- **LLM prompts** — `apps/server/src/evaluate/prompts/`

---

## Architectural Decisions

**MSWIM scoring formula:**
`composite = (intent×0.25) + (friction×0.25) + (clarity×0.15) + (receptivity×0.20) + (value×0.15)`
Tiers: 0–29 MONITOR · 30–49 PASSIVE · 50–64 NUDGE · 65–79 ACTIVE · 80+ ESCALATE.
Weights always load from `ScoringConfig` table — never hardcoded.

**Evaluation engine** — controlled by `EVAL_ENGINE` env var:
- `llm` (default) — Groq Llama 3.3 70B
- `fast` — zero LLM calls, signal synthesis only
- `auto` — fast-first, escalates to LLM when composite ≥65 or max friction severity ≥75

**Go-live thresholds:**
- `active`: behavior coverage ≥85%, friction coverage ≥80%, confidence ≥0.50, critical journeys passing
- `limited_active`: below thresholds — PASSIVE + NUDGE only, high-confidence mappings only

**Dashboard is fixed at 3 tabs: TRACK / EVALUATE / OPERATE.** New analytics always go inside TRACK as collapsible sections. Never add a 4th tab.

**Widget is zero-dependency vanilla TS.** No npm packages. Shadow DOM for style isolation. Voice uses plain `fetch` for both Deepgram TTS and STT — never an SDK.

---

## Non-Obvious Gotchas

- **Analytics side-effects** in `track.service.ts` (`incrementPageViews`, `setEntryPage`, etc.) are always fire-and-forget — `.catch(() => {})`, never `await`. Blocking them breaks the event pipeline.
- **Never `GROUP BY` on `rawSignals` JSON** in SQLite. Promote fields to typed columns via the event normalizer instead.
- **Shadow evaluation** is always `.then().catch()` — never block or `await` in the production path.
- **`inferFrictionFromContext()`** is the only canonical fallback for frictionId resolution. Call it from `evaluate.service.ts`. Do not add friction fallback logic anywhere else.
- **Voice interventions** must broadcast via `broadcastToSession("widget", sessionId, ...)` — never directly on the `ws` socket or the dashboard won't receive them.
- **`SpeechRecognizer.isSupported()`** must be checked before instantiation. Only create it when `voiceEnabled && deepgramApiKey && isSupported()`.
- **Voice scripts ≤80 chars** for natural TTS pacing.
- **Experiment assignment is deterministic** — SHA-256 hash of sessionId. Same session always maps to same variant. Never break this.
- **Drift alerts deduplicate within 6 hours** — do not create a new alert if one of the same type already exists for the same site within that window.
- **`apiFetch` mutations** always need the `RequestInit` second argument (method, body, headers). Calling it with one arg silently does a GET.
- **Product card clicks are not tracked** — `product_detail_view` from the modal MutationObserver handles it to avoid duplicates.
- **Onboarding state is always persisted** to mapping/status tables. No in-memory-only integration state.

---

## File Naming

`*.service.ts` · `*.api.ts` · `*.repo.ts` · `*.signal.ts` · `*.observer.ts` · `*.mapper.ts` · `*.job.ts` · `*.handler.ts`

---

## Commands

```bash
# Dev
npm run dev                  # All apps
npm run dev:server           # Backend only (:8080 + WS :8081)
npm run dev:demo             # Three-panel demo: wizard + store + dashboard (:4002)
npm run dev:integration      # Integration wizard standalone (:3002)
npm run dev:dashboard        # Dashboard (:3000)
npm run dev:widget           # Widget

# Database
npm run db:push              # Apply schema + generate Prisma client
npm run db:setup             # db:generate + db:push + db:seed
npm run db:seed              # Seed friction catalog + MSWIM defaults

# ML Pipeline
npm run fine-tune:dry        # Preview export stats, no write
npm run fine-tune:export     # Write fine-tune JSONL
npm run eval                 # Run evaluation harness
npm run eval:verbose         # Per-datapoint detail
```

---

## Environment Variables

**Required:**
```
GROQ_API_KEY=
DATABASE_URL=
PORT=8080
WS_PORT=8081
```

**Optional (defaults shown):**
```
EVAL_ENGINE=llm                  # llm | fast | auto
SHADOW_MODE_ENABLED=false
VOICE_ENABLED=false
DEEPGRAM_API_KEY=
VOICE_MAX_PER_SESSION=3
NIGHTLY_BATCH_HOUR=2             # UTC hour
DISABLE_SCHEDULER=false          # Set true during testing
```

Widget voice config is set via `window.__AVA_CONFIG__` on the merchant's page (not `.env`).

---

## Testing

Tests live alongside source as `*.test.ts` — no separate `__tests__` directories.

```bash
npm test                                    # All workspaces
npm test --workspace=apps/server            # Single workspace
```

IMPORTANT: Always mock Groq API in evaluate and onboarding tests. Never make real LLM calls in tests.

Priority test targets: MSWIM signal calculators (known inputs → expected outputs), gate-check edge cases, experiment assigner determinism, drift alert deduplication, onboarding coverage/confidence thresholds.

---

## Repository Etiquette

- **Branch naming**: `feature/story-N-short-description` · `fix/what-broke` · `chore/what-changed`
- **PR title**: `[Story N] Description` for backlog items · `[Fix] Description` for bugs
- Never commit directly to `main`
- Run `npm run build` before opening a PR — catches cross-package type errors
- Schema changes: always run `npm run db:push` and commit the generated Prisma client

---

## Demo Port Architecture — Never Break

| Port | App | Role |
|---|---|---|
| 3002 | `apps/wizard` | Integration wizard — owns the activation flow |
| 3001 | `apps/store` | Demo store — widget loads here after activation |
| 3000 | `apps/dashboard` | Merchant dashboard — activates after wizard completes |
| 4002 | `apps/demo` | Three-panel shell (iframes: 3002 + 3001 + 3000) — display only, never standalone |

**Activation is exclusively wizard-driven. These rules are absolute:**

1. **Dashboard always starts inactive.** `use-activation.ts` clears localStorage on mount — never restore from it. No auto-activation from server state on page load.
2. **Widget stays dormant until activation.** The activation gate (`GET /api/site/status`) must return `activated: true` before the widget mounts. This only happens after the wizard completes.
3. **`integrationStatus` is wizard-owned.** `seed-demo-site.ts` only ensures the correct `siteKey` is present. It never sets or upgrades `integrationStatus` — that transition belongs to the wizard flow (`pending` → `analyzing` → `mapped` → `limited_active`/`active`).
4. **4002 is a display shell only.** It iframes 3002, 3001, and 3000. It never contains its own activation logic. Activation signal flows: wizard (3002) → `ava:wizard:activated` postMessage → 4002 parent → `ava:activate` postMessage → dashboard iframe (3000).
5. **Standalone sync (3002 + 3000 without 4002)** is handled by Channel 4 server polling in `use-activation.ts` — polls `GET /api/site/status?siteUrl=...&siteKey=...` every 5s and activates the dashboard when the wizard sets the site active on the server.
6. **Demo siteKey is fixed:** `avak_eff0c37fabe8d527` — hardcoded in `apps/store/index.html` and seeded by `scripts/seed-demo-site.ts`. Never change either without updating both.
7. **Reset on wizard startup:** `apps/wizard/src/main.js` calls `POST /api/site/reset` on load, returning the site to `analyzing`. This ensures every new demo session starts with a dormant widget and inactive dashboard.

---

## Hard Rules

- Widget has **zero npm dependencies** — absolute, no exceptions.
- **All DB access through repositories** — never call Prisma directly from a service.
- **No PII** — `visitorId` is an anonymous fingerprint only. Never store email, name, or real identity.
- **Zod validation on all WebSocket messages** — malformed events crash the pipeline silently.
- **No hardcoded per-site logic** — everything goes through `BehaviorPatternMapping` / `FrictionMapping` tables.
- **Voice TTS/ASR logic only in designated files** — TTS fields in `payload-builder.ts`, ASR handling in `voice-responder.service.ts`.
- **No multiple active experiments per site** — enforce at the service layer.
- **Rollouts must use linked Experiments** — never bypass the experiment framework for traffic splitting.
