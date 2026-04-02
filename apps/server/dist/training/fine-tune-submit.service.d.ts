import { type FormatterPreset } from "./training-formatter.service.js";
export interface SubmitOptions {
    provider?: "groq";
    baseModel?: string;
    preset?: FormatterPreset;
    minGrade?: string;
    maxExamples?: number;
    siteUrl?: string;
}
export interface SubmitResult {
    modelVersionId: string;
    fineTuneJobId: string | null;
    status: string;
    exampleCount: number;
}
/**
 * Export training data, upload to Groq, and create a ModelVersion record.
 * Groq fine-tuning API is not yet publicly stable — JSONL is prepared and
 * the ModelVersion record is created so it's ready when the API launches.
 */
export declare function submitFineTuneJob(options: SubmitOptions): Promise<SubmitResult>;
/**
 * Poll a Groq fine-tune job and return current status.
 */
export declare function getFineTuneJobStatus(provider: string, jobId: string): Promise<{
    status: string;
    fineTunedModel?: string;
    error?: string;
}>;
//# sourceMappingURL=fine-tune-submit.service.d.ts.map