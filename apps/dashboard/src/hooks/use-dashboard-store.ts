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
  | { type: "CLEAR" };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };

    case "ADD_EVENT": {
      const events = [action.event, ...state.events].slice(0, MAX_ITEMS);
      return { ...state, events, eventCount: state.eventCount + 1 };
    }

    case "ADD_EVALUATION": {
      const evaluations = [action.evaluation, ...state.evaluations].slice(0, MAX_ITEMS);
      return { ...state, evaluations, evalCount: state.evalCount + 1 };
    }

    case "ADD_INTERVENTION": {
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
