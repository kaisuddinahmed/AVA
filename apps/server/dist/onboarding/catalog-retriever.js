import { BEHAVIOR_PATTERN_CATALOG, FRICTION_CATALOG, SEVERITY_SCORES, } from "@ava/shared";
export const BEHAVIOR_TARGET_COUNT = 614;
export const FRICTION_TARGET_COUNT = 325;
const STOPWORDS = new Set([
    "and",
    "or",
    "the",
    "with",
    "from",
    "into",
    "for",
    "that",
    "this",
    "user",
    "shopper",
    "their",
    "when",
    "after",
    "before",
    "while",
    "without",
    "your",
    "site",
    "page",
]);
let behaviorCache = null;
let frictionCache = null;
export function getBehaviorCatalog() {
    if (behaviorCache)
        return behaviorCache;
    const patterns = Array.from(BEHAVIOR_PATTERN_CATALOG.values())
        .map((item) => ({
        ...item,
        keywords: extractKeywords(`${item.category} ${item.description}`),
    }))
        .sort((a, b) => a.order - b.order);
    behaviorCache = patterns;
    return patterns;
}
export function getFrictionCatalog() {
    if (frictionCache)
        return frictionCache;
    const catalog = Array.from(FRICTION_CATALOG.values())
        .map((item) => ({
        ...item,
        severity: SEVERITY_SCORES[item.id] ?? 50,
        keywords: extractKeywords(`${item.category} ${item.scenario} ${item.detection_signal} ${item.ai_action}`),
    }))
        .sort((a, b) => a.id.localeCompare(b.id));
    frictionCache = catalog;
    return catalog;
}
function extractKeywords(text) {
    const tokens = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3)
        .filter((t) => !STOPWORDS.has(t));
    return Array.from(new Set(tokens));
}
//# sourceMappingURL=catalog-retriever.js.map