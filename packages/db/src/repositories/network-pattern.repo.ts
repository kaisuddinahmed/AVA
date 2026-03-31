import { prisma } from "../client.js";

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
