import type { Request, Response } from "express";
/**
 * Analytics API — Aggregated metrics for dashboard visualization.
 * Provides: friction breakdown, conversion funnel, intervention efficiency.
 */
/**
 * GET /api/analytics/session/:sessionId
 * Session-level analytics: MSWIM signal history, intervention outcomes.
 */
export declare function getSessionAnalytics(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/overview
 * Global overview: intervention efficiency, friction hotspots.
 */
export declare function getOverview(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/funnel
 * Conversion funnel: sessions reaching each pageType step.
 */
export declare function getFunnel(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/flow
 * Top page-to-page navigation transitions.
 */
export declare function getPageFlow(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/traffic
 * Traffic source breakdown by referrerType.
 */
export declare function getTrafficSources(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/devices
 * Device type breakdown.
 */
export declare function getDevices(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/pages
 * Per-page avg time on page and avg scroll depth.
 */
export declare function getPageStats(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/sessions/trend
 * Daily session volume over a time range.
 */
export declare function getSessionsTrend(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/retention
 * Weekly retention cohort: new vs returning sessions by week.
 */
export declare function getRetention(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/voice
 * Voice intervention performance: conversion/dismissal rates vs text, mute rate.
 */
export declare function getVoiceAnalytics(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/friction
 * Per-frictionId breakdown + 30-day trend + severity distribution.
 */
export declare function getFrictionAnalytics(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/revenue
 * Revenue attribution: per-frictionId cart lift from converted interventions.
 */
export declare function getRevenueAttribution(req: Request, res: Response): Promise<void>;
/**
 * GET /api/analytics/clicks
 * Click coordinate data for heatmap rendering.
 */
export declare function getClickHeatmap(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=analytics.api.d.ts.map