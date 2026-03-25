/**
 * Clamp a value between min and max.
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Generate a UUID v4 string.
 */
export declare function generateId(): string;
/**
 * Current timestamp in milliseconds.
 */
export declare function now(): number;
/**
 * Seconds elapsed since a given timestamp.
 */
export declare function secondsSince(timestamp: number): number;
/**
 * Minutes elapsed since a given timestamp.
 */
export declare function minutesSince(timestamp: number): number;
/**
 * Format milliseconds into a human-readable duration (e.g., "2m 35s").
 */
export declare function formatDuration(ms: number): string;
/**
 * Format a timestamp into HH:MM:SS for the TRACK tab.
 */
export declare function formatTimestamp(timestamp: number): string;
/**
 * Safe JSON parse that returns null on failure.
 */
export declare function safeJsonParse<T>(json: string): T | null;
/**
 * Round to N decimal places.
 */
export declare function round(value: number, decimals?: number): number;
//# sourceMappingURL=helpers.d.ts.map