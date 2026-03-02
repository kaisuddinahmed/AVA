import { useActivation } from "./hooks/use-activation";
import { useWS } from "./hooks/use-ws";
import { useDashboardStore } from "./hooks/use-dashboard-store";
import { useApi } from "./hooks/use-api";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SessionBar } from "./components/SessionBar";
import { TrackTab } from "./components/TrackTab";
import { EvaluateTab } from "./components/EvaluateTab";
import { InterventionsTab } from "./components/InterventionsTab";
import { InactiveOverlay } from "./components/InactiveOverlay";
import type { SessionSummary, OverviewAnalytics } from "./types";

export function App() {
  const { activated, activatedAt } = useActivation();
  const { state, dispatch, handleWSMessage } = useDashboardStore();
  const { connected } = useWS(handleWSMessage, activated);

  // Build since param so we only fetch data created after activation
  const sinceParam = activatedAt ? `?since=${encodeURIComponent(activatedAt)}` : "";

  // Poll sessions every 5s — only when activated
  const { data: sessionsResp } = useApi<{ sessions: SessionSummary[] }>(
    activated ? `/sessions${sinceParam}` : null,
    { pollMs: 5000 }
  );
  const sessions = sessionsResp?.sessions ?? [];

  // Poll overview analytics every 8s — only when activated
  const { data: overview } = useApi<OverviewAnalytics>(
    activated ? `/analytics/overview${sinceParam}` : null,
    { pollMs: 8000 }
  );

  // Determine siteUrl from first active session (for analytics queries)
  const activeSiteUrl = sessions[0]?.siteUrl ?? "";
  const analyticsParams = activeSiteUrl
    ? `?siteUrl=${encodeURIComponent(activeSiteUrl)}${sinceParam ? `&since=${encodeURIComponent(activatedAt ?? "")}` : ""}`
    : "";

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
          <SessionBar
            sessions={sessions}
            selected={state.selectedSessionId}
            onSelect={(id) => dispatch({ type: "SELECT_SESSION", sessionId: id })}
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
            />
          )}

          {state.activeTab === "evaluate" && (
            <EvaluateTab
              evaluations={state.evaluations}
              selectedSession={state.selectedSessionId}
              overview={overview ?? null}
              shadowStats={shadowStats ?? null}
              shadowDivergences={shadowDivergences?.data ?? null}
            />
          )}

          {state.activeTab === "intervene" && (
            <InterventionsTab
              interventions={state.interventions}
              selectedSession={state.selectedSessionId}
              overview={overview ?? null}
              sessions={sessions}
            />
          )}
        </>
      )}
    </div>
  );
}
