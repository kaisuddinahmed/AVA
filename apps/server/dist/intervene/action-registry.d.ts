/**
 * Registry of all possible intervention actions mapped to their tier.
 */
export interface ActionDef {
    code: string;
    tier: string;
    description: string;
}
export declare const ACTION_REGISTRY: ActionDef[];
export declare function getAction(code: string): ActionDef | undefined;
export declare function getActionsByTier(tier: string): ActionDef[];
//# sourceMappingURL=action-registry.d.ts.map