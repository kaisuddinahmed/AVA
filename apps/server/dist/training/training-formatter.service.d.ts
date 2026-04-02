import { type ExportFilters } from "./training-export.service.js";
/** A single chat fine-tuning example (system + user + assistant messages). */
export interface ChatFineTuningExample {
    messages: [
        {
            role: "system";
            content: string;
        },
        {
            role: "user";
            content: string;
        },
        {
            role: "assistant";
            content: string;
        }
    ];
}
/** Format presets for different fine-tuning providers. */
export type FormatterPreset = "groq" | "generic";
export interface FormatterOptions {
    /** Which format preset to use. Default: "generic". */
    preset?: FormatterPreset;
    /** Minimum event count to include a datapoint. Default: 2. */
    minEventCount?: number;
    /** Only include these outcomes. Default: ["converted", "dismissed"]. */
    includeOutcomes?: string[];
    /** Exclude datapoints with clarity below this. Default: 0 (no filter). */
    minClarityScore?: number;
    /** Include outcome metadata in assistant response for reward modeling. Default: false. */
    includeOutcomeHint?: boolean;
    /** Max examples to return. Default: no limit (uses ExportFilters.limit). */
    maxExamples?: number;
}
export interface FormatterStats {
    totalRecords: number;
    filteredOut: number;
    formatted: number;
    outcomeDistribution: Record<string, number>;
    avgTokenEstimate: number;
}
/**
 * Format training data as chat fine-tuning JSONL.
 * Each line is a JSON object with { messages: [...] }.
 */
export declare function formatAsFineTuningJsonl(filters: ExportFilters, options?: FormatterOptions): Promise<{
    jsonl: string;
    stats: FormatterStats;
}>;
/**
 * Format training data as an array of chat fine-tuning examples.
 */
export declare function formatAsExamples(filters: ExportFilters, options?: FormatterOptions): Promise<{
    examples: ChatFineTuningExample[];
    stats: FormatterStats;
}>;
//# sourceMappingURL=training-formatter.service.d.ts.map