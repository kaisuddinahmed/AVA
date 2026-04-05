import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const probeHosts = ["127.0.0.1", "::1", "localhost"];

const targets = [
  {
    name: "server",
    cmd: npmCmd,
    args: ["run", "dev", "--workspace=@ava/server"],
  },
  {
    name: "store",
    cmd: "node",
    args: ["scripts/serve-store.mjs"],
  },
  {
    name: "dashboard",
    cmd: "node",
    args: ["scripts/serve-static.mjs", "apps/dashboard/dist", "3000"],
  },
  {
    name: "wizard",
    cmd: "node",
    args: ["scripts/serve-static.mjs", "apps/wizard/dist", "3002"],
  },
  {
    name: "store-admin",
    cmd: "node",
    args: ["apps/store/admin-server.js"],
  },
  {
    name: "integration",
    cmd: "node",
    args: ["scripts/serve-static.mjs", "apps/demo/dist", "4002"],
  },
];

const children = [];
let shuttingDown = false;
let readyAnnounced = false;
const requiredPorts = [8080, 3001, 3000, 3002, 3003, 4002];
const startupPorts = [
  { port: 8080, service: "server" },
  { port: 3001, service: "store" },
  { port: 3000, service: "dashboard" },
  { port: 3002, service: "wizard" },
  { port: 3003, service: "store-admin" },
  { port: 4002, service: "integration" },
];
const autoCleanEnabled = process.env.AVA_DEMO_AUTOCLEAN !== "0";

await ensureDatabase();
await preflight();

for (const target of targets) {
  console.log(`[dev:demo] starting ${target.name}: ${target.cmd} ${target.args.join(" ")}`);
  const child = spawn(target.cmd, target.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  child.on("spawn", () => {
    console.log(`[dev:demo] ${target.name} started (pid: ${child.pid ?? "n/a"})`);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[dev:demo] ${target.name} exited (${reason}). Stopping all...`);
    shutdown(code ?? 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev:demo] Failed to start ${target.name}:`, error);
    shutdown(1);
  });

  children.push(child);
}

const readinessInterval = setInterval(async () => {
  if (shuttingDown || readyAnnounced) return;

  const statuses = await Promise.all(requiredPorts.map(isPortOpen));
  const allUp = statuses.every(Boolean);
  const summary = requiredPorts
    .map((port, index) => `${port}:${statuses[index] ? "up" : "down"}`)
    .join(" ");

  if (allUp) {
    readyAnnounced = true;
    console.log("[dev:demo] Ready -> http://localhost:4002 (demo), http://localhost:3002 (wizard standalone), http://localhost:3001 (store), http://localhost:3003 (store admin), http://localhost:3000 (dashboard), http://localhost:8080/health (server)");
    clearInterval(readinessInterval);
    return;
  }

  console.log(`[dev:demo] Waiting for services... ${summary}`);
}, 5000);

setTimeout(() => {
  if (!readyAnnounced && !shuttingDown) {
    console.warn("[dev:demo] Startup is taking longer than expected. If this persists, run services one-by-one for diagnostics.");
  }
}, 60000).unref();

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(readinessInterval);

  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore.
    }
  }

  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore.
      }
    }
    process.exit(code);
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

/**
 * Resolve the SQLite path from DATABASE_URL (file:/path or file:./path).
 * Falls back to /tmp/ava-dev.db if env not set.
 */
function resolveDbPath() {
  let raw = process.env.DATABASE_URL ?? "file:/tmp/ava-dev.db";
  raw = raw.replace(/^file:/, "");
  if (!raw.startsWith("/")) {
    // relative path — resolve from repo root
    raw = new URL("../" + raw, import.meta.url).pathname;
  }
  return raw;
}

/**
 * Bootstrap the SQLite database if it doesn't exist or has no tables.
 * Uses the inline schema SQL so prisma CLI is never required.
 */
async function ensureDatabase() {
  const dbPath = resolveDbPath();
  let needsInit = !existsSync(dbPath);

  if (!needsInit) {
    // Also init if file exists but is empty or has stale datetime format.
    // Prisma WASM requires ISO 8601 (T-separator). SQLite CURRENT_TIMESTAMP
    // produces "YYYY-MM-DD HH:MM:SS" (space). Re-bootstrap if stale.
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const probe = new DatabaseSync(dbPath);
      const tables = probe.prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table'").get();
      if (tables.n === 0) {
        needsInit = true;
      } else {
        // Check datetime format on ScoringConfig — if space-separated, stale
        const row = probe.prepare("SELECT createdAt FROM \"ScoringConfig\" LIMIT 1").get();
        if (!row || !String(row.createdAt).includes("T")) {
          needsInit = true;
        }
      }
      probe.close();
    } catch {
      needsInit = true;
    }
  }

  if (needsInit && existsSync(dbPath)) {
    // Remove stale DB so we can create a fresh one
    const { unlinkSync } = await import("node:fs");
    try { unlinkSync(dbPath); } catch { /* ignore */ }
  }

  if (!needsInit) return;

  console.log(`[dev:demo] Database not found at ${dbPath} — bootstrapping schema...`);

  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

    db.exec(`
CREATE TABLE IF NOT EXISTS "Session" ("id" TEXT PRIMARY KEY,"visitorId" TEXT,"siteUrl" TEXT NOT NULL,"startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"deviceType" TEXT NOT NULL,"referrerType" TEXT NOT NULL,"isLoggedIn" INTEGER NOT NULL DEFAULT 0,"isRepeatVisitor" INTEGER NOT NULL DEFAULT 0,"cartValue" REAL NOT NULL DEFAULT 0,"cartItemCount" INTEGER NOT NULL DEFAULT 0,"status" TEXT NOT NULL DEFAULT 'active',"totalInterventionsFired" INTEGER NOT NULL DEFAULT 0,"totalDismissals" INTEGER NOT NULL DEFAULT 0,"totalConversions" INTEGER NOT NULL DEFAULT 0,"suppressNonPassive" INTEGER NOT NULL DEFAULT 0,"totalVoiceInterventionsFired" INTEGER NOT NULL DEFAULT 0,"voiceMuted" INTEGER NOT NULL DEFAULT 0,"attributedRevenue" REAL NOT NULL DEFAULT 0,"isControlSession" INTEGER NOT NULL DEFAULT 0,"endedAt" DATETIME,"totalPageViews" INTEGER NOT NULL DEFAULT 0,"totalTimeOnSiteMs" INTEGER,"entryPage" TEXT,"exitPage" TEXT,"landingReferrer" TEXT,"utmSource" TEXT,"utmMedium" TEXT,"utmCampaign" TEXT,"utmContent" TEXT,"utmTerm" TEXT);
CREATE INDEX IF NOT EXISTS "idx_session_visitor" ON "Session"("visitorId","siteUrl","startedAt");
CREATE INDEX IF NOT EXISTS "idx_session_site" ON "Session"("siteUrl","startedAt");

CREATE TABLE IF NOT EXISTS "TrackEvent" ("id" TEXT PRIMARY KEY,"sessionId" TEXT NOT NULL REFERENCES "Session"("id"),"timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"category" TEXT NOT NULL,"eventType" TEXT NOT NULL,"frictionId" TEXT,"pageType" TEXT NOT NULL,"pageUrl" TEXT NOT NULL,"rawSignals" TEXT NOT NULL,"metadata" TEXT,"previousPageUrl" TEXT,"timeOnPageMs" INTEGER,"scrollDepthPct" INTEGER,"sessionSequenceNumber" INTEGER,"siteUrl" TEXT);
CREATE INDEX IF NOT EXISTS "idx_event_session" ON "TrackEvent"("sessionId","timestamp");
CREATE INDEX IF NOT EXISTS "idx_event_friction" ON "TrackEvent"("frictionId");
CREATE INDEX IF NOT EXISTS "idx_event_site" ON "TrackEvent"("siteUrl","pageType","timestamp");

CREATE TABLE IF NOT EXISTS "Evaluation" ("id" TEXT PRIMARY KEY,"sessionId" TEXT NOT NULL REFERENCES "Session"("id"),"timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"eventBatchIds" TEXT NOT NULL,"narrative" TEXT NOT NULL,"frictionsFound" TEXT NOT NULL,"intentScore" REAL NOT NULL,"frictionScore" REAL NOT NULL,"clarityScore" REAL NOT NULL,"receptivityScore" REAL NOT NULL,"valueScore" REAL NOT NULL,"engine" TEXT NOT NULL DEFAULT 'llm',"compositeScore" REAL NOT NULL,"weightsUsed" TEXT NOT NULL,"tier" TEXT NOT NULL,"decision" TEXT NOT NULL,"gateOverride" TEXT,"interventionType" TEXT,"reasoning" TEXT NOT NULL,"detectedBehaviors" TEXT,"abandonmentScore" REAL);
CREATE INDEX IF NOT EXISTS "idx_eval_session" ON "Evaluation"("sessionId","timestamp");

CREATE TABLE IF NOT EXISTS "Intervention" ("id" TEXT PRIMARY KEY,"sessionId" TEXT NOT NULL REFERENCES "Session"("id"),"evaluationId" TEXT NOT NULL UNIQUE REFERENCES "Evaluation"("id"),"timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"type" TEXT NOT NULL,"actionCode" TEXT NOT NULL DEFAULT '',"frictionId" TEXT NOT NULL,"payload" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'sent',"deliveredAt" DATETIME,"dismissedAt" DATETIME,"convertedAt" DATETIME,"ignoredAt" DATETIME,"conversionAction" TEXT,"mswimScoreAtFire" REAL NOT NULL DEFAULT 0,"tierAtFire" TEXT NOT NULL DEFAULT '',"cartValueAtFire" REAL,"cartValueAtConversion" REAL,"intentRaw" TEXT,"intentAction" TEXT,"intentCategory" TEXT,"intentAttributes" TEXT,"productsShown" TEXT,"turnIndex" INTEGER,"latencyMs" INTEGER,"mswimScore" REAL);
CREATE INDEX IF NOT EXISTS "idx_intervention_session" ON "Intervention"("sessionId","timestamp");
CREATE INDEX IF NOT EXISTS "idx_intervention_status" ON "Intervention"("status");

CREATE TABLE IF NOT EXISTS "ScoringConfig" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"siteUrl" TEXT,"isActive" INTEGER NOT NULL DEFAULT 0,"weightIntent" REAL NOT NULL DEFAULT 0.25,"weightFriction" REAL NOT NULL DEFAULT 0.25,"weightClarity" REAL NOT NULL DEFAULT 0.15,"weightReceptivity" REAL NOT NULL DEFAULT 0.20,"weightValue" REAL NOT NULL DEFAULT 0.15,"thresholdMonitor" REAL NOT NULL DEFAULT 29,"thresholdPassive" REAL NOT NULL DEFAULT 49,"thresholdNudge" REAL NOT NULL DEFAULT 64,"thresholdActive" REAL NOT NULL DEFAULT 79,"minSessionAgeSec" INTEGER NOT NULL DEFAULT 30,"maxActivePerSession" INTEGER NOT NULL DEFAULT 2,"maxNudgePerSession" INTEGER NOT NULL DEFAULT 3,"maxNonPassivePerSession" INTEGER NOT NULL DEFAULT 6,"cooldownAfterActiveSec" INTEGER NOT NULL DEFAULT 120,"cooldownAfterNudgeSec" INTEGER NOT NULL DEFAULT 60,"cooldownAfterDismissSec" INTEGER NOT NULL DEFAULT 300,"dismissalsToSuppress" INTEGER NOT NULL DEFAULT 3,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("siteUrl","isActive"));

CREATE TABLE IF NOT EXISTS "SiteConfig" ("id" TEXT PRIMARY KEY,"siteUrl" TEXT NOT NULL UNIQUE,"siteKey" TEXT UNIQUE,"platform" TEXT NOT NULL DEFAULT 'custom',"trackingConfig" TEXT NOT NULL DEFAULT '{}',"integrationStatus" TEXT NOT NULL DEFAULT 'pending',"activeAnalyzerRunId" TEXT,"webhookUrl" TEXT,"webhookSecret" TEXT,"networkOptIn" INTEGER NOT NULL DEFAULT 1,"shopifyShop" TEXT,"shopifyAccessToken" TEXT,"shopifyScriptTagId" INTEGER,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS "ActivationPolicy" ("id" TEXT PRIMARY KEY,"siteConfigId" TEXT NOT NULL UNIQUE REFERENCES "SiteConfig"("id"),"behaviorMinPct" INTEGER NOT NULL DEFAULT 50,"frictionMinPct" INTEGER NOT NULL DEFAULT 50,"minConfidence" REAL NOT NULL DEFAULT 0.50,"requiredJourneys" TEXT,"tier" TEXT NOT NULL DEFAULT 'starter',"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS "AnalyzerRun" ("id" TEXT PRIMARY KEY,"siteConfigId" TEXT NOT NULL REFERENCES "SiteConfig"("id"),"startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" DATETIME,"status" TEXT NOT NULL DEFAULT 'queued',"phase" TEXT NOT NULL DEFAULT 'detect_platform',"behaviorCoverage" REAL NOT NULL DEFAULT 0,"frictionCoverage" REAL NOT NULL DEFAULT 0,"avgConfidence" REAL NOT NULL DEFAULT 0,"summary" TEXT,"errorMessage" TEXT);
CREATE INDEX IF NOT EXISTS "idx_run_site" ON "AnalyzerRun"("siteConfigId","startedAt");

CREATE TABLE IF NOT EXISTS "BehaviorPatternMapping" ("id" TEXT PRIMARY KEY,"analyzerRunId" TEXT NOT NULL REFERENCES "AnalyzerRun"("id"),"siteConfigId" TEXT NOT NULL REFERENCES "SiteConfig"("id"),"patternId" TEXT NOT NULL,"patternName" TEXT NOT NULL,"mappedFunction" TEXT NOT NULL,"eventType" TEXT NOT NULL,"selector" TEXT,"confidence" REAL NOT NULL,"source" TEXT NOT NULL,"evidence" TEXT,"isVerified" INTEGER NOT NULL DEFAULT 0,"isActive" INTEGER NOT NULL DEFAULT 1,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("siteConfigId","patternId","mappedFunction"));
CREATE INDEX IF NOT EXISTS "idx_bmap_site" ON "BehaviorPatternMapping"("siteConfigId","patternId");

CREATE TABLE IF NOT EXISTS "FrictionMapping" ("id" TEXT PRIMARY KEY,"analyzerRunId" TEXT NOT NULL REFERENCES "AnalyzerRun"("id"),"siteConfigId" TEXT NOT NULL REFERENCES "SiteConfig"("id"),"frictionId" TEXT NOT NULL,"detectorType" TEXT NOT NULL,"triggerEvent" TEXT NOT NULL,"selector" TEXT,"thresholdConfig" TEXT,"confidence" REAL NOT NULL,"evidence" TEXT,"isVerified" INTEGER NOT NULL DEFAULT 0,"isActive" INTEGER NOT NULL DEFAULT 1,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("siteConfigId","frictionId","triggerEvent"));
CREATE INDEX IF NOT EXISTS "idx_fmap_site" ON "FrictionMapping"("siteConfigId","frictionId");

CREATE TABLE IF NOT EXISTS "TrainingDatapoint" ("id" TEXT PRIMARY KEY,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"sessionId" TEXT NOT NULL,"evaluationId" TEXT NOT NULL,"interventionId" TEXT NOT NULL UNIQUE,"siteUrl" TEXT NOT NULL,"deviceType" TEXT NOT NULL,"referrerType" TEXT NOT NULL,"isLoggedIn" INTEGER NOT NULL,"isRepeatVisitor" INTEGER NOT NULL,"cartValue" REAL NOT NULL,"cartItemCount" INTEGER NOT NULL,"sessionAgeSec" INTEGER NOT NULL,"totalInterventionsFired" INTEGER NOT NULL,"totalDismissals" INTEGER NOT NULL,"totalConversions" INTEGER NOT NULL,"eventBatchIds" TEXT NOT NULL,"rawEventData" TEXT NOT NULL,"pageType" TEXT NOT NULL,"narrative" TEXT NOT NULL,"frictionsFound" TEXT NOT NULL,"intentScore" REAL NOT NULL,"frictionScore" REAL NOT NULL,"clarityScore" REAL NOT NULL,"receptivityScore" REAL NOT NULL,"valueScore" REAL NOT NULL,"compositeScore" REAL NOT NULL,"weightsUsed" TEXT NOT NULL,"tier" TEXT NOT NULL,"decision" TEXT NOT NULL,"gateOverride" TEXT,"interventionType" TEXT NOT NULL,"actionCode" TEXT NOT NULL,"frictionId" TEXT NOT NULL,"mswimScoreAtFire" REAL NOT NULL,"tierAtFire" TEXT NOT NULL,"outcome" TEXT NOT NULL,"conversionAction" TEXT,"outcomeDelayMs" INTEGER,"qualityFlags" TEXT,"userFeedback" TEXT);

CREATE TABLE IF NOT EXISTS "IntegrationStatus" ("id" TEXT PRIMARY KEY,"siteConfigId" TEXT NOT NULL REFERENCES "SiteConfig"("id"),"analyzerRunId" TEXT,"status" TEXT NOT NULL,"progress" INTEGER NOT NULL DEFAULT 0,"details" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "idx_istatus_site" ON "IntegrationStatus"("siteConfigId","status");

CREATE TABLE IF NOT EXISTS "ShadowComparison" ("id" TEXT PRIMARY KEY,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"sessionId" TEXT NOT NULL,"evaluationId" TEXT NOT NULL,"prodIntentScore" REAL NOT NULL,"prodFrictionScore" REAL NOT NULL,"prodClarityScore" REAL NOT NULL,"prodReceptivityScore" REAL NOT NULL,"prodValueScore" REAL NOT NULL,"prodCompositeScore" REAL NOT NULL,"prodTier" TEXT NOT NULL,"prodDecision" TEXT NOT NULL,"prodGateOverride" TEXT,"shadowIntentScore" REAL NOT NULL,"shadowFrictionScore" REAL NOT NULL,"shadowClarityScore" REAL NOT NULL,"shadowReceptivityScore" REAL NOT NULL,"shadowValueScore" REAL NOT NULL,"shadowCompositeScore" REAL NOT NULL,"shadowTier" TEXT NOT NULL,"shadowDecision" TEXT NOT NULL,"shadowGateOverride" TEXT,"compositeDivergence" REAL NOT NULL,"tierMatch" INTEGER NOT NULL,"decisionMatch" INTEGER NOT NULL,"gateOverrideMatch" INTEGER NOT NULL,"pageType" TEXT NOT NULL,"eventCount" INTEGER NOT NULL,"cartValue" REAL NOT NULL,"syntheticHints" TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS "JobRun" ("id" TEXT PRIMARY KEY,"jobName" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'running',"startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" DATETIME,"triggeredBy" TEXT NOT NULL DEFAULT 'scheduler',"summary" TEXT,"errorMessage" TEXT,"durationMs" INTEGER);
CREATE TABLE IF NOT EXISTS "DriftSnapshot" ("id" TEXT PRIMARY KEY,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"siteUrl" TEXT,"windowType" TEXT NOT NULL,"tierAgreementRate" REAL NOT NULL,"decisionAgreementRate" REAL NOT NULL,"avgCompositeDivergence" REAL NOT NULL,"sampleCount" INTEGER NOT NULL,"avgIntentConverted" REAL,"avgIntentDismissed" REAL,"avgFrictionConverted" REAL,"avgFrictionDismissed" REAL,"avgClarityConverted" REAL,"avgClarityDismissed" REAL,"avgReceptivityConverted" REAL,"avgReceptivityDismissed" REAL,"avgValueConverted" REAL,"avgValueDismissed" REAL,"avgCompositeConverted" REAL,"avgCompositeDismissed" REAL,"conversionRate" REAL,"dismissalRate" REAL);
CREATE TABLE IF NOT EXISTS "DriftAlert" ("id" TEXT PRIMARY KEY,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"siteUrl" TEXT,"alertType" TEXT NOT NULL,"severity" TEXT NOT NULL,"windowType" TEXT NOT NULL,"metric" TEXT NOT NULL,"expected" REAL NOT NULL,"actual" REAL NOT NULL,"message" TEXT NOT NULL,"acknowledged" INTEGER NOT NULL DEFAULT 0,"acknowledgedAt" DATETIME,"resolvedAt" DATETIME);
CREATE TABLE IF NOT EXISTS "Experiment" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"description" TEXT,"status" TEXT NOT NULL DEFAULT 'draft',"siteUrl" TEXT,"trafficPercent" INTEGER NOT NULL DEFAULT 100,"variants" TEXT NOT NULL,"primaryMetric" TEXT NOT NULL DEFAULT 'conversion_rate',"minSampleSize" INTEGER NOT NULL DEFAULT 100,"startedAt" DATETIME,"endedAt" DATETIME,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "ExperimentAssignment" ("id" TEXT PRIMARY KEY,"experimentId" TEXT NOT NULL REFERENCES "Experiment"("id"),"sessionId" TEXT NOT NULL,"variantId" TEXT NOT NULL,"assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("experimentId","sessionId"));
CREATE TABLE IF NOT EXISTS "Rollout" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'pending',"siteUrl" TEXT,"changeType" TEXT NOT NULL,"newConfigId" TEXT,"newEvalEngine" TEXT,"configPayload" TEXT,"stages" TEXT NOT NULL,"currentStage" INTEGER NOT NULL DEFAULT 0,"healthCriteria" TEXT NOT NULL,"experimentId" TEXT UNIQUE,"startedAt" DATETIME,"completedAt" DATETIME,"rolledBackAt" DATETIME,"rollbackReason" TEXT,"lastHealthCheck" DATETIME,"lastHealthStatus" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "InsightSnapshot" ("id" TEXT PRIMARY KEY,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"siteUrl" TEXT NOT NULL,"periodStart" DATETIME NOT NULL,"periodEnd" DATETIME NOT NULL,"sessionsAnalyzed" INTEGER NOT NULL DEFAULT 0,"frictionsCaught" INTEGER NOT NULL DEFAULT 0,"attributedRevenue" REAL NOT NULL DEFAULT 0,"topFrictionTypes" TEXT NOT NULL,"wowDeltaPct" REAL,"recommendations" TEXT NOT NULL,"croFindings" TEXT);
CREATE TABLE IF NOT EXISTS "WebhookDelivery" ("id" TEXT PRIMARY KEY,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"sessionId" TEXT NOT NULL,"siteUrl" TEXT NOT NULL,"url" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'pending',"attempts" INTEGER NOT NULL DEFAULT 0,"lastAttemptAt" DATETIME,"responseCode" INTEGER,"errorMessage" TEXT);
CREATE TABLE IF NOT EXISTS "VisitorAddress" ("id" TEXT PRIMARY KEY,"visitorKey" TEXT NOT NULL,"siteUrl" TEXT NOT NULL,"addressLine1" TEXT NOT NULL,"addressLine2" TEXT NOT NULL DEFAULT '',"city" TEXT NOT NULL,"state" TEXT NOT NULL,"postalCode" TEXT NOT NULL,"country" TEXT NOT NULL DEFAULT 'US',"lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("visitorKey","siteUrl"));
CREATE TABLE IF NOT EXISTS "NetworkPattern" ("id" TEXT PRIMARY KEY,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"frictionId" TEXT NOT NULL UNIQUE,"category" TEXT NOT NULL,"avgSeverity" REAL NOT NULL,"avgConversionImpact" REAL NOT NULL,"merchantCount" INTEGER NOT NULL,"totalSessions" INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS "InterventionFeedback" ("id" TEXT PRIMARY KEY,"interventionId" TEXT NOT NULL,"sessionId" TEXT NOT NULL,"feedback" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "ModelVersion" ("id" TEXT PRIMARY KEY,"provider" TEXT NOT NULL,"baseModel" TEXT NOT NULL,"fineTuneJobId" TEXT,"modelId" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'training',"trainingDatapointCount" INTEGER NOT NULL DEFAULT 0,"qualityStats" TEXT,"evalMetrics" TEXT,"promotedAt" DATETIME,"retiredAt" DATETIME,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "RetrainTrigger" ("id" TEXT PRIMARY KEY,"triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"reason" TEXT NOT NULL,"trainingDatapointCount" INTEGER NOT NULL,"modelVersionId" TEXT,"status" TEXT NOT NULL DEFAULT 'triggered',"completedAt" DATETIME,"error" TEXT);
`);

    // Seed ScoringConfig (minSessionAgeSec=5 for fast demo sessions)
    const uid = () => crypto.randomUUID();
    // Use ISO 8601 format — Prisma WASM adapter requires T-separator datetimes
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO "ScoringConfig" (id,name,siteUrl,isActive,weightIntent,weightFriction,weightClarity,weightReceptivity,weightValue,thresholdMonitor,thresholdPassive,thresholdNudge,thresholdActive,minSessionAgeSec,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid(),'default',null,1,0.25,0.25,0.15,0.20,0.15,29,49,64,79,5,now,now);
    db.prepare(`INSERT OR IGNORE INTO "ScoringConfig" (id,name,siteUrl,isActive,weightIntent,weightFriction,weightClarity,weightReceptivity,weightValue,thresholdMonitor,thresholdPassive,thresholdNudge,thresholdActive,minSessionAgeSec,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid(),'aggressive',null,0,0.25,0.30,0.15,0.15,0.15,20,39,54,69,5,now,now);
    db.prepare(`INSERT OR IGNORE INTO "ScoringConfig" (id,name,siteUrl,isActive,weightIntent,weightFriction,weightClarity,weightReceptivity,weightValue,thresholdMonitor,thresholdPassive,thresholdNudge,thresholdActive,minSessionAgeSec,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uid(),'conservative',null,0,0.25,0.20,0.15,0.25,0.15,34,54,69,84,10,now,now);

    // Seed demo SiteConfig
    const siteId = uid();
    db.prepare(`INSERT OR IGNORE INTO "SiteConfig" (id,siteUrl,siteKey,platform,trackingConfig,integrationStatus,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`).run(siteId,'http://localhost:3001','avak_eff0c37fabe8d527','custom','{}','pending',now,now);
    db.prepare(`INSERT OR IGNORE INTO "ActivationPolicy" (id,siteConfigId,behaviorMinPct,frictionMinPct,minConfidence,tier,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)`).run(uid(),siteId,50,50,0.50,'starter',now,now);

    db.close();
    console.log(`[dev:demo] ✅ Database bootstrapped at ${dbPath}`);
  } catch (err) {
    console.error("[dev:demo] ❌ Database bootstrap failed:", err.message);
    console.error("[dev:demo] Server will likely fail. Check DATABASE_URL in .env");
  }
}

async function preflight() {
  let occupied = await getOccupiedPorts();

  if (occupied.length === 0) return;

  if (autoCleanEnabled && !isWin) {
    await autoCleanOccupiedPorts(occupied);
    occupied = await getOccupiedPorts();
    if (occupied.length === 0) {
      console.log("[dev:demo] Cleared stale listeners. Continuing startup.");
      return;
    }
  }

  const detail = occupied.map((entry) => `${entry.port} (${entry.service})`).join(", ");
  console.error(`[dev:demo] Port(s) already in use: ${detail}`);
  for (const entry of occupied) {
    const listeners = getPortListeners(entry.port);
    if (!listeners.length) continue;
    for (const listener of listeners) {
      console.error(
        `[dev:demo] ${entry.port} listener pid=${listener.pid} cmd=${listener.command || "unknown"}`
      );
    }
  }
  if (autoCleanEnabled && isWin) {
    console.error("[dev:demo] Auto-clean is disabled on Windows. Stop the listed PIDs manually.");
  }
  console.error(
    '[dev:demo] Stop old processes first. Example: pkill -f "apps/server/src/index.ts|scripts/serve-store.mjs|apps/demo/vite.config.js"'
  );
  process.exit(1);
}

async function getOccupiedPorts() {
  const statuses = await Promise.all(startupPorts.map((entry) => isPortOpen(entry.port)));
  return startupPorts.filter((_, index) => statuses[index]);
}

async function autoCleanOccupiedPorts(occupied) {
  const pids = new Set();
  for (const entry of occupied) {
    for (const listener of getPortListeners(entry.port)) {
      if (listener?.pid) pids.add(listener.pid);
    }
  }
  if (pids.size === 0) return;

  const pidList = [...pids].join(", ");
  console.warn(`[dev:demo] Auto-clean: stopping stale listener PIDs ${pidList}`);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore: already exited or inaccessible.
    }
  }
  await delay(700);

  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore: no longer running.
    }
  }
  await delay(300);
}

function getPortListeners(port) {
  if (isWin) return [];
  const out = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"],
    { encoding: "utf8" },
  );
  if (out.status !== 0 || !out.stdout) return [];

  const lines = out.stdout.split("\n").filter(Boolean);
  const listeners = [];
  let current = null;

  for (const line of lines) {
    const type = line[0];
    const value = line.slice(1);
    if (type === "p") {
      if (current?.pid) listeners.push(current);
      current = { pid: Number(value), command: "" };
      continue;
    }
    if (type === "c") {
      if (!current) current = { pid: 0, command: "" };
      current.command = value;
    }
  }
  if (current?.pid) listeners.push(current);

  return listeners.filter((item) => Number.isFinite(item.pid) && item.pid > 0);
}

async function isPortOpen(port) {
  for (const host of probeHosts) {
    if (await isPortOpenOnHost(port, host)) {
      return true;
    }
  }
  return false;
}

function isPortOpenOnHost(port, host) {
  return new Promise((resolvePort) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolvePort(result);
    };

    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}
