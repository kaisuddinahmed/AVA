import { useEffect, useMemo, useRef } from "react";
import { useActivation } from "./hooks/use-activation";
import { useWS } from "./hooks/use-ws";
import { useDashboardStore } from "./hooks/use-dashboard-store";
import { useApi } from "./hooks/use-api";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { TrackTab } from "./components/TrackTab";
import { EvaluateTab } from "./components/EvaluateTab";
import { InterveneTab } from "./components/InterveneTab";
import { InactiveOverlay } from "./components/InactiveOverlay";
import type { SessionSummary, OverviewAnalytics, FrictionAnalytics, RevenueAttribution, InsightsResponse, CROResponse, WebhookStatsResponse, NetworkStatus } from "./types";

export function App() {
  const { activated, activatedAt } = useActivation();
  const { state, dispatch, handleWSMessage } = useDashboardStore();
  // Always connect WS — do NOT gate on `activated`.
  // Gating caused a timing gap: widget sends first events immediately on store
  // load, but the dashboard WS only connected after the activation React
  // re-render, so those early events were broadcast to an empty channel.
  const { connected } = useWS(handleWSMessage);

  // Build since query for analytics — use a 24h lookback window so charts
  // show meaningful data even on first activation. The Live Feed uses the
  // real activatedAt (no backdate) so it only shows THIS session's events.
  const analyticsLookback = useMemo(() => {
    if (!activatedAt) return null;
    return new Date(Math.min(Date.now() - 24 * 60 * 60 * 1000, new Date(activatedAt).getTime())).toISOString();
  }, [activatedAt]);
  const sinceQuery = analyticsLookback ? `since=${encodeURIComponent(analyticsLookback)}` : "";
  const sinceSuffix = sinceQuery ? `?${sinceQuery}` : "";

  // Poll sessions every 5s — only when activated
  const { data: sessionsResp } = useApi<{ sessions: SessionSummary[] }>(
    activated ? `/sessions${sinceSuffix}` : null,
    { pollMs: 5000 }
  );
  const sessions = sessionsResp?.sessions ?? [];

  // One-time backfill: when sessions first arrive after activation, pull the
  // last 50 events per session from the DB so the Live Event Feed is populated
  // even for events that landed before the dashboard WS was connected.
  const hasBackfilledRef = useRef(false);
  useEffect(() => {
    if (!activated || sessions.length === 0 || hasBackfilledRef.current) return;
    hasBackfilledRef.current = true;

    (async () => {
      const API_BASE = "http://localhost:8080/api";
      const allEvents: import("./types").TrackEventData[] = [];

      // Only backfill sessions started in the last 5 minutes — this covers the
      // WS timing gap (widget fires events before dashboard WS connects) without
      // pulling in events from previous demo runs / yesterday's sessions.
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const recentSessions = sessions.filter((s) => {
        const t = s.startedAt ? new Date(s.startedAt).getTime() : 0;
        return t > fiveMinAgo;
      });

      for (const session of recentSessions.slice(0, 5)) {
        try {
          const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(session.id)}/events?limit=50`);
          if (!res.ok) continue;
          const data = (await res.json()) as { events: Array<Record<string, unknown>> };
          for (const ev of data.events ?? []) {
            allEvents.push({
              id: String(ev.id ?? ""),
              session_id: String(ev.sessionId ?? session.id),
              category: String(ev.category ?? "unknown"),
              eventType: String(ev.eventType ?? ev.event_type ?? "unknown"),
              frictionId: ev.frictionId ? String(ev.frictionId) : undefined,
              pageType: ev.pageType ? String(ev.pageType) : undefined,
              pageUrl: ev.pageUrl ? String(ev.pageUrl) : undefined,
              rawSignals: typeof ev.rawSignals === "string" ? ev.rawSignals : JSON.stringify(ev.rawSignals ?? {}),
              timestamp: ev.timestamp ? new Date(ev.timestamp as string).getTime() : Date.now(),
            });
          }
        } catch { /* server not ready yet — harmless */ }
      }

      if (allEvents.length > 0) {
        dispatch({ type: "BACKFILL_EVENTS", events: allEvents });
      }
    })();
  }, [activated, sessions, dispatch]);

  // Determine siteUrl from first active session (for analytics queries)
  const activeSiteUrl = sessions[0]?.siteUrl ?? "";
  const analyticsParams = activeSiteUrl
    ? `?siteUrl=${encodeURIComponent(activeSiteUrl)}${sinceQuery ? `&${sinceQuery}` : ""}`
    : "";
  const overviewParams = activeSiteUrl
    ? `?siteUrl=${encodeURIComponent(activeSiteUrl)}${sinceQuery ? `&${sinceQuery}` : ""}`
    : sinceSuffix;

  // Poll overview analytics every 8s — only when activated
  const { data: overview } = useApi<OverviewAnalytics>(
    activated ? `/analytics/overview${overviewParams}` : null,
    { pollMs: 8000 }
  );

  // Poll analytics for Track tab — only when Track tab is active
  const isTrackTab = state.activeTab === "track";
  const { data: trafficData } = useApi<{ breakdown: any[] }>(
    activated && isTrackTab && activeSiteUrl ? `/analytics/traffic${analyticsParams}` : null,
    { pollMs: 30000 }
  );
  const { data: deviceData } = useApi<{ breakdown: any[] }>(
    activated && isTrackTab && activeSiteUrl ? `/analytics/devices${analyticsParams}` : null,
    { pollMs: 30000 }
  );
  const { data: funnelData } = useApi<{ steps: any[] }>(
    activated && isTrackTab && activeSiteUrl ? `/analytics/funnel${analyticsParams}` : null,
    { pollMs: 30000 }
  );
  const { data: flowData } = useApi<{ flows: any[] }>(
    activated && isTrackTab && activeSiteUrl ? `/analytics/flow${analyticsParams}` : null,
    { pollMs: 30000 }
  );
  const { data: pageStatsData } = useApi<{ pages: any[] }>(
    activated && isTrackTab && activeSiteUrl ? `/analytics/pages${analyticsParams}` : null,
    { pollMs: 30000 }
  );
  const { data: clickData } = useApi<{ points: any[] }>(
    activated && isTrackTab && activeSiteUrl ? `/analytics/clicks${analyticsParams}` : null,
    { pollMs: 60000 }
  );

  // Poll shadow data for Evaluate tab — only when Evaluate tab is active
  const isEvalTab = state.activeTab === "evaluate";
  const { data: shadowStats } = useApi<any>(
    activated && isEvalTab ? `/shadow/stats` : null,
    { pollMs: 15000 }
  );
  const { data: shadowDivergences } = useApi<{ data: any[] }>(
    activated && isEvalTab ? `/shadow/divergences?limit=5` : null,
    { pollMs: 15000 }
  );
  // Friction analytics — polled for both TRACK and EVALUATE tabs
  const isTrackOrEval = isTrackTab || isEvalTab;
  const { data: frictionAnalytics } = useApi<FrictionAnalytics>(
    activated && isTrackOrEval && activeSiteUrl ? `/analytics/friction${analyticsParams}` : null,
    { pollMs: 30000 }
  );
  const { data: revenueAttribution } = useApi<RevenueAttribution>(
    activated && isTrackOrEval && activeSiteUrl ? `/analytics/revenue${analyticsParams}` : null,
    { pollMs: 30000 }
  );

  // Poll insights for Track tab — lazy, only when Track tab is active
  const { data: insightsData } = useApi<InsightsResponse>(
    activated && isTrackTab && activeSiteUrl ? `/insights/latest?siteUrl=${encodeURIComponent(activeSiteUrl)}` : null,
    { pollMs: 60000 }
  );
  const { data: croData } = useApi<CROResponse>(
    activated && isTrackTab && activeSiteUrl ? `/insights/cro?siteUrl=${encodeURIComponent(activeSiteUrl)}` : null,
    { pollMs: 60000 }
  );

  // Poll webhook stats for Intervene/Operate tab
  const isInterveneTab = state.activeTab === "intervene";
  const { data: webhookStats } = useApi<WebhookStatsResponse>(
    activated && isInterveneTab && activeSiteUrl ? `/webhooks/stats?siteUrl=${encodeURIComponent(activeSiteUrl)}` : null,
    { pollMs: 30000 }
  );

  // Poll network flywheel status for Intervene/Operate tab
  const { data: networkStatus } = useApi<NetworkStatus>(
    activated && isInterveneTab ? `/network/status${activeSiteUrl ? `?siteUrl=${encodeURIComponent(activeSiteUrl)}` : ""}` : null,
    { pollMs: 60000 }
  );

  return (
    <div className="dashboard-shell">
      <Header connected={connected} activated={activated} />
      {!activated ? (
        <InactiveOverlay />
      ) : (
        <>
          <TabBar
            active={state.activeTab}
            onSelect={(tab) => dispatch({ type: "SET_TAB", tab })}
            counts={{
              track:     state.eventCount,
              evaluate:  state.evalCount,
              intervene: state.intervCount,
            }}
          />
          {state.activeTab === "track" && (
            <TrackTab
              events={state.events}
              selectedSession={state.selectedSessionId}
              overview={overview ?? null}
              trafficData={trafficData?.breakdown ?? null}
              deviceData={deviceData?.breakdown ?? null}
              funnelData={funnelData?.steps ?? null}
              flowData={flowData?.flows ?? null}
              pageStatsData={pageStatsData?.pages ?? null}
              clickPoints={clickData?.points ?? null}
              insightsSnapshot={insightsData?.snapshot ?? null}
              croFindings={croData?.findings ?? null}
              frictionAnalytics={frictionAnalytics ?? null}
              revenueAttribution={revenueAttribution ?? null}
            />
          )}

          {state.activeTab === "evaluate" && (
            <EvaluateTab
              evaluations={state.evaluations}
              selectedSession={state.selectedSessionId}
              overview={overview ?? null}
              shadowStats={shadowStats ?? null}
              shadowDivergences={shadowDivergences?.data ?? null}
              frictionAnalytics={frictionAnalytics ?? null}
              revenueAttribution={revenueAttribution ?? null}
            />
          )}

          {state.activeTab === "intervene" && (
            <InterveneTab
              interventions={state.interventions}
              selectedSession={state.selectedSessionId}
              overview={overview ?? null}
              sessions={sessions}
              analyticsParams={analyticsParams}
              webhookStats={webhookStats ?? null}
              networkStatus={networkStatus ?? null}
            />
          )}
        </>
      )}
    </div>
  );
}
