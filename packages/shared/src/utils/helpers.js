"use strict";
// ============================================================================
// Shared utility functions
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.clamp = clamp;
exports.generateId = generateId;
exports.now = now;
exports.secondsSince = secondsSince;
exports.minutesSince = minutesSince;
exports.formatDuration = formatDuration;
exports.formatTimestamp = formatTimestamp;
exports.safeJsonParse = safeJsonParse;
exports.round = round;
/**
 * Clamp a value between min and max.
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/**
 * Generate a UUID v4 string.
 */
function generateId() {
    return crypto.randomUUID();
}
/**
 * Current timestamp in milliseconds.
 */
function now() {
    return Date.now();
}
/**
 * Seconds elapsed since a given timestamp.
 */
function secondsSince(timestamp) {
    return (Date.now() - timestamp) / 1000;
}
/**
 * Minutes elapsed since a given timestamp.
 */
function minutesSince(timestamp) {
    return (Date.now() - timestamp) / 60_000;
}
/**
 * Format milliseconds into a human-readable duration (e.g., "2m 35s").
 */
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0)
        return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
}
/**
 * Format a timestamp into HH:MM:SS for the TRACK tab.
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour12: false });
}
/**
 * Safe JSON parse that returns null on failure.
 */
function safeJsonParse(json) {
    try {
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
/**
 * Round to N decimal places.
 */
function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
//# sourceMappingURL=helpers.js.map