import { DEFAULT_CONFIG, WidgetConfig } from "../config.js";
import { FISMBridge } from "./ws-transport.js";
import { BehaviorCollector } from "./collector.js";
import { initAddressAutofill } from "./address-autofill.js";

export function initShopAssist(config: Partial<WidgetConfig>): {
  bridge: FISMBridge;
  collector: BehaviorCollector;
} {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Create bridge
  const bridge = new FISMBridge(fullConfig.websocketUrl, fullConfig.sessionId);
  bridge.connect();

  // Create and start collector
  const collector = new BehaviorCollector(bridge, fullConfig.sessionId, fullConfig.userId);
  collector.startCollecting();

  // Address memory: autofill checkout forms from localStorage on checkout pages
  initAddressAutofill();

  return { bridge, collector };
}
