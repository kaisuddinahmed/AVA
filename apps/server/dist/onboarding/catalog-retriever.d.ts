import { type BehaviorPattern, type FrictionScenario } from "@ava/shared";
export declare const BEHAVIOR_TARGET_COUNT = 614;
export declare const FRICTION_TARGET_COUNT = 325;
export interface BehaviorCatalogItem extends BehaviorPattern {
    keywords: string[];
}
export interface FrictionCatalogItem extends FrictionScenario {
    severity: number;
    keywords: string[];
}
export declare function getBehaviorCatalog(): BehaviorCatalogItem[];
export declare function getFrictionCatalog(): FrictionCatalogItem[];
//# sourceMappingURL=catalog-retriever.d.ts.map