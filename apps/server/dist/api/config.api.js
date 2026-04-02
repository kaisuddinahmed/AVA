import { config } from "../config.js";
import { getClientCounts } from "../broadcast/channel-manager.js";
export async function getConfig(_req, res) {
    res.json({
        server: {
            port: config.port,
            wsPort: config.wsPort,
        },
        mswim: {
            weights: config.mswim.weights,
            thresholds: config.mswim.thresholds,
        },
        evaluation: config.evaluation,
        connections: getClientCounts(),
    });
}
//# sourceMappingURL=config.api.js.map