export type PageType = "home" | "category" | "search_results" | "pdp" | "cart" | "checkout" | "account" | "other";
export interface ClassifierResult {
    pageType: PageType;
    /** 0..1 — how confident this classification is. Higher = more agreeing signals. */
    confidence: number;
    /** Which signal layers fired, for debugging and dashboard "mapping confidence" display. */
    signals: string[];
}
/**
 * Classify a page given its raw HTML and canonical URL.
 *
 * `html` may be the full document or a truncated chunk — the classifier only
 * needs the `<head>` plus body class to fire most signals. Returns the
 * single best-fit page type with a 0..1 confidence and the list of signals
 * that contributed.
 */
export declare function classifyPage(html: string, url: string): ClassifierResult;
//# sourceMappingURL=page-classifier.service.d.ts.map