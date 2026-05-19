import { DEFAULT_CONFIG, WidgetConfig } from "../config.js";
import { FISMBridge } from "./ws-transport.js";
import { BehaviorCollector } from "./collector.js";
import { initAddressAutofill } from "./address-autofill.js";
import { startAllObservers } from "./observer-registry.js";

export function initShopAssist(config: Partial<WidgetConfig>): {
  bridge: FISMBridge;
  collector: BehaviorCollector;
  stopObservers: () => void;
} {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Create bridge
  const bridge = new FISMBridge(fullConfig.websocketUrl, fullConfig.sessionId);
  bridge.connect();

  // Create and start collector
  const collector = new BehaviorCollector(bridge, fullConfig.sessionId, fullConfig.userId);
  collector.startCollecting();

  // Thinking Layer P1.1 fix (Codex 2026-05-19) — start the 9 Thinking-
  // Layer observers (F326-F335 + element re-read). BehaviorCollector
  // above remains the single owner of legacy navigation/click/cart/form/
  // search/scroll/page_view events; the registry only carries signals
  // BehaviorCollector does NOT emit. Adding any of those legacy classes
  // to the registry would double-count — observer-registry.ts has a
  // duplicate-emit guard test that enforces this. `stopObservers` is
  // exposed so the caller can tear down on unmount or deactivation.
  const stopObservers = startAllObservers(bridge);

  // Address memory: autofill checkout forms on checkout pages for known visitors
  const visitorKey = fullConfig.userId ?? fullConfig.sessionId;
  const siteUrl = fullConfig.siteUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  const isRepeatVisitor = !!fullConfig.userId;
  initAddressAutofill(visitorKey, siteUrl, isRepeatVisitor).catch(() => {});

  return { bridge, collector, stopObservers };
}
