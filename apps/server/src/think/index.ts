// think/ — public surface
export { decideMove, decideMoveAsync } from "./think.service.js";
export {
  loadThinkContext,
  buildContextFromInputs,
} from "./think.context.js";
export type { ThinkContext } from "./think.context.js";
export {
  llmThink,
  isLlmThinkingEnabled,
  __resetLlmThinkerState,
} from "./llm-thinker.js";
export type { LlmThinkInput } from "./llm-thinker.js";
export {
  recordMovePrediction,
  resolvePendingForSession,
  abandonSessionPredictions,
} from "./prediction-bridge.js";
export type {
  RecordMovePredictionInput,
  ResolveActuals,
} from "./prediction-bridge.js";
export type {
  SalespersonMove,
  ThinkInput,
  MoveIntent,
  MoveTone,
  ObjectionType,
  ExpectedResponse,
} from "./think.types.js";
