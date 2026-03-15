export const config = {
  port: Number(process.env.PORT ?? 8080),
  wsPort: Number(process.env.WS_PORT ?? 8081),

  db: {
    url: process.env.DATABASE_URL ?? "file:./packages/db/prisma/dev.db",
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  },

  mswim: {
    weights: {
      intent: Number(process.env.MSWIM_W_INTENT ?? 0.25),
      friction: Number(process.env.MSWIM_W_FRICTION ?? 0.25),
      clarity: Number(process.env.MSWIM_W_CLARITY ?? 0.15),
      receptivity: Number(process.env.MSWIM_W_RECEPTIVITY ?? 0.20),
      value: Number(process.env.MSWIM_W_VALUE ?? 0.15),
    },
    thresholds: {
      monitor: Number(process.env.MSWIM_T_MONITOR ?? 29),
      passive: Number(process.env.MSWIM_T_PASSIVE ?? 49),
      nudge: Number(process.env.MSWIM_T_NUDGE ?? 64),
      active: Number(process.env.MSWIM_T_ACTIVE ?? 79),
    },
  },

  evaluation: {
    batchIntervalMs: 5000,  // 5 seconds
    batchMaxEvents: 10,
    maxContextEvents: 50,   // last 50 events for context
  },

  shadow: {
    enabled: process.env.SHADOW_MODE_ENABLED === "true" || process.env.SHADOW_MODE_ENABLED === "1",
    logToConsole: process.env.SHADOW_LOG_CONSOLE === "true",
  },

  // Evaluation engine selection:
  //   "llm"  — Full LLM call + MSWIM (default, current behavior)
  //   "fast" — Rule-derived signals + MSWIM, zero LLM calls
  //   "auto" — Fast engine first, escalates to LLM for high-stakes scenarios
  evalEngine: (process.env.EVAL_ENGINE ?? "llm") as "llm" | "fast" | "auto",

  // Job scheduler
  jobs: {
    nightlyHourUTC: Number(process.env.NIGHTLY_BATCH_HOUR ?? 2),
    canaryCheckIntervalHours: Number(process.env.CANARY_CHECK_HOURS ?? 4),
    hourlySnapshotEnabled: process.env.HOURLY_SNAPSHOT_ENABLED !== "false",
    disableScheduler: process.env.DISABLE_SCHEDULER === "true",
  },

  // Drift detection thresholds
  drift: {
    tierAgreementFloor: Number(process.env.DRIFT_TIER_AGREEMENT_FLOOR ?? 0.70),
    decisionAgreementFloor: Number(process.env.DRIFT_DECISION_AGREEMENT_FLOOR ?? 0.75),
    maxCompositeDivergence: Number(process.env.DRIFT_MAX_DIVERGENCE ?? 15),
    signalShiftThreshold: Number(process.env.DRIFT_SIGNAL_SHIFT ?? 10),
    conversionRateDropPercent: Number(process.env.DRIFT_CONVERSION_DROP ?? 0.20),
    snapshotRetentionDays: Number(process.env.DRIFT_RETENTION_DAYS ?? 90),
  },

  // Experiment framework
  experiments: {
    enabled: process.env.EXPERIMENTS_ENABLED !== "false",
  },

  // Revenue attribution control group (Story 5)
  // CONTROL_GROUP_PCT % of sessions receive no interventions — used as baseline.
  // Deterministic: SHA-256(sessionId) % 100 < pct → control.
  controlGroupPct: Number(process.env.CONTROL_GROUP_PCT ?? 5),

  // Voice interventions (Deepgram TTS — server sends voice_script; widget synthesizes audio)
  voice: {
    deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
    enabled: process.env.VOICE_ENABLED === "true",
    maxPerSession: Number(process.env.VOICE_MAX_PER_SESSION ?? 3),
  },
} as const;

export type Config = typeof config;
