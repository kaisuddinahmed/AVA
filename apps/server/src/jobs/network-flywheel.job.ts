// ============================================================================
// Network Flywheel Job — computes anonymized cross-merchant behavioral priors.
//
// Weekly aggregation across opted-in merchants. For each friction ID:
//   1. Count distinct opted-in sites that have seen it (merchantCount)
//   2. Compute avg severity and avg conversion impact
//   3. Write to NetworkPattern with k-anonymity floor (merchantCount >= 3)
//
// Zero site URLs or session IDs ever stored in NetworkPattern.
// ============================================================================

import { prisma } from "@ava/db";
import { NetworkPatternRepo } from "@ava/db";

export interface FlywheelResult {
  patternsUpdated: number;
  patternsSkipped: number;
  merchantsContributing: number;
  totalSessionsAnalyzed: number;
}

/**
 * Run the weekly network flywheel aggregation.
 */
export async function runNetworkFlywheel(): Promise<FlywheelResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 1. Get all opted-in sites
  const optedInSites = await prisma.siteConfig.findMany({
    where: { networkOptIn: true },
    select: { siteUrl: true },
  });

  const siteUrls = optedInSites.map((s) => s.siteUrl);
  if (siteUrls.length === 0) {
    return { patternsUpdated: 0, patternsSkipped: 0, merchantsContributing: 0, totalSessionsAnalyzed: 0 };
  }

  // 2. Aggregate friction detections + intervention outcomes per frictionId
  //    across opted-in merchants. We avoid storing site-level breakdowns.
  const frictionGroups = await prisma.$queryRaw<Array<{
    frictionId: string;
    siteCount: number;
    totalSessions: number;
    avgSeverity: number;
    conversions: number;
    totalInterventions: number;
  }>>`
    SELECT
      e.frictionsFound AS frictionId,
      COUNT(DISTINCT s.siteUrl) AS siteCount,
      COUNT(DISTINCT s.id) AS totalSessions,
      AVG(e.compositeScore) AS avgSeverity,
      SUM(CASE WHEN i.status = 'converted' THEN 1 ELSE 0 END) AS conversions,
      COUNT(i.id) AS totalInterventions
    FROM Evaluation e
    JOIN Session s ON e.sessionId = s.id
    LEFT JOIN Intervention i ON i.evaluationId = e.id
    WHERE s.siteUrl IN (${siteUrls.join("','")})
      AND e.createdAt >= ${thirtyDaysAgo}
      AND e.frictionsFound != '[]'
    GROUP BY e.frictionsFound
  `.catch(() => [] as Array<{
    frictionId: string;
    siteCount: number;
    totalSessions: number;
    avgSeverity: number;
    conversions: number;
    totalInterventions: number;
  }>);

  // 3. The raw query gives frictionsFound as JSON strings like '["F068"]'
  //    Explode them and aggregate per individual frictionId.
  const perFriction = new Map<string, {
    sites: Set<string>;
    sessions: number;
    severitySum: number;
    severityCount: number;
    conversions: number;
    interventions: number;
  }>();

  for (const row of frictionGroups) {
    // frictionsFound is stored as a JSON array string — parse it
    let frictionIds: string[] = [];
    try {
      const parsed = JSON.parse(String(row.frictionId));
      frictionIds = Array.isArray(parsed) ? parsed : [String(row.frictionId)];
    } catch {
      frictionIds = [String(row.frictionId)];
    }

    for (const fid of frictionIds) {
      if (!fid || fid === "unknown") continue;
      if (!perFriction.has(fid)) {
        perFriction.set(fid, { sites: new Set(), sessions: 0, severitySum: 0, severityCount: 0, conversions: 0, interventions: 0 });
      }
      const entry = perFriction.get(fid)!;
      // Use a deterministic site placeholder — we only count, not store
      for (let i = 0; i < Number(row.siteCount); i++) {
        entry.sites.add(`site_${fid}_${i}`);
      }
      entry.sessions += Number(row.totalSessions);
      entry.severitySum += Number(row.avgSeverity) * Number(row.totalSessions);
      entry.severityCount += Number(row.totalSessions);
      entry.conversions += Number(row.conversions);
      entry.interventions += Number(row.totalInterventions);
    }
  }

  // 4. Write patterns — k-anonymity enforced inside upsertNetworkPattern
  let updated = 0;
  let skipped = 0;
  let totalSessions = 0;

  for (const [frictionId, data] of perFriction) {
    const merchantCount = data.sites.size;
    const avgSeverity = data.severityCount > 0 ? data.severitySum / data.severityCount : 50;
    const avgConversionImpact = data.interventions > 0
      ? data.conversions / data.interventions
      : 0;

    const result = await NetworkPatternRepo.upsertNetworkPattern({
      frictionId,
      category: categorizeFriction(frictionId),
      avgSeverity,
      avgConversionImpact,
      merchantCount,
      totalSessions: data.sessions,
    });

    if (result) {
      updated++;
      totalSessions += data.sessions;
    } else {
      skipped++;
    }
  }

  return {
    patternsUpdated: updated,
    patternsSkipped: skipped,
    merchantsContributing: siteUrls.length,
    totalSessionsAnalyzed: totalSessions,
  };
}

// ---------------------------------------------------------------------------
// Friction category inference (mirrors message-templates.ts categories)
// ---------------------------------------------------------------------------

function categorizeFriction(frictionId: string): string {
  const num = parseInt(frictionId.replace(/\D/g, ""), 10);
  if (num >= 1   && num <= 25)  return "navigation";
  if (num >= 26  && num <= 50)  return "product_discovery";
  if (num >= 51  && num <= 75)  return "inventory";
  if (num >= 76  && num <= 100) return "checkout";
  if (num >= 101 && num <= 125) return "payment";
  if (num >= 126 && num <= 150) return "shipping";
  if (num >= 151 && num <= 175) return "technical";
  if (num >= 176 && num <= 200) return "trust";
  if (num >= 201 && num <= 225) return "comparison";
  if (num >= 226 && num <= 250) return "pricing";
  if (num >= 251 && num <= 275) return "returns";
  if (num >= 276 && num <= 300) return "account";
  if (num >= 301 && num <= 325) return "intent";
  return "other";
}
