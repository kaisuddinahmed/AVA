import { Router, raw } from "express";
import * as sessionsApi from "./sessions.api.js";
import * as eventsApi from "./events.api.js";
import * as configApi from "./config.api.js";
import * as scoringConfigApi from "./scoring-config.api.js";
import * as analyticsApi from "./analytics.api.js";
import * as onboardingApi from "./onboarding.api.js";
import * as integrationApi from "./integration.api.js";
import * as trainingApi from "./training.api.js";
import * as shadowApi from "./shadow.api.js";
import * as jobsApi from "./jobs.api.js";
import * as driftApi from "./drift.api.js";
import * as experimentsApi from "./experiments.api.js";
import * as rolloutsApi from "./rollouts.api.js";
import * as voiceProxyApi from "../voice/voice-proxy.api.js";
import * as insightsApi from "./insights.api.js";
import * as webhooksApi from "./webhooks.api.js";

export const apiRouter = Router();

// Sessions
apiRouter.get("/sessions", sessionsApi.listSessions);
apiRouter.get("/sessions/:id", sessionsApi.getSession);
apiRouter.post("/sessions/:id/end", sessionsApi.endSession);

// Events
apiRouter.get("/sessions/:sessionId/events", eventsApi.getEvents);

// Config
apiRouter.get("/config", configApi.getConfig);

// Scoring Config (MSWIM weight profiles)
apiRouter.get("/scoring-configs", scoringConfigApi.listConfigs);
apiRouter.get("/scoring-configs/:id", scoringConfigApi.getConfig);
apiRouter.post("/scoring-configs", scoringConfigApi.createConfig);
apiRouter.put("/scoring-configs/:id", scoringConfigApi.updateConfig);
apiRouter.post("/scoring-configs/:id/activate", scoringConfigApi.activateConfig);
apiRouter.delete("/scoring-configs/:id", scoringConfigApi.deleteConfig);

// Analytics
apiRouter.get("/analytics/overview", analyticsApi.getOverview);
apiRouter.get("/analytics/session/:sessionId", analyticsApi.getSessionAnalytics);
apiRouter.get("/analytics/funnel", analyticsApi.getFunnel);
apiRouter.get("/analytics/flow", analyticsApi.getPageFlow);
apiRouter.get("/analytics/traffic", analyticsApi.getTrafficSources);
apiRouter.get("/analytics/devices", analyticsApi.getDevices);
apiRouter.get("/analytics/pages", analyticsApi.getPageStats);
apiRouter.get("/analytics/sessions/trend", analyticsApi.getSessionsTrend);
apiRouter.get("/analytics/retention", analyticsApi.getRetention);
apiRouter.get("/analytics/clicks", analyticsApi.getClickHeatmap);
apiRouter.get("/analytics/voice", analyticsApi.getVoiceAnalytics);
apiRouter.get("/analytics/friction", analyticsApi.getFrictionAnalytics);
apiRouter.get("/analytics/revenue", analyticsApi.getRevenueAttribution);

// Onboarding
apiRouter.post("/onboarding/start", onboardingApi.startOnboarding);
apiRouter.get("/onboarding/:runId/status", onboardingApi.getOnboardingStatus);
apiRouter.get("/onboarding/:runId/results", onboardingApi.getOnboardingResults);

// Integration
apiRouter.get("/site/status", integrationApi.getSiteStatus);          // widget activation gate
apiRouter.post("/site/reset", integrationApi.resetSiteStatus);        // demo: reset to dormant
apiRouter.post("/integration/generate", integrationApi.generateIntegration);                    // wizard: generate siteKey + snippet
apiRouter.get("/integration/:siteKey/install-status", integrationApi.getInstallStatus);        // wizard: poll for tag installation (3-state)
apiRouter.post("/integration/:siteId/verify", integrationApi.verifyIntegration);
apiRouter.post("/integration/:siteId/activate", integrationApi.activateIntegration);

// Widget bundle (served with CORS so any site can load it via <script src>)
apiRouter.get("/widget.js", integrationApi.serveWidget);

// Training Data Export
apiRouter.get("/training/stats", trainingApi.getStats);
apiRouter.get("/training/distribution", trainingApi.getDistribution);
apiRouter.get("/training/export/jsonl", trainingApi.exportJsonl);
apiRouter.get("/training/export/csv", trainingApi.exportCsv);
apiRouter.get("/training/export/json", trainingApi.exportJson);
apiRouter.get("/training/export/fine-tune", trainingApi.exportFineTune);
apiRouter.get("/training/export/fine-tune/preview", trainingApi.previewFineTune);
apiRouter.get("/training/quality/stats", trainingApi.getQuality);
apiRouter.get("/training/quality/assess", trainingApi.assessDatapoints);

// Shadow Mode Comparisons
apiRouter.get("/shadow/stats", shadowApi.getStats);
apiRouter.get("/shadow/comparisons", shadowApi.listComparisons);
apiRouter.get("/shadow/session/:sessionId", shadowApi.getSessionComparisons);
apiRouter.get("/shadow/divergences", shadowApi.getTopDivergences);

// Jobs (Scheduled)
apiRouter.get("/jobs/runs", jobsApi.listJobRuns);
apiRouter.get("/jobs/runs/:id", jobsApi.getJobRun);
apiRouter.post("/jobs/trigger", jobsApi.triggerJob);
apiRouter.get("/jobs/next-run", jobsApi.getNextRun);

// Drift Detection
apiRouter.get("/drift/status", driftApi.getStatus);
apiRouter.get("/drift/snapshots", driftApi.listSnapshots);
apiRouter.get("/drift/alerts", driftApi.listAlerts);
apiRouter.post("/drift/alerts/:id/ack", driftApi.acknowledgeAlert);
apiRouter.post("/drift/check", driftApi.triggerDriftCheck);

// Experiments (A/B Testing)
apiRouter.get("/experiments", experimentsApi.list);
apiRouter.post("/experiments", experimentsApi.create);
apiRouter.get("/experiments/:id", experimentsApi.get);
apiRouter.post("/experiments/:id/start", experimentsApi.start);
apiRouter.post("/experiments/:id/pause", experimentsApi.pause);
apiRouter.post("/experiments/:id/end", experimentsApi.end);
apiRouter.get("/experiments/:id/results", experimentsApi.results);

// Voice Proxy (keeps Deepgram API key server-side)
apiRouter.post("/voice/tts", voiceProxyApi.ttsProxy);
// express.raw() applied at route level — STT body is binary audio
apiRouter.post("/voice/sst", raw({ type: "*/*", limit: "10mb" }), voiceProxyApi.sstProxy);

// Insights (Weekly digest + CRO recommendations)
apiRouter.get("/insights/latest", insightsApi.getLatestInsights);
apiRouter.get("/insights/cro", insightsApi.getCROFindings);

// Webhooks (Session-exit behavioral triggers)
apiRouter.get("/webhooks/stats", webhooksApi.getWebhookStats);
apiRouter.put("/webhooks/config", webhooksApi.updateWebhookConfig);

// Rollouts (Gradual Config Changes)
apiRouter.get("/rollouts", rolloutsApi.list);
apiRouter.post("/rollouts", rolloutsApi.create);
apiRouter.get("/rollouts/:id", rolloutsApi.get);
apiRouter.post("/rollouts/:id/start", rolloutsApi.start);
apiRouter.post("/rollouts/:id/promote", rolloutsApi.promote);
apiRouter.post("/rollouts/:id/rollback", rolloutsApi.rollback);
apiRouter.post("/rollouts/:id/pause", rolloutsApi.pauseRolloutEndpoint);
