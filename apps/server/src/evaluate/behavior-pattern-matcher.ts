/**
 * Behavior Pattern Matcher
 *
 * Detects which of the 5 behavior groups (HIGH_INTENT, COMPARISON, HESITATION,
 * DISCOVERY, EXIT_RISK) are active in the current event batch, then resolves
 * those groups to specific B-codes via the BehaviorPatternMapping table.
 *
 * Detection is event-sequence-based and data-driven through the group
 * definitions in @ava/shared — adding or reclassifying patterns requires
 * no changes here.
 */

import { BehaviorMappingRepo } from "@ava/db";
import {

  BEHAVIOR_GROUP_DEFINITIONS,
  BEHAVIOR_GROUP_PRIORITY,
  PATTERN_TO_GROUP,
  type BehaviorGroup,
} from "@ava/shared";

import { logger } from "../logger.js";
const log = logger.child({ service: "evaluate" });

// ── Public types ──────────────────────────────────────────────────────────────

export interface MatcherEvent {
  category: string;
  eventType: string;
  frictionId?: string | null;
  rawSignals?: Record<string, unknown>;
  pageType?: string;
}

export interface DetectedBehaviorPattern {
  patternId: string;          // e.g. "B035"
  group: BehaviorGroup;
  confidence: number;         // 0.0–1.0 from BehaviorPatternMapping record
  evidence: string[];         // event types that triggered group detection
}

// ── Group detection rules ─────────────────────────────────────────────────────

/**
 * Classify event sequence into active behavior groups.
 * Returns only the groups that have sufficient evidence.
 */
function detectActiveGroups(
  events: MatcherEvent[]
): Map<BehaviorGroup, string[]> {
  const active = new Map<BehaviorGroup, string[]>();
  const eventTypes = events.map((e) => e.eventType);
  const categories = events.map((e) => e.category);
  const pageTypes = events.map((e) => e.pageType ?? "other");

  // ── HIGH_INTENT ───────────────────────────────────────────────────────────
  {
    const evidence: string[] = [];
    if (eventTypes.includes("add_to_cart"))      evidence.push("add_to_cart");
    if (eventTypes.includes("quick_add"))        evidence.push("quick_add");
    if (pageTypes.includes("checkout"))          evidence.push("checkout_page");
    if (pageTypes.includes("cart") && eventTypes.includes("cart_view"))
      evidence.push("cart_view");
    if (evidence.length >= 1) active.set("HIGH_INTENT", evidence);
  }

  // ── COMPARISON ────────────────────────────────────────────────────────────
  {
    const evidence: string[] = [];
    const pdvCount = eventTypes.filter((t) => t === "product_detail_view").length;
    if (pdvCount >= 3)                           evidence.push("product_detail_view_x3");
    if (eventTypes.includes("size_guide_open"))  evidence.push("size_guide_open");
    if (eventTypes.includes("description_toggle")) evidence.push("description_toggle");
    if (eventTypes.includes("size_select"))      evidence.push("size_select");
    if (eventTypes.includes("color_select"))     evidence.push("color_select");
    if (eventTypes.includes("filter_applied"))   evidence.push("filter_applied");
    if (eventTypes.includes("sort_applied"))     evidence.push("sort_applied");
    if (evidence.length >= 2) active.set("COMPARISON", evidence);
  }

  // ── HESITATION ────────────────────────────────────────────────────────────
  {
    const evidence: string[] = [];
    const hasVariantSelect = eventTypes.some((t) =>
      ["size_select", "color_select"].includes(t)
    );
    const hasAddToCart = eventTypes.includes("add_to_cart");
    const hasCartView = eventTypes.includes("cart_view");

    // Variant selection without add to cart = hesitation
    if (hasVariantSelect && !hasAddToCart)
      evidence.push("variant_without_cart");

    // Cart view repeated (3+) without proceeding to checkout
    const cartViewCount = eventTypes.filter((t) => t === "cart_view").length;
    if (cartViewCount >= 3)
      evidence.push("repeated_cart_view");

    // Wishlist add without cart
    if (eventTypes.includes("wishlist_add") && !hasAddToCart)
      evidence.push("wishlist_without_cart");

    // Quantity changes suggest deliberation
    if (eventTypes.includes("quantity_change") && hasCartView)
      evidence.push("quantity_change");

    // Idle with cart detected
    if (events.some((e) => e.frictionId === "F069"))
      evidence.push("idle_with_cart");

    if (evidence.length >= 1) active.set("HESITATION", evidence);
  }

  // ── DISCOVERY ─────────────────────────────────────────────────────────────
  {
    const evidence: string[] = [];
    const pdvCount = eventTypes.filter((t) => t === "product_detail_view").length;
    const hasCategoryBrowse = categories.includes("navigation") ||
      eventTypes.includes("category_browse");
    const noCartAction = !eventTypes.includes("add_to_cart");
    const isFirstVisit = events.some((e) =>
      (e.rawSignals as Record<string, unknown>)?.is_first_visit === true ||
      (e.rawSignals as Record<string, unknown>)?.session_sequence_number === 1
    );

    if (hasCategoryBrowse && noCartAction && pdvCount <= 2)
      evidence.push("early_category_browse");
    if (isFirstVisit)
      evidence.push("first_visit");
    if (eventTypes.includes("search_query") && noCartAction)
      evidence.push("search_without_cart");

    // Only flag DISCOVERY if we have no high-intent or comparison signals —
    // don't penalise a genuinely engaged session that also browsed categories
    if (evidence.length >= 1 && !active.has("HIGH_INTENT") && !active.has("COMPARISON"))
      active.set("DISCOVERY", evidence);
  }

  // ── EXIT_RISK ─────────────────────────────────────────────────────────────
  {
    const evidence: string[] = [];
    if (eventTypes.includes("exit_intent"))       evidence.push("exit_intent");
    if (eventTypes.includes("rage_click"))        evidence.push("rage_click");
    if (eventTypes.includes("dead_click"))        evidence.push("dead_click");
    if (eventTypes.includes("tab_switch"))        evidence.push("tab_switch");

    // Idle friction codes
    if (events.some((e) =>
      e.frictionId && ["F068", "F069", "F400"].includes(e.frictionId)
    ))
      evidence.push("friction_idle_or_rage");

    // Large idle time in raw signals
    const hasLongIdle = events.some((e) => {
      const rs = e.rawSignals as Record<string, unknown> | undefined;
      return typeof rs?.idle_time_ms === "number" && rs.idle_time_ms > 180_000;
    });
    if (hasLongIdle) evidence.push("long_idle");

    if (evidence.length >= 1) active.set("EXIT_RISK", evidence);
  }

  return active;
}

// ── B-code resolution ─────────────────────────────────────────────────────────

/**
 * Resolve active groups → specific B-code IDs using the BehaviorPatternMapping
 * table for the site. If no mappings exist (e.g. onboarding not complete),
 * fall back to the group's catalog patternIds directly at base confidence.
 */
async function resolvePatterns(
  activeGroups: Map<BehaviorGroup, string[]>,
  siteConfigId: string
): Promise<DetectedBehaviorPattern[]> {
  if (activeGroups.size === 0) return [];

  // Load all mappings for this site once (repo does pagination; 500 covers all B-codes)
  let mappings: Array<{
    patternId: string;
    confidence: number;
    isActive: boolean;
  }> = [];

  try {
    const raw = await BehaviorMappingRepo.listBehaviorMappingsBySite(siteConfigId, 500);
    mappings = raw.filter((m: { patternId: string; confidence: number; isActive: boolean }) => m.isActive);
  } catch {
    // DB unavailable or no mappings yet — fall back to catalog-level detection
  }

  const results: DetectedBehaviorPattern[] = [];
  const seen = new Set<string>();

  // Process groups in priority order
  for (const group of BEHAVIOR_GROUP_PRIORITY) {
    const evidence = activeGroups.get(group);
    if (!evidence) continue;

    const def = BEHAVIOR_GROUP_DEFINITIONS[group];

    if (mappings.length > 0) {
      // Resolve via site-specific mappings: only include patterns that exist
      // in both the group definition AND the site's verified mappings
      for (const mapping of mappings) {
        if (!def.patternIds.includes(mapping.patternId)) continue;
        if (seen.has(mapping.patternId)) continue;
        seen.add(mapping.patternId);
        results.push({
          patternId: mapping.patternId,
          group,
          confidence: mapping.confidence,
          evidence,
        });
      }
    } else {
      // Fallback: use the first 5 patterns from the group definition
      // at a conservative base confidence of 0.60
      for (const patternId of def.patternIds.slice(0, 5)) {
        if (seen.has(patternId)) continue;
        seen.add(patternId);
        results.push({
          patternId,
          group,
          confidence: 0.60,
          evidence,
        });
      }
    }
  }

  // Cap at 10 highest-confidence patterns
  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect behavior patterns from the current event batch.
 *
 * 1. Classifies events into active BehaviorGroups (rule-based)
 * 2. Resolves groups → specific B-codes via BehaviorPatternMapping table
 * 3. Returns up to 10 patterns sorted by confidence (highest first)
 *
 * Never throws — returns [] on any failure so it never blocks evaluation.
 */
export async function detectBehaviorPatterns(
  events: MatcherEvent[],
  siteConfigId: string
): Promise<DetectedBehaviorPattern[]> {
  if (!events || events.length === 0) return [];

  try {
    const activeGroups = detectActiveGroups(events);
    return await resolvePatterns(activeGroups, siteConfigId);
  } catch (err) {
    log.error("[BehaviorMatcher] Detection failed (non-blocking):", err);
    return [];
  }
}

/**
 * Extract the active behavior groups from a set of detected patterns.
 * Deduplicates — each group appears at most once.
 */
export function extractActiveGroups(
  patterns: DetectedBehaviorPattern[]
): BehaviorGroup[] {
  const groups = new Set<BehaviorGroup>();
  for (const p of patterns) groups.add(p.group);
  // Return in priority order
  return BEHAVIOR_GROUP_PRIORITY.filter((g) => groups.has(g));
}

/**
 * Compute the net intent and clarity boosts from active behavior groups.
 * Used by signal calculators.
 */
export function computeBehaviorBoosts(groups: BehaviorGroup[]): {
  intentBoost: number;
  clarityBoost: number;
} {
  let intentBoost = 0;
  let clarityBoost = 0;
  for (const g of groups) {
    intentBoost += BEHAVIOR_GROUP_DEFINITIONS[g].intentBoost;
    clarityBoost += BEHAVIOR_GROUP_DEFINITIONS[g].clarityBoost;
  }
  // Cap combined boost to ±20 so patterns can't overwhelm other signals
  return {
    intentBoost: Math.max(-20, Math.min(20, intentBoost)),
    clarityBoost: Math.max(-20, Math.min(20, clarityBoost)),
  };
}

// Re-export for consumers
export { PATTERN_TO_GROUP } from "@ava/shared";
