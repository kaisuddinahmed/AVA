# CLAUDE.md — AVA Project Instructions

## What is AVA

AI shopping assistant. Plug-and-play for ecommerce websites.
Flow is: ONBOARDING (analyze -> map -> verify -> activate) then runtime TRACK -> EVALUATE -> INTERVENE (OPERATE for ongoing management).
Onboarding maps 614 behavior patterns (B001-B614) and 325 friction scenarios (F001-F325) to the site's real functions/selectors before live intervention.
Full spec in `docs/` and `ava_project_structure.md`.

## Architecture

- **Monorepo**: Turborepo workspaces. `packages/shared`, `packages/db`, `apps/server`, `apps/dashboard`, `apps/widget`, `apps/demo`.
- **Backend** (`apps/server`): Express + WebSocket on ports 8080/8081. Seven layers:
  - `src/onboarding/` — runs site analysis, behavior/friction mapping, verification, activation.
  - `src/track/` — receives behavioral events from widget, buffers, stores. Normalizes events with `event-normalizer.ts` (extracts analytics fields: timeOnPageMs, scrollDepthPct, sessionSequenceNumber, UTM fields). Wires outcome feedback into training data collection.
  - `src/evaluate/` — three engine modes (`EVAL_ENGINE` env var):
    - `llm` (default) — Groq LLM API (Llama 3.3 70B) + MSWIM scoring + shadow comparison.
    - `fast` — zero LLM calls, synthesizes signals from session context, runs MSWIM only.
    - `auto` — fast-first, escalates to LLM for high-stakes scenarios (composite ≥ 65, severity ≥ 75, or gate-forced escalation).
  - `src/intervene/` — builds intervention payloads, broadcasts via WebSocket. All NUDGE/ACTIVE/ESCALATE payloads include `voice_enabled` + `voice_script` fields computed from 30-category message templates.
  - `src/voice/` — voice query responder (`voice-responder.service.ts`): receives ASR transcripts from widget, calls Groq LLM for a spoken reply, broadcasts `active` intervention with `voice_enabled: true` back to widget.
  - `src/training/` — training data collection, quality grading, fine-tune export, evaluation harness.
  - `src/jobs/` — nightly batch scheduler, drift detection, eval harness (shared lib).
  - `src/experiment/` — A/B experiment framework with deterministic assignment.
  - `src/rollout/` — gradual rollout with staged deployment and auto health checks.
- **Dashboard** (`apps/dashboard`): React + Vite, port 3000. Three tabs:
  - **TRACK** — Live event feed + 7 analytics sections: overview metrics (bounce rate, avg session duration, avg page views), traffic sources, device breakdown, conversion funnel, page flow, top pages, click heatmap (SVG scatter plot of normalized click coords).
  - **EVALUATE** — MSWIM scoring feed (tier distribution, signal bars, friction hotspots) + folded-in Interventions section + Shadow Mode comparison card (tierMatchRate, decisionMatchRate, divergences).
  - **OPERATE** — 5 collapsible sections: Training (stats, quality grades, export buttons), Drift (alerts with Ack, snapshots, Run Drift Check), Jobs (next run, trigger buttons, run history), Experiments (list, Start/Pause/End actions), Rollouts (list, Start/Promote/Rollback/Pause actions).
  - Activation-gated: stays dormant until `ava:activate` postMessage from demo frame.
  - Polls REST with `?since=<activatedAt>` to exclude stale historical data. Analytics APIs only polled when the relevant tab is active (lazy).
  - `useApi<T>(path, { pollMs })` — polls REST endpoints; `apiFetch(path, init?)` — one-shot mutations (POST/PUT actions).
- **Widget** (`apps/widget`): Vanilla TS, Shadow DOM, builds to single IIFE via Vite. Zero framework dependencies. Embeds on any website.
  - `BehaviorCollector` extracts rich DOM context (product name, price, category) from product cards and modals.
  - `FISMBridge.sendTrackEvent()` formats messages as `{ type: "track", event, visitorKey, siteUrl, ... }` matching the server Zod schema.
  - Tracks: page views (with `previous_page_url`, UTM params on first view), product detail views (via MutationObserver), add-to-cart, category navigation, search, color/size selection, quantity changes, scroll milestones, rage clicks (F400), dead clicks (F023), exit intent, idle time, form friction, tab switches.
  - Click events include normalized heatmap coords: `x_pct`, `y_pct` (0–1 range), plus raw `client_x`, `client_y`, `viewport_width`, `viewport_height` in `raw_signals`.
  - Every event carries `session_sequence_number` (monotonic counter per session) in `raw_signals`.
  - Product card clicks are NOT tracked separately — `product_detail_view` from the modal observer handles it to avoid duplicates.
  - **Voice (TTS)** — `VoiceManager` (`src/voice/voice-manager.ts`): fetches Deepgram TTS REST API with `voice_script` from intervention payload → plays via `HTMLAudioElement`. Tracks per-session budget (`maxPerSession`), respects `voiceMuted` flag. Mute button shown in nudge bubble and panel header when `voice_enabled: true`.
  - **Voice (ASR)** — `SpeechRecognizer` (`src/voice/speech-recognizer.ts`): `getUserMedia` → `MediaRecorder` → Deepgram STT REST (`nova-2`) → transcript. 🎙 mic button in panel footer (3 states: idle / recording-pulse / processing). On transcript: shows user bubble, sends `{ type: "voice_query" }` WS message, shows typing indicator, server replies with `active` intervention + TTS playback.
  - Voice config: `voiceEnabled`, `deepgramApiKey`, `deepgramModel` (default `aura-asteria-en`), `voiceMaxPerSession` (default 3), `voiceAutoPlay` in `WidgetConfig`. All set in `window.__AVA_CONFIG__` on the host store page.
- **Store** (`apps/store`): Static HTML served by `scripts/serve-store.mjs` on port 3001. Contains `ava-widget.iife.js` (copied from widget build output). Config via `window.__AVA_CONFIG__`.
- **Demo** (`apps/demo`): Vite, port 4002. Three-panel collapsible layout:
  - Left panel: Integration wizard (Analyze → Map → Verify → Activate).
  - Center panel: Demo store iframe (port 3001).
  - Right panel: Dashboard iframe (port 3000).
  - Wizard sends `postMessage({ type: "ava:activate" })` to dashboard iframe on successful activation.

## Tech Stack

- Runtime: Node.js + TypeScript (strict mode)
- Backend: Express 4, ws 8, groq-sdk (Llama 3.3 70B via Groq)
- Onboarding: site analyzer + rule engine + Groq-assisted mapping
- Frontend: React 18 (dashboard/demo), Vanilla TS (widget)
- DB: Prisma ORM, SQLite (dev), PostgreSQL (prod)
- Build: Turborepo, Vite, terser
- Validation: Zod for all API/WebSocket payloads
- ML Pipeline: fine-tune export (JSONL), eval harness, drift detection, A/B experiments

## Key Data Models

### Core (original)

- `Session` — visitor session with MSWIM tracking fields (totalInterventionsFired, totalDismissals, suppressNonPassive) + voice fields (totalVoiceInterventionsFired, voiceMuted) + analytics fields (entryPage, exitPage, pageViewCount, totalTimeOnSiteMs, utmSource/Medium/Campaign/Content/Term, landingReferrer)
- `TrackEvent` — behavioral event with category, eventType, frictionId, rawSignals (JSON) + analytics columns (siteUrl, previousPageUrl, timeOnPageMs, scrollDepthPct, sessionSequenceNumber)
- `Evaluation` — LLM output + 5 MSWIM scores (intentScore, frictionScore, clarityScore, receptivityScore, valueScore) + compositeScore + tier + gateOverride + `engine` field ("llm" | "fast")
- `Intervention` — payload sent to widget + outcome (status, mswimScoreAtFire)
- `ScoringConfig` — tunable MSWIM weights and thresholds per site
- `SiteConfig` — site runtime config + integration lifecycle status
- `AnalyzerRun` — onboarding run status, phase, coverage, confidence, errors
- `BehaviorPatternMapping` — mapping from B001-B614 patterns to site functions/selectors/events
- `FrictionMapping` — mapping from F001-F325 frictions to site detector rules
- `IntegrationStatus` — progress/status history (analyzing, mapped, verified, limited_active, active, failed)

### Training & ML (Phase 1-3)

- `TrainingDatapoint` — denormalized snapshot: session context + LLM input/output + MSWIM scores + intervention details + outcome label. 6 indexes for efficient export queries.
- `ShadowComparison` — dual-path evaluation results: prod signals vs shadow (MSWIM-no-LLM) signals, divergence metrics (tierMatch, decisionMatch, compositeDivergence).

### Continuous Learning (Phase 5)

- `JobRun` — tracks nightly batch and manual job executions (jobName, status, duration, summary).
- `DriftSnapshot` — sliding window analysis (1h/6h/24h/7d): agreement rates, signal calibration by outcome, conversion/dismissal rates.
- `DriftAlert` — 5 alert types (tier_agreement_drop, decision_agreement_drop, divergence_spike, signal_shift, conversion_drop), severity (warning/critical), acknowledgment tracking.
- `Experiment` — A/B experiment definition (name, status, variants JSON, traffic percent, metrics config).
- `ExperimentAssignment` — deterministic session-to-variant mapping via SHA-256 hash.
- `Rollout` — staged config deployment (stages JSON, currentStage, healthCriteria JSON, linked experimentId).

Schema: `packages/db/prisma/schema.prisma`. Run `npm run db:push` after changes.

## Evaluation Engine

Three modes controlled by `EVAL_ENGINE` env var:

| Mode            | LLM Calls   | Latency    | Use Case                                      |
| --------------- | ----------- | ---------- | --------------------------------------------- |
| `llm` (default) | Yes (Groq)  | ~500-800ms | Full pipeline, production with LLM validation |
| `fast`          | None        | ~0ms eval  | Zero-cost, rule-based signals only            |
| `auto`          | Conditional | ~0-800ms   | Fast-first, escalates to LLM for high-stakes  |

### Fast Engine (`src/evaluate/fast-evaluator.ts`)

- `runFastEvaluation()` — synthesizes all 5 MSWIM signal hints from session context (page type, cart value, login state, friction IDs) and feeds them into `runMSWIM()`.
- `shouldEscalateToLLM()` — triggers LLM path when: composite ≥ 65 (ACTIVE+), max friction severity ≥ 75, or gate forced escalation.
- `inferFrictionFromContext()` — maps session context (pageType, gate flags, cart state) to a contextual frictionId when behavioral events yield none (fixes frictionId=unknown on generic page_view sessions).

### Shadow Mode (`src/evaluate/shadow-evaluator.ts`)

- Runs MSWIM-no-LLM alongside production evaluation (fire-and-forget, non-blocking).
- Generates synthetic signal hints from session state, compares tier/decision/composite divergence.
- Enable via `SHADOW_MODE_ENABLED=true` in `.env`.
- Query shadow data via `/api/shadow/*` endpoints.

## Voice Intervention System

Two complementary voice modes — both use Deepgram APIs via plain `fetch` (zero SDK in widget).

### TTS Playback (Phase 1)
- Server attaches `voice_enabled: boolean` + `voice_script: string` (≤12 words) to every NUDGE/ACTIVE/ESCALATE payload.
- `VoiceManager` in widget receives these fields, calls Deepgram TTS REST endpoint, plays audio via `HTMLAudioElement`.
- **Budget gate** (server-side): voice disabled when `!VOICE_ENABLED` OR `session.voiceMuted` OR `session.totalVoiceInterventionsFired >= VOICE_MAX_PER_SESSION`.
- User can mute via 🔊 button in nudge bubble or panel header → widget sends `{ type: "intervention_outcome", status: "voice_muted" }` → server sets `session.voiceMuted = true`, records as "dismissed" for training consistency.
- Message templates (`src/intervene/message-templates.ts`): 30 categories × `{ message, voiceScript }`. `getFrictionCategory()` maps F001–F325 friction IDs to one of these 30 categories.

### ASR — Spoken Queries (Phase 2)
- Widget 🎙 mic button in panel footer: `getUserMedia` → `MediaRecorder` → Deepgram STT REST (`nova-2` model) → transcript string.
- Transcript sent as `{ type: "voice_query", session_id, transcript, timestamp }` WS message.
- Server `voice-responder.service.ts`: calls Groq LLM for a warm 1-2 sentence reply → broadcasts `active` intervention with `voice_enabled: true` + `voice_script` (first sentence, ≤80 chars) back to widget.
- Widget shows transcript as user bubble + typing indicator → receives `active` intervention → displays reply + plays TTS.
- Voice queries bypass proactive budget but still respect `voiceMuted` session flag.

### Environment Variables (Voice)
`DEEPGRAM_API_KEY` — Deepgram API key (used server-side for config; widget uses key from `window.__AVA_CONFIG__.deepgramApiKey`).
`VOICE_ENABLED=true|false` — global server toggle (default: false).
`VOICE_MAX_PER_SESSION=3` — max proactive TTS interventions per session.

### Widget Config (Voice)
Set in `window.__AVA_CONFIG__` on host store page:
- `voiceEnabled: true` — merchant-level voice toggle
- `deepgramApiKey: "..."` — Deepgram key for both TTS and ASR in browser
- `deepgramModel: "aura-asteria-en"` — TTS voice model
- `voiceMaxPerSession: 3` — client-side budget ceiling (server also enforces)
- `voiceAutoPlay: true` — autoplay on intervention delivery

## MSWIM Scoring

Formula: `composite = (intent × 0.25) + (friction × 0.25) + (clarity × 0.15) + (receptivity × 0.20) + (value × 0.15)`
All signals 0–100. Weights loaded from `ScoringConfig` table.
Tiers: 0–29 MONITOR, 30–49 PASSIVE, 50–64 NUDGE, 65–79 ACTIVE, 80+ ESCALATE.
12 hard gate overrides in `apps/server/src/evaluate/mswim/gate-checks.ts`.
Signal calculators: `apps/server/src/evaluate/mswim/signals/*.signal.ts`.

## Training & ML Pipeline

### Data Collection (`src/training/training-collector.service.ts`)

- `captureTrainingDatapoint()` fires on terminal outcomes (dismissed/converted/ignored).
- Loads full chain: intervention → evaluation → session → events.
- Non-blocking, idempotent (skips if already captured).
- Flow: Widget outcome → `recordInterventionOutcome()` → `captureTrainingDatapoint()` → TrainingDatapoint row.

### Quality Grading (`src/training/training-quality.service.ts`)

- 11 quality checks across 4 dimensions: data completeness, signal confidence, outcome reliability, context richness.
- 4-tier grading: `high` (≥75) / `medium` (≥50) / `low` (≥25) / `rejected`.
- Critical checks (valid_outcome, scores_valid, min_event_count) hard-reject on failure.

### Fine-Tune Export (`src/training/training-export.service.ts` + `scripts/fine-tune.ts`)

- `exportAsJsonl()` — one JSON per line, structured as `{input, output, decision, outcome, meta}`.
- `exportAsCsv()` — flattened for spreadsheet analysis.
- Fine-tune script: load → filter by outcome → quality grade → format → write JSONL → (optional) submit.
- Provider presets: `--provider local|openai|groq`.

### Eval Harness (`scripts/eval-harness.ts` + `src/jobs/eval-harness-lib.ts`)

- 5 evaluation dimensions: tier accuracy, decision metrics, signal calibration, segment analysis, regression detection.
- 5 automated regression flags: low effectiveness, high dismissals, missed conversions, ESCALATE underperformance, weak signal separation.
- Stratified or random sampling. JSON report + optional CSV summary.

## Continuous Learning System

### Nightly Batch (`src/jobs/`)

- `job-runner.ts` — setTimeout-based scheduler, 2:00 AM UTC (configurable via `NIGHTLY_BATCH_HOUR`).
- `nightly-batch.job.ts` — 7 sequential subtasks: quality aggregation, eval harness, drift snapshots, drift alerts, rollout health, daily summary, stale data cleanup.
- `eval-harness-lib.ts` — extracted eval logic reused by CLI script and nightly batch.

### Drift Detection (`src/jobs/drift-detector.ts`)

- Sliding window analysis: 1h, 6h, 24h, 7d.
- 5 alert types: `tier_agreement_drop`, `decision_agreement_drop`, `divergence_spike`, `signal_shift`, `conversion_drop`.
- Deduplication prevents duplicate alerts within 6 hours.
- Thresholds configurable in `config.ts`: tierAgreementFloor (0.70), decisionAgreementFloor (0.75), maxCompositeDivergence (15).

### A/B Experiments (`src/experiment/`)

- `experiment.service.ts` — lifecycle: create (draft) → start (running) → pause → end (completed).
- `experiment-assigner.ts` — deterministic SHA-256 hash bucketing. Same sessionId always maps to same variant.
- `experiment-metrics.ts` — two-proportion z-test for statistical significance (95% confidence default).
- `experiment-resolver.ts` — hooks into evaluate pipeline to apply experiment overrides before engine selection.

### Gradual Rollout (`src/rollout/`)

- `rollout.service.ts` — staged deployment: pending → rolling → paused → completed/rolled_back. Creates linked Experiment for traffic splitting.
- `rollout-health.service.ts` — evaluates health per stage (minConversionRate, maxDismissalRate, minSampleSize). Auto-promotes after stage duration. Auto-rollback on critical failures.

## Coding Rules

- All shared types go in `packages/shared/src/types/`. Import as `@ava/shared`.
- All DB access through repositories in `packages/db/src/repositories/`. Import as `@ava/db`.
- Never put business logic in API routes — routes call services, services contain logic.
- WebSocket messages are typed. Every message has `{ type: string, payload: T, session_id: string, timestamp: number }`. Widget → server message types: `track`, `ping`, `intervention_outcome` (statuses: delivered/dismissed/converted/ignored/voice_muted), `voice_query` (Phase 2 ASR). Server → widget message types: `intervention`, `track_ack`, `outcome_ack`, `voice_query_ack`.
- Widget code must have ZERO external dependencies. No React, no lodash, nothing. Shadow DOM for style isolation.
- Behavior catalog (B001-B614) lives in `packages/shared/src/constants/behavior-pattern-catalog.ts`.
- LLM prompts live in `apps/server/src/evaluate/prompts/`. System prompt instructs LLM to return strict JSON with 5 signal scores.
- Friction catalog (F001–F325) in `packages/shared/src/constants/friction-catalog.ts`. Reference by friction_id everywhere.
- Severity scores per friction_id in `packages/shared/src/constants/severity-scores.ts`.
- Onboarding results must be persisted in mapping/status tables; no in-memory-only integration state.
- Activation is mode-based:
  - `active` only when full go-live thresholds pass.
  - `limited_active` allowed below thresholds to avoid revenue loss, with guarded behavior and feedback loop.
- Training datapoints are captured automatically on terminal outcomes — no manual triggering needed.
- Shadow evaluator is fire-and-forget — must never block or slow production evaluation path.
- Experiment assignment must be deterministic — same session always gets same variant.
- Drift alerts deduplicate within 6-hour windows — do not create duplicate alerts.
- Rollout health checks use linked Experiment metrics — never bypass the experiment framework.
- Analytics side-effects in `track.service.ts` (incrementPageViews, setEntryPage, setExitPage, accumulateTimeOnSite) are fire-and-forget — always `.catch(() => {})`, never `await` them.
- Dashboard analytics APIs are lazily polled — only fetch when the relevant tab is active (`isTrackTab`, `isEvalTab` guards in `App.tsx`).
- Click heatmap data is stored in `rawSignals` JSON (no schema column needed) — query via `EventRepo.getClickCoordinates()` which extracts `x_pct`/`y_pct` from the JSON blob.
- `apiFetch(path, init?)` in `apps/dashboard/src/hooks/use-api.ts` accepts an optional `RequestInit` second argument — use it for all mutation calls (POST/PUT with body + headers).
- Voice fields (`voice_enabled`, `voice_script`) are computed in `payload-builder.ts` from the 30-category message templates — never hardcode voice scripts inline in services.
- `inferFrictionFromContext()` is the canonical fallback for frictionId resolution — call it from `evaluate.service.ts` when the events array yields no frictionIds; do not add fallback logic elsewhere.
- `voice-responder.service.ts` must always broadcast via `broadcastToSession("widget", sessionId, ...)` — never send directly on the `ws` socket for interventions (dashboard won't see them).
- Voice budget increment (`incrementVoiceInterventionsFired`) is always fire-and-forget — never `await` it in the hot path.
- `SpeechRecognizer.isSupported()` must be checked before instantiation — the class is only created when both `voiceEnabled && deepgramApiKey && isSupported()` are true.

## Commands

```
# Dev
npm run dev                                # Start all app dev scripts (Turborepo)
npm run dev:server                         # Backend only (:8080 + WS :8081)
npm run dev --workspace=@ava/agent         # Demo store (:3001)
npm run dev:integration                    # Demo integration wizard (:4002)
npm run dev:demo                           # Server + store + integration wizard
npm run dev:widget                         # Widget dev (:5173)
npm run dev:dashboard                      # Dashboard dev server (:3000)

# Database
npm run db:generate                        # Prisma client generate
npm run db:push                            # Apply schema to SQLite + generate client
npm run db:push:fast                       # Apply schema only (skip generate)
npm run db:seed                            # Seed friction catalog + MSWIM defaults
npm run db:setup                           # db:generate + db:push + db:seed

# Build
npm run build                              # Production build all apps

# ML Pipeline
npm run fine-tune                          # Run full fine-tune pipeline (load → grade → format → write JSONL)
npm run fine-tune:dry                      # Show stats only, no file write
npm run fine-tune:export                   # Export JSONL locally
npm run eval                               # Run evaluation harness
npm run eval:verbose                       # Eval with per-datapoint detail
npm run eval:csv                           # Eval with CSV summary output
```

## Environment

Required in `.env`: `GROQ_API_KEY`, `DATABASE_URL`, `PORT`, `WS_PORT`.

### MSWIM Defaults

`MSWIM_W_INTENT=0.25`, `MSWIM_W_FRICTION=0.25`, `MSWIM_W_CLARITY=0.15`, `MSWIM_W_RECEPTIVITY=0.20`, `MSWIM_W_VALUE=0.15`.
DB overrides env defaults via `ScoringConfig` table.

### Evaluation Engine

`EVAL_ENGINE=llm|fast|auto` — selects evaluation path (default: `llm`).

### Shadow Mode

`SHADOW_MODE_ENABLED=true|false` — enables dual-path shadow comparison (default: `false`).
`SHADOW_LOG_CONSOLE=true|false` — prints shadow results to console (default: `false`).

### Voice

`DEEPGRAM_API_KEY` — Deepgram REST API key (used by server config; widget reads from `window.__AVA_CONFIG__`).
`VOICE_ENABLED=true|false` — global server-side voice toggle (default: `false`).
`VOICE_MAX_PER_SESSION=3` — max proactive TTS interventions before budget exhausted.

### Nightly Jobs

`NIGHTLY_BATCH_HOUR=2` — UTC hour for nightly batch (default: `2`).
`DISABLE_SCHEDULER=true|false` — disables job scheduler for testing (default: `false`).

## API Endpoints (~62 total)

### Core

- `GET/POST /api/sessions` — session management. Supports `?since=<ISO timestamp>` to filter by start time.
- `POST /api/sessions/:id/events` — log track event (REST alternative to WS)
- `GET /api/events/:sessionId` — get events for session
- `GET /api/config/:siteUrl` — get site config
- `PUT /api/scoring-config/:siteUrl` — update MSWIM weights per site
- `POST /api/onboarding/start` — start onboarding run
- `GET /api/integration/:siteUrl/status` — integration status

### Analytics

- `GET /api/analytics/overview` — summary metrics: bounceRate, avgSessionDurationMs, avgPageViewsPerSession, top friction IDs, intervention outcomes. Supports `?siteUrl=&since=`.
- `GET /api/analytics/session/:sessionId` — MSWIM signal timeline + intervention outcomes for one session
- `GET /api/analytics/funnel` — conversion funnel step counts (`?siteUrl=&since=&steps=`)
- `GET /api/analytics/flow` — top page-to-page transitions (`?siteUrl=&since=&limit=`)
- `GET /api/analytics/traffic` — referrerType breakdown with conversion rates (`?siteUrl=&since=`)
- `GET /api/analytics/devices` — device type breakdown (`?siteUrl=&since=`)
- `GET /api/analytics/pages` — per-page avg time-on-page + avg scroll depth (`?siteUrl=&since=`)
- `GET /api/analytics/sessions/trend` — session volume by day/week (`?siteUrl=&since=&until=&bucket=`)
- `GET /api/analytics/retention` — weekly retention cohort table (`?siteUrl=&since=&until=`)
- `GET /api/analytics/clicks` — click coordinate points for heatmap (`?siteUrl=&since=&pageUrl=&limit=`)

### Training Data

- `GET /api/training/stats` — dataset summary stats
- `GET /api/training/distribution` — tier × outcome cross-tab
- `GET /api/training/export/jsonl` — download as JSONL file
- `GET /api/training/export/csv` — download as CSV file
- `GET /api/training/export/json` — JSON array response
- `GET /api/training/quality/stats` — quality grade distribution
- `GET /api/training/quality/assess` — per-datapoint quality assessments
- `GET /api/training/export/fine-tune` — chat fine-tuning JSONL
- `GET /api/training/export/fine-tune/preview` — preview formatted examples

### Shadow Comparison

- `GET /api/shadow/stats` — agreement rates, avg divergence, tier distribution
- `GET /api/shadow/comparisons` — filtered paginated comparison list
- `GET /api/shadow/session/:sessionId` — all comparisons for one session
- `GET /api/shadow/divergences` — top divergence cases

### Jobs & Drift

- `GET /api/jobs/runs` — list job runs
- `GET /api/jobs/runs/:id` — get job run details
- `POST /api/jobs/trigger` — manually trigger a job
- `GET /api/jobs/next-run` — next scheduled run time
- `GET /api/drift/status` — current drift status
- `GET /api/drift/snapshots` — drift snapshots
- `GET /api/drift/alerts` — drift alerts
- `POST /api/drift/alerts/:id/ack` — acknowledge alert
- `POST /api/drift/check` — trigger drift check

### Experiments

- `GET /api/experiments` — list experiments
- `POST /api/experiments` — create experiment
- `GET /api/experiments/:id` — get experiment
- `POST /api/experiments/:id/start` — start experiment
- `POST /api/experiments/:id/pause` — pause experiment
- `POST /api/experiments/:id/end` — end experiment
- `GET /api/experiments/:id/results` — get experiment results with significance

### Rollouts

- `GET /api/rollouts` — list rollouts
- `POST /api/rollouts` — create rollout
- `GET /api/rollouts/:id` — get rollout
- `POST /api/rollouts/:id/start` — start rollout
- `POST /api/rollouts/:id/promote` — promote to next stage
- `POST /api/rollouts/:id/rollback` — rollback rollout
- `POST /api/rollouts/:id/pause` — pause rollout

All endpoints accept query params: `?outcome=converted&tier=ACTIVE&siteUrl=...&since=...&until=...&limit=100&offset=0`

## Go-Live Modes & Thresholds

`active` (full mode) when all pass:

- Behavior mapping coverage `>= 85%` (B001-B614)
- Friction mapping coverage `>= 80%` (F001-F325)
- Average mapping confidence `>= 0.50`
- Critical journeys pass: add-to-cart, cart, checkout, payment

`limited_active` (revenue-protection mode) is allowed when thresholds are below target, with guardrails:

- TRACK and EVALUATE run immediately.
- INTERVENE is restricted to low-risk scope (PASSIVE + NUDGE by default).
- Use only high-confidence mappings for automated actions.
- Emit structured feedback on unmapped/low-confidence patterns until full thresholds are met.

## File Naming

- Services: `*.service.ts` — business logic orchestrators
- Handlers: `*.handlers.ts` — WebSocket/event handlers
- APIs: `*.api.ts` — Express route handlers
- Signals: `*.signal.ts` — MSWIM signal calculators
- Observers: `*.observer.ts` — widget-side behavior trackers
- Repos: `*.repo.ts` — database access layer
- Mappers: `*.mapper.ts` — onboarding mapping logic (behavior/friction)
- Runner/Verifier: `*runner.ts`, `*verifier.ts` — onboarding execution and validation
- Jobs: `*.job.ts` — scheduled batch jobs
- Scripts: `scripts/*.ts` — CLI tools (fine-tune, eval harness)

## Testing

Write tests alongside source files as `*.test.ts`. Test MSWIM signal calculators with known inputs/outputs. Test gate-checks with edge cases. Test onboarding mappers/verifier with coverage/confidence edge cases. Mock Groq API in evaluate/onboarding tests. Test fast-evaluator signal synthesis with known session contexts. Test shadow evaluator produces valid comparisons. Test experiment assigner determinism (same session → same variant). Test drift detector alert deduplication. Test rollout health auto-promote/rollback thresholds.

## Do Not

- Do not add dependencies to `apps/widget` — it must be zero-dep vanilla TS.
- Do not call Prisma directly from services — always go through repositories.
- Do not hardcode MSWIM weights — always load from `ScoringConfig` via `config-loader.ts`.
- Do not store raw PII — `visitorId` is an anonymous fingerprint, never email/name.
- Do not skip Zod validation on WebSocket messages — malformed events crash the pipeline.
- Do not set full `active` mode when go-live thresholds fail; use `limited_active`.
- Do not bypass `BehaviorPatternMapping` / `FrictionMapping` tables with hardcoded per-site logic.
- Do not await shadow evaluation in the production path — it must be fire-and-forget (`.then().catch()`).
- Do not create experiments with variant weights that don't sum to 1.0.
- Do not allow multiple active experiments for the same site simultaneously.
- Do not bypass the experiment framework when doing rollouts — rollouts create linked experiments.
- Do not manually compute drift metrics — always use `drift-detector.ts` sliding window functions.
- Do not run fine-tune export without quality grading — always filter by quality score first.
- Do not add a 4th dashboard tab — maximum 3 tabs (TRACK / EVALUATE / OPERATE). Analytics belong inside TRACK as collapsible sections.
- Do not await analytics side-effects in `track.service.ts` — they must be fire-and-forget to avoid blocking the event pipeline.
- Do not `GROUP BY` on `rawSignals` JSON fields in SQLite — promote key analytics fields to typed columns via the normalizer instead.
- Do not call `apiFetch` with only one argument when making mutations — always pass the `RequestInit` object (method, body, headers) as the second argument.
- Do not add voice TTS or ASR logic directly to `intervene.service.ts` or `track.service.ts` — TTS fields belong in `payload-builder.ts`; ASR handling belongs in `src/voice/voice-responder.service.ts`.
- Do not send `voice_query` WS messages from the widget without checking `SpeechRecognizer.isSupported()` first — mic APIs are not available in all browsers or secure contexts.
- Do not use the Deepgram SDK in `apps/widget` — widget must use plain `fetch` for both TTS and STT calls (zero-dep constraint).
- Do not expand `voice_script` beyond ~80 characters for TTS — longer scripts cause unnatural pacing and exceed the 12-word guideline for proactive interventions.
- Do not bypass `session.voiceMuted` when building voice payloads — always check the flag even for user-initiated voice queries.
