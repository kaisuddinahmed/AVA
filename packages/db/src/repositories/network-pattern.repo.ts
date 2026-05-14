import { Prisma } from "@prisma/client";
import { prisma } from "../client.js";

// ---------------------------------------------------------------------------
// Cross-table aggregation row used by the network flywheel job.
// ---------------------------------------------------------------------------
export interface FrictionAggregateRow {
  frictionId: string;
  siteCount: number;
  totalSessions: number;
  avgSeverity: number;
  conversions: number;
  totalInterventions: number;
}

// ---------------------------------------------------------------------------
// NetworkPattern Repository — anonymized cross-merchant behavioral aggregates
// ---------------------------------------------------------------------------

export interface NetworkPatternData {
  frictionId: string;
  category: string;
  avgSeverity: number;
  avgConversionImpact: number;
  merchantCount: number;
  totalSessions: number;
}

/**
 * Upsert a network pattern record. Called by the weekly flywheel job.
 * Enforces k-anonymity: only writes when merchantCount >= 3.
 */
export async function upsertNetworkPattern(data: NetworkPatternData) {
  if (data.merchantCount < 3) return null; // k-anonymity floor
  return (prisma as any).networkPattern.upsert({
    where: { frictionId: data.frictionId },
    update: { category: data.category, avgSeverity: data.avgSeverity, avgConversionImpact: data.avgConversionImpact, merchantCount: data.merchantCount, totalSessions: data.totalSessions },
    create: data,
  });
}

/**
 * Get a single network pattern for a given frictionId.
 * Used by fast evaluator as a prior for new merchants.
 */
export async function getNetworkPattern(frictionId: string) {
  return prisma.networkPattern.findUnique({ where: { frictionId } });
}

/**
 * Get all network patterns, ordered by impact (highest first).
 */
export async function listNetworkPatterns() {
  return prisma.networkPattern.findMany({
    orderBy: { avgConversionImpact: "desc" },
  });
}

/**
 * Count the number of published network patterns.
 */
export async function countNetworkPatterns(): Promise<number> {
  return prisma.networkPattern.count();
}

/**
 * Aggregate friction detections + intervention outcomes across opted-in sites
 * within a time window. Used by the weekly network flywheel job to compute
 * cross-merchant priors.
 *
 * Returns one row per Evaluation.frictionsFound JSON value — the caller is
 * responsible for exploding the JSON array into individual friction IDs.
 */
export async function getFrictionAggregatesAcrossSites(
  siteUrls: string[],
  since: Date,
): Promise<FrictionAggregateRow[]> {
  if (siteUrls.length === 0) return [];
  return prisma.$queryRaw<FrictionAggregateRow[]>`
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
    WHERE s.siteUrl IN (${Prisma.join(siteUrls)})
      AND e.createdAt >= ${since}
      AND e.frictionsFound != '[]'
    GROUP BY e.frictionsFound
  `.catch(() => [] as FrictionAggregateRow[]);
}
