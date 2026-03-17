import { useCallback, useReducer } from "react";
import type {
  TrackEventData,
  EvaluationData,
  InterventionData,
  WSMessage,
  TabId,
} from "../types";

/* ──────────────────────────────────────────────────────────────
   Central store for all real-time + REST data displayed in the
   dashboard.  Kept in a reducer so updates are predictable and
   the three tabs share one source of truth.
   ────────────────────────────────────────────────────────────── */

const MAX_ITEMS = 200; // ring-buffer cap per list

export interface DashboardState {
  activeTab: TabId;
  events: TrackEventData[];
  evaluations: EvaluationData[];
  interventions: InterventionData[];
  selectedSessionId: string | null;
  eventCount: number;
  evalCount: number;
  intervCount: number;
}

type Action =
  | { type: "SET_TAB"; tab: TabId }
  | { type: "ADD_EVENT"; event: TrackEventData; sessionId: string }
  | { type: "ADD_EVALUATION"; evaluation: EvaluationData; sessionId: string }
  | { type: "ADD_INTERVENTION"; intervention: InterventionData; sessionId: string }
  | { type: "SELECT_SESSION"; sessionId: string | null }
  | { type: "BACKFILL_EVENTS"; events: TrackEventData[] }
  | { type: "CLEAR" };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };

    case "ADD_EVENT": {
      // Deduplicate by id to prevent double-counting between WS and backfill
      if (action.event.id && state.events.some((e) => e.id === action.event.id)) {
        return state;
      }
      const eventWithSession = {
        ...action.event,
        session_id: action.event.session_id ?? action.sessionId,
      };
      const events = [eventWithSession, ...state.events].slice(0, MAX_ITEMS);
      return { ...state, events, eventCount: state.eventCount + 1 };
    }

    case "BACKFILL_EVENTS": {
      // Batch-insert historical events (oldest first so newest end up at top)
      // Skip any that already exist in the store (WS may have delivered them)
      const existingIds = new Set(state.events.map((e) => e.id).filter(Boolean));
      const fresh = action.events.filter((e) => !e.id || !existingIds.has(e.id));
      if (fresh.length === 0) return state;
      // Merge: live WS events (already in state) stay at the top; backfill below
      const events = [...state.events, ...fresh].slice(0, MAX_ITEMS);
      return { ...state, events, eventCount: state.eventCount + fresh.length };
    }

    case "ADD_EVALUATION": {
      const evaluations = [action.evaluation, ...state.evaluations].slice(0, MAX_ITEMS);
      return { ...state, evaluations, evalCount: state.evalCount + 1 };
    }

    case "ADD_INTERVENTION": {
      const existingIdx = state.interventions.findIndex(
        (i) => i.intervention_id === action.intervention.intervention_id
      );

      if (existingIdx >= 0) {
        const interventions = [...state.interventions];
        interventions[existingIdx] = {
          ...interventions[existingIdx],
          ...action.intervention,
        };
        return { ...state, interventions };
      }

      const interventions = [action.intervention, ...state.interventions].slice(0, MAX_ITEMS);
      return { ...state, interventions, intervCount: state.intervCount + 1 };
    }

    case "SELECT_SESSION":
      return { ...state, selectedSessionId: action.sessionId };

    case "CLEAR":
      return initialState();

    default:
      return state;
  }
}

function initialState(): DashboardState {
  return {
    activeTab: "track",
    events: [],
    evaluations: [],
    interventions: [],
    selectedSessionId: null,
    eventCount: 0,
    evalCount: 0,
    intervCount: 0,
  };
}

// Note: TabId "operate" has been renamed to "intervene" — store shape unchanged.

export function useDashboardStore() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const handleWSMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case "track_event":
          dispatch({ type: "ADD_EVENT", event: msg.data, sessionId: msg.sessionId });
          break;
        case "evaluation":
          dispatch({ type: "ADD_EVALUATION", evaluation: msg.data, sessionId: msg.sessionId });
          break;
        case "intervention":
          dispatch({ type: "ADD_INTERVENTION", intervention: msg.data, sessionId: msg.sessionId });
          break;
        default:
          break;
      }
    },
    []
  );

  return { state, dispatch, handleWSMessage };
}
