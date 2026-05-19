// ============================================================================
// /api/merchant-coaching — per-site coaching for the virtual salesperson.
// Thinking Layer step 9 (2026-05-19).
//
// GET  /api/merchant-coaching?siteUrl=...
// PUT  /api/merchant-coaching
//
// The dashboard CoachingConfigPanel reads / writes this. The think/ module
// reads it on every move via loadThinkContext({ siteUrl }).
// ============================================================================

import type { Request, Response } from "express";
import { MerchantCoachingRepo } from "@ava/db";

const VALID_TONES = new Set([
  "luxury",
  "playful",
  "no_nonsense",
  "warm",
  "technical",
  "unspecified",
]);

export async function getCoaching(req: Request, res: Response): Promise<void> {
  const siteUrl = (req.query.siteUrl as string | undefined)?.trim();
  if (!siteUrl) {
    res.status(400).json({ error: "siteUrl required" });
    return;
  }
  try {
    const view = await MerchantCoachingRepo.getBySite(siteUrl);
    res.json({
      siteUrl,
      coaching: view ?? {
        siteUrl,
        tone: "unspecified",
        alwaysUpsell: [],
        neverDiscountBelowPct: 0,
        forbiddenClaims: [],
        priorityObjections: [],
        freeformNotes: null,
        updatedAt: null,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "internal" });
  }
}

export async function putCoaching(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "body required" });
    return;
  }
  const siteUrl =
    typeof body.siteUrl === "string" ? body.siteUrl.trim() : "";
  if (!siteUrl) {
    res.status(400).json({ error: "siteUrl required" });
    return;
  }

  // Validate fields defensively — bad input gets clamped or dropped.
  const tone = typeof body.tone === "string" && VALID_TONES.has(body.tone)
    ? (body.tone as MerchantCoachingRepo.Tone)
    : undefined;
  const alwaysUpsell = stringArray(body.alwaysUpsell);
  const forbiddenClaims = stringArray(body.forbiddenClaims);
  const priorityObjections = stringArray(body.priorityObjections);
  const neverDiscountBelowPct =
    typeof body.neverDiscountBelowPct === "number"
      ? body.neverDiscountBelowPct
      : undefined;
  const freeformNotes =
    typeof body.freeformNotes === "string"
      ? body.freeformNotes
      : body.freeformNotes === null
        ? null
        : undefined;

  try {
    const view = await MerchantCoachingRepo.upsert({
      siteUrl,
      tone,
      alwaysUpsell,
      forbiddenClaims,
      priorityObjections,
      neverDiscountBelowPct,
      freeformNotes,
    });
    res.json({ siteUrl, coaching: view });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "internal" });
  }
}

function stringArray(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}
