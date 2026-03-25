#!/usr/bin/env tsx
// ============================================================================
// AVA Fine-Tune Script
// Exports training data, applies quality filters, formats for fine-tuning,
// and optionally submits to Groq or saves locally.
//
// Usage:
//   npx tsx scripts/fine-tune.ts [options]
//
// Options:
//   --provider    groq | local                    (default: local)
//   --output      path/to/output.jsonl            (default: data/fine-tune-{timestamp}.jsonl)
//   --min-grade   high | medium | low             (default: medium)
//   --min-samples N                                (default: 50)
//   --max-samples N                                (default: 5000)
//   --outcome     converted,dismissed              (default: converted,dismissed)
//   --tier        NUDGE,ACTIVE                     (optional filter)
//   --site        https://example.com              (optional filter)
//   --since       2025-01-01                       (optional date filter)
//   --until       2025-12-31                       (optional date filter)
//   --preset      groq | generic                   (format preset, default: matches provider)
//   --dry-run                                       (show stats only, don't write/submit)
//   --include-outcome-hint                          (add outcome label for reward modeling)
//   --submit                                        (submit to Groq API after export)
//
// Requires: server DB accessible (runs Prisma directly, not via HTTP)
// ============================================================================

import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";

// --- Prisma client bootstrap (direct DB access, no server needed) ---
// We import from the built @ava/db package
import { TrainingDatapointRepo, ModelVersionRepo } from "@ava/db";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const PROVIDER = getArg("provider", "local") as "groq" | "local";
const MIN_GRADE = getArg("min-grade", "medium") as "high" | "medium" | "low";
const MIN_SAMPLES = Number(getArg("min-samples", "50"));
const MAX_SAMPLES = Number(getArg("max-samples", "5000"));
const OUTCOME_FILTER = getArg("outcome", "converted,dismissed");
const TIER_FILTER = getArg("tier", "");
const SITE_FILTER = getArg("site", "");
const SINCE = getArg("since", "");
const UNTIL = getArg("until", "");
const PRESET = getArg("preset", PROVIDER === "local" ? "generic" : "groq") as
  | "groq"
  | "generic";
const DRY_RUN = hasFlag("dry-run");
const INCLUDE_OUTCOME_HINT = hasFlag("include-outcome-hint");
const SUBMIT = hasFlag("submit");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const DEFAULT_OUTPUT = `data/fine-tune-${PRESET}-${timestamp}.jsonl`;
const OUTPUT_PATH = resolve(getArg("output", DEFAULT_OUTPUT));

// ---------------------------------------------------------------------------
// Types (inline — script doesn't import from server src)
// ---------------------------------------------------------------------------

interface ChatFineTuningExample {
  messages: [
    { role: "system"; content: string },
    { role: "user"; content: string },
    { role: "assistant"; content: string },
  ];
}

interface QualityGradeInfo {
  grade: "high" | "medium" | "low" | "rejected";
  score: number;
}

// ---------------------------------------------------------------------------
// System prompt (same as production — keep in sync)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are AVA's Analyst — a behavioral analyst AI embedded in an ecommerce store.

You receive a stream of user behavioral events (TRACK data) for a single shopping session.
Your job is to:

1. NARRATE: Describe what the user is doing in natural prose (story form)
2. ANALYZE: Reason about their intent, hesitation, friction, and emotional state
3. SCORE: Provide raw scores for all 5 MSWIM signals
4. DECIDE: Recommend whether to intervene

Score each signal 0–100. Output strict JSON with: narrative, detected_frictions, signals (intent, friction, clarity, receptivity, value), recommended_action, reasoning.`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║            AVA Fine-Tuning Data Pipeline                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // 1. Load datapoints from DB
  console.log("▸ Loading training datapoints from database...");

  const listOptions: {
    limit: number;
    outcome?: string;
    tier?: string;
    siteUrl?: string;
    since?: Date;
    until?: Date;
  } = { limit: MAX_SAMPLES * 2 }; // overfetch to account for quality filtering

  if (TIER_FILTER) listOptions.tier = TIER_FILTER;
  if (SITE_FILTER) listOptions.siteUrl = SITE_FILTER;
  if (SINCE) listOptions.since = new Date(SINCE);
  if (UNTIL) listOptions.until = new Date(UNTIL);

  // Fetch all outcomes first, then filter in JS (repo only supports single outcome filter)
  const datapoints = await TrainingDatapointRepo.listDatapoints(listOptions);
  console.log(`  Found ${datapoints.length} total datapoints`);

  // 2. Filter by outcome
  const validOutcomes = new Set(OUTCOME_FILTER.split(",").map((o) => o.trim()));
  const outcomeFiltered = datapoints.filter((dp) => validOutcomes.has(dp.outcome));
  console.log(`  After outcome filter (${OUTCOME_FILTER}): ${outcomeFiltered.length}`);

  // 3. Quality scoring & grading
  console.log("▸ Running quality assessment...");
  const graded = outcomeFiltered.map((dp) => ({
    dp,
    quality: gradeDatapoint(dp),
  }));

  // Grade distribution
  const gradeDist = { high: 0, medium: 0, low: 0, rejected: 0 };
  for (const { quality } of graded) gradeDist[quality.grade]++;

  console.log(`  Quality distribution:`);
  console.log(`    High:     ${gradeDist.high}`);
  console.log(`    Medium:   ${gradeDist.medium}`);
  console.log(`    Low:      ${gradeDist.low}`);
  console.log(`    Rejected: ${gradeDist.rejected}`);

  // 4. Filter by min grade
  const gradeRank: Record<string, number> = { high: 3, medium: 2, low: 1, rejected: 0 };
  const minRank = gradeRank[MIN_GRADE] ?? 2;
  const qualified = graded
    .filter((g) => gradeRank[g.quality.grade] >= minRank)
    .sort((a, b) => b.quality.score - a.quality.score) // best quality first
    .slice(0, MAX_SAMPLES);

  console.log(`  After quality filter (>= ${MIN_GRADE}): ${qualified.length}`);

  if (qualified.length < MIN_SAMPLES) {
    console.error(
      `\n✗ Only ${qualified.length} samples pass quality checks (need >= ${MIN_SAMPLES}).`
    );
    console.error(`  Try relaxing --min-grade or collecting more training data.`);
    process.exit(1);
  }

  // 5. Format as chat fine-tuning JSONL
  console.log("▸ Formatting as chat fine-tuning examples...");
  const examples = qualified.map((g) =>
    formatExample(g.dp, INCLUDE_OUTCOME_HINT)
  );

  // 6. Compute stats
  const outcomeBreakdown: Record<string, number> = {};
  const tierBreakdown: Record<string, number> = {};
  let tokenEstimate = 0;

  for (const { dp } of qualified) {
    outcomeBreakdown[dp.outcome] = (outcomeBreakdown[dp.outcome] || 0) + 1;
    tierBreakdown[dp.tier] = (tierBreakdown[dp.tier] || 0) + 1;
  }

  for (const ex of examples) {
    tokenEstimate += ex.messages.reduce((s, m) => s + m.content.length, 0) / 4;
  }

  const avgTokens = Math.round(tokenEstimate / examples.length);
  const totalTokens = Math.round(tokenEstimate);

  console.log();
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                  Dataset Summary                          ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Examples:        ${String(examples.length).padStart(6)}                              ║`);
  console.log(`║  Avg tokens/ex:   ${String(avgTokens).padStart(6)}                              ║`);
  console.log(`║  Est total tokens:${String(totalTokens).padStart(7)}                              ║`);
  console.log(`║  Format preset:   ${PRESET.padStart(6)}                              ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Outcome breakdown:                                       ║");
  for (const [k, v] of Object.entries(outcomeBreakdown)) {
    const pct = ((v / examples.length) * 100).toFixed(1);
    console.log(`║    ${k.padEnd(12)} ${String(v).padStart(5)} (${pct.padStart(5)}%)                       ║`);
  }
  console.log("║  Tier breakdown:                                          ║");
  for (const [k, v] of Object.entries(tierBreakdown)) {
    const pct = ((v / examples.length) * 100).toFixed(1);
    console.log(`║    ${k.padEnd(12)} ${String(v).padStart(5)} (${pct.padStart(5)}%)                       ║`);
  }
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  if (DRY_RUN) {
    console.log("▸ --dry-run: Skipping file write and submission.");
    console.log("  Done.");
    return;
  }

  // 7. Write JSONL file
  const jsonl = examples.map((ex) => JSON.stringify(ex)).join("\n");

  const dir = dirname(OUTPUT_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(OUTPUT_PATH, jsonl + "\n", "utf-8");
  console.log(`✓ Wrote ${examples.length} examples to ${OUTPUT_PATH}`);
  console.log(`  File size: ${(Buffer.byteLength(jsonl, "utf-8") / 1024).toFixed(1)} KB`);

  // 8. Submit to provider (if requested)
  if (SUBMIT && PROVIDER !== "local") {
    console.log(`\n▸ Submitting to ${PROVIDER}...`);
    await submitToProvider(PROVIDER, OUTPUT_PATH, examples.length);
  }

  console.log("\n✓ Fine-tuning pipeline complete.");
}

// ---------------------------------------------------------------------------
// Quality grading (lightweight — mirrors training-quality.service.ts logic)
// ---------------------------------------------------------------------------

function gradeDatapoint(dp: {
  narrative: string;
  rawEventData: string;
  clarityScore: number;
  compositeScore: number;
  intentScore: number;
  frictionScore: number;
  receptivityScore: number;
  valueScore: number;
  sessionAgeSec: number;
  outcomeDelayMs: number | null;
  cartValue: number;
  frictionsFound: string;
  userFeedback: string | null;
}): QualityGradeInfo {
  let score = 50; // baseline

  // Event count
  let eventCount = 0;
  try {
    eventCount = JSON.parse(dp.rawEventData).length;
  } catch {
    /* empty */
  }

  if (eventCount < 2) return { grade: "rejected", score: 0 };
  if (eventCount >= 5) score += 10;
  if (eventCount >= 3) score += 5;

  // Narrative
  if (dp.narrative.length < 20) return { grade: "rejected", score: 5 };
  if (dp.narrative.length > 100) score += 5;

  // Scores validity
  const scores = [
    dp.intentScore,
    dp.frictionScore,
    dp.clarityScore,
    dp.receptivityScore,
    dp.valueScore,
  ];
  if (scores.some((s) => !Number.isFinite(s) || s < 0 || s > 100)) {
    return { grade: "rejected", score: 0 };
  }

  // Clarity
  if (dp.clarityScore >= 50) score += 15;
  else if (dp.clarityScore >= 30) score += 5;
  else if (dp.clarityScore < 15) score -= 15;

  // Composite non-degenerate
  if (dp.compositeScore >= 10 && dp.compositeScore <= 90) score += 5;

  // Session age
  if (dp.sessionAgeSec < 10) score -= 20;
  else if (dp.sessionAgeSec >= 30) score += 5;

  // Outcome delay (causal linkage)
  if (dp.outcomeDelayMs != null) {
    if (dp.outcomeDelayMs < 10000) score += 10;
    else if (dp.outcomeDelayMs > 300000) score -= 15;
  }

  // Frictions present
  try {
    const frictions = JSON.parse(dp.frictionsFound);
    if (Array.isArray(frictions) && frictions.length > 0) score += 5;
  } catch {
    /* empty */
  }

  // Cart context
  if (dp.cartValue > 0) score += 5;

  // User feedback signal (from widget thumbs up/down)
  if (dp.userFeedback === "helpful") score += 20;
  else if (dp.userFeedback === "not_helpful") score -= 25;

  // Clamp and grade
  score = Math.max(0, Math.min(100, score));

  let grade: QualityGradeInfo["grade"];
  if (score >= 75) grade = "high";
  else if (score >= 50) grade = "medium";
  else if (score >= 25) grade = "low";
  else grade = "rejected";

  return { grade, score };
}

// ---------------------------------------------------------------------------
// Format a single datapoint into a chat fine-tuning example
// ---------------------------------------------------------------------------

function formatExample(
  dp: {
    deviceType: string;
    referrerType: string;
    isLoggedIn: boolean;
    isRepeatVisitor: boolean;
    cartValue: number;
    cartItemCount: number;
    sessionAgeSec: number;
    totalInterventionsFired: number;
    totalDismissals: number;
    totalConversions: number;
    pageType: string;
    rawEventData: string;
    narrative: string;
    frictionsFound: string;
    intentScore: number;
    frictionScore: number;
    clarityScore: number;
    receptivityScore: number;
    valueScore: number;
    compositeScore: number;
    tier: string;
    decision: string;
    gateOverride: string | null;
    actionCode: string;
    outcome: string;
    outcomeDelayMs: number | null;
  },
  includeOutcomeHint: boolean
): ChatFineTuningExample {
  // Parse events
  let events: unknown[] = [];
  try {
    events = JSON.parse(dp.rawEventData);
  } catch {
    /* empty */
  }

  let frictionsFound: string[] = [];
  try {
    frictionsFound = JSON.parse(dp.frictionsFound);
  } catch {
    /* empty */
  }

  // User message (mirrors evaluate-prompt.ts format)
  const sessionMeta = {
    deviceType: dp.deviceType,
    referrerType: dp.referrerType,
    isLoggedIn: dp.isLoggedIn,
    isRepeatVisitor: dp.isRepeatVisitor,
    cartValue: dp.cartValue,
    cartItemCount: dp.cartItemCount,
    sessionAgeSec: dp.sessionAgeSec,
    totalInterventionsFired: dp.totalInterventionsFired,
    totalDismissals: dp.totalDismissals,
    totalConversions: dp.totalConversions,
    pageType: dp.pageType,
  };

  const eventLines = (events as Array<Record<string, unknown>>)
    .map((e, i) => `[${i + 1}] ${JSON.stringify(e)}`)
    .join("\n");

  const userContent = `═══ SESSION METADATA ═══
${JSON.stringify(sessionMeta, null, 2)}

═══ EVENTS ═══
${eventLines || "No events."}

Analyze the user's current session state and provide your evaluation in the required JSON format.`;

  // Assistant message (target output)
  const assistantOutput: Record<string, unknown> = {
    narrative: dp.narrative,
    detected_frictions: frictionsFound,
    signals: {
      intent: dp.intentScore,
      friction: dp.frictionScore,
      clarity: dp.clarityScore,
      receptivity: dp.receptivityScore,
      value: dp.valueScore,
    },
    recommended_action: dp.actionCode,
    reasoning: `Composite score ${dp.compositeScore.toFixed(1)} → ${dp.tier} tier. ${dp.gateOverride ? `Gate override: ${dp.gateOverride}.` : `Decision: ${dp.decision}.`}`,
  };

  if (includeOutcomeHint) {
    assistantOutput._outcome = {
      label: dp.outcome,
      delayMs: dp.outcomeDelayMs,
    };
  }

  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
      { role: "assistant", content: JSON.stringify(assistantOutput) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Provider submission — Groq SDK + ModelVersion tracking
// ---------------------------------------------------------------------------

async function submitToProvider(
  provider: "groq",
  filePath: string,
  exampleCount: number
): Promise<void> {
  const baseModel = "llama-3.3-70b-versatile";

  // Create ModelVersion record before submission
  const modelVersion = await ModelVersionRepo.createModelVersion({
    provider,
    baseModel,
    modelId: "pending",
    status: "training",
    trainingDatapointCount: exampleCount,
  });
  console.log(`  Created ModelVersion: ${modelVersion.id}`);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("  ✗ GROQ_API_KEY not set. ModelVersion created but submission skipped.");
    console.error(`    Set GROQ_API_KEY and re-run when Groq fine-tuning API is available.`);
    await ModelVersionRepo.updateModelVersion(modelVersion.id, { status: "ready", modelId: baseModel });
    return;
  }

  try {
    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey });

    // Upload file
    const { createReadStream } = await import("fs");
    const file = await (groq as any).files.create({
      file: createReadStream(filePath),
      purpose: "fine-tune",
    });
    console.log(`  Uploaded file: ${file.id} (${file.bytes} bytes)`);

    // Create fine-tuning job
    const job = await (groq as any).fineTuning.jobs.create({
      model: baseModel,
      training_file: file.id,
      suffix: `ava-${modelVersion.id.slice(0, 8)}`,
    });
    console.log(`  Fine-tune job: ${job.id} (status: ${job.status})`);

    await ModelVersionRepo.updateModelVersion(modelVersion.id, { fineTuneJobId: job.id });

    if (!hasFlag("no-wait")) {
      console.log("  Polling for completion (Ctrl+C to exit — job continues on Groq)...");
      let status = job.status;
      while (status !== "succeeded" && status !== "failed" && status !== "cancelled") {
        await new Promise((r) => setTimeout(r, 30000));
        const updated = await (groq as any).fineTuning.jobs.retrieve(job.id);
        status = updated.status;
        console.log(`  Status: ${status}`);
        if (status === "succeeded" && updated.fine_tuned_model) {
          await ModelVersionRepo.updateModelVersion(modelVersion.id, {
            status: "ready",
            modelId: updated.fine_tuned_model,
          });
          console.log(`  ✓ Fine-tuned model: ${updated.fine_tuned_model}`);
        } else if (status === "failed") {
          await ModelVersionRepo.updateModelVersion(modelVersion.id, { status: "retired" });
          console.error(`  ✗ Fine-tuning failed: ${updated.error?.message ?? "unknown error"}`);
        }
      }
    } else {
      console.log(`  --no-wait: Job submitted. Poll status via: GET /api/training/fine-tune/status/${job.id}`);
    }
  } catch (err) {
    console.log(`  Groq fine-tuning API not yet available: ${(err as Error).message}`);
    console.log(`  ModelVersion created with base model. JSONL file saved at: ${filePath}`);
    await ModelVersionRepo.updateModelVersion(modelVersion.id, { status: "ready", modelId: baseModel });
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("Fine-tune pipeline failed:", err);
  process.exit(1);
});
