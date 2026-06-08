import { calculateAlphaScore } from "../engines/alphaScore";
import { calculateCapitalEfficiency } from "../engines/capitalEfficiency";
import {
  calculateMissedYield,
  calculateMissedYieldWithApy,
} from "../engines/missedYield";
import { scanOpportunities } from "../engines/opportunities";
import { calculateRiskScore } from "../engines/riskScore";
import { deriveWalletProfile } from "../engines/walletProfile";
import {
  OPPORTUNITY_RANKINGS_CACHE_TTL_MS,
  WALLET_ANALYSIS_CACHE_TTL_MS,
} from "../config";
import type {
  Opportunity,
  OpportunityCostBreakdown,
  OpportunityDiscovery,
  WalletAnalysis,
  WalletSnapshot,
} from "../types/wallet";
import { MemoryCache, dedupeRequest } from "./cache";
import { logger } from "./logger";
import { perfMetrics } from "./perfMetrics";
import { buildPrimaryPortfolioBreakdown } from "./primaryPortfolio";
import { computeIdleDurationDays } from "./portfolioMetrics";
import { fetchWalletRawData } from "./walletData";
import {
  buildAllocations,
  buildWalletSnapshotFromRaw,
} from "./walletParser";

interface OpportunityRankingsBundle {
  opportunities: Opportunity[];
  discovery: OpportunityDiscovery;
}

export interface WalletIntelligence {
  snapshot: WalletSnapshot;
  analysis: WalletAnalysis;
  opportunities: Opportunity[];
  discovery: OpportunityDiscovery;
  cachedAt: number;
  dataSource: string;
  fromCache: boolean;
  analysisFromCache: boolean;
  opportunitiesFromCache: boolean;
}

interface AnalysisBundle {
  snapshot: WalletSnapshot;
  analysis: WalletAnalysis;
  dataSource: string;
  cachedAt: number;
}

const analysisCache = new MemoryCache<AnalysisBundle>();
const opportunitiesCache = new MemoryCache<OpportunityRankingsBundle>();

const EMPTY_DISCOVERY: OpportunityDiscovery = {
  opportunitiesScanned: 0,
  protocolsCompared: 0,
  protocols: [],
  winnerReason: "No opportunities scanned.",
  comparison: [],
};

function analysisKey(address: string): string {
  return `analysis:${address.toLowerCase()}`;
}

function opportunitiesKey(address: string): string {
  return `opportunities:${address.toLowerCase()}`;
}

function runAnalysis(snapshot: WalletSnapshot): WalletAnalysis {
  const activities = snapshot.activities;
  const allocations = buildAllocations(snapshot);

  const lastActivityDaysAgo = snapshot.lastActivityTimestamp
    ? Math.floor((Date.now() / 1000 - snapshot.lastActivityTimestamp) / 86400)
    : 999;

  const idleDurationDays = computeIdleDurationDays(snapshot, activities);

  const primaryPortfolio = buildPrimaryPortfolioBreakdown(snapshot);

  const alpha = calculateAlphaScore(snapshot, activities);
  const capitalEfficiency = calculateCapitalEfficiency(
    snapshot,
    activities,
    idleDurationDays
  );
  const missedYield = calculateMissedYield(snapshot, idleDurationDays);
  const walletProfile = deriveWalletProfile(snapshot, activities);
  const risk = calculateRiskScore(snapshot, activities);

  return {
    alphaScore: alpha.alphaScore,
    riskScore: risk.level,
    riskScoreNumeric: risk.score,
    riskScoreLabel: risk.label,
    riskBreakdown: {
      score: risk.score,
      level: risk.level,
      label: risk.label,
      factors: risk.factors,
    },
    capitalEfficiency,
    missedYield,
    walletProfile,
    primaryPortfolio,
    portfolioValue: alpha.portfolioValue,
    idleCapital: alpha.idleCapital,
    idleDurationDays,
    alphaBreakdown: alpha.alphaBreakdown,
    allocations,
    activities,
    balances: snapshot.tokens,
    transactionCount30d: snapshot.transactionCount30d,
    lastActivityDaysAgo,
  };
}

async function fetchAnalysisBundle(address: string): Promise<AnalysisBundle> {
  logger.pipelineStart(address);

  const raw = await fetchWalletRawData(address);
  const snapshot = buildWalletSnapshotFromRaw(raw);
  const analysis = runAnalysis(snapshot);

  logger.pipelineComplete(address, raw.dataSource);

  return {
    snapshot,
    analysis,
    dataSource: raw.dataSource,
    cachedAt: Date.now(),
  };
}

async function getAnalysisBundle(address: string): Promise<{
  bundle: AnalysisBundle;
  fromCache: boolean;
}> {
  const key = analysisKey(address);
  const cached = analysisCache.get(key);

  if (cached) {
    logger.cacheHit(key);
    return { bundle: cached, fromCache: true };
  }

  logger.cacheMiss(key);

  const bundle = await dedupeRequest(key, () => fetchAnalysisBundle(address));
  analysisCache.set(key, bundle, WALLET_ANALYSIS_CACHE_TTL_MS);

  // Wallet data changed — drop stale opportunity rankings
  opportunitiesCache.delete(opportunitiesKey(address));

  return { bundle, fromCache: false };
}

function enrichAnalysisWithLiveApy(
  analysis: WalletAnalysis,
  snapshot: WalletSnapshot,
  opportunities: Opportunity[]
): WalletAnalysis {
  const top = opportunities[0];
  const liveApy = top?.market?.apy;
  const apySource = top?.market?.apySource ?? "Tonstakers";

  if (liveApy != null && liveApy > 0) {
    return {
      ...analysis,
      missedYield: calculateMissedYieldWithApy(
        snapshot,
        analysis.idleDurationDays,
        liveApy,
        apySource
      ),
    };
  }

  return analysis;
}

function enrichOpportunityCost(
  analysis: WalletAnalysis,
  opportunities: Opportunity[]
): WalletAnalysis {
  const top = opportunities[0];
  const days = Math.max(1, analysis.idleDurationDays);

  let opportunityCost: OpportunityCostBreakdown;

  if (top?.market) {
    const annual = top.market.expectedAnnualReturnUsd;
    const isTonstakers = top.market.apySource === "Tonstakers";
    opportunityCost = {
      annualUsd: annual,
      periodUsd: Math.round(((annual * days) / 365) * 100) / 100,
      monthlyUsd: top.market.expectedMonthlyReturnUsd,
      dailyUsd: top.market.expectedDailyReturnUsd,
      apyLabel: top.market.apyLabel,
      apySource: top.market.apySource,
      source: isTonstakers ? "tonstakers" : "stonfi",
      disclaimer: isTonstakers
        ? "Based on live Tonstakers APY applied to idle capital. Not guaranteed."
        : "Based on live STON.fi pool APY applied to idle capital. Not guaranteed.",
    };
  } else {
    opportunityCost = {
      annualUsd: analysis.missedYield.annualizedMaxUsd,
      periodUsd: analysis.missedYield.estimatedMaxUsd,
      apyLabel: analysis.missedYield.yieldRangeLabel,
      source: "estimate",
      disclaimer: analysis.missedYield.disclaimer,
    };
  }

  return { ...analysis, opportunityCost };
}

async function getOpportunityRankings(
  address: string,
  snapshot: WalletSnapshot
): Promise<{ opportunities: Opportunity[]; discovery: OpportunityDiscovery; fromCache: boolean }> {
  const key = opportunitiesKey(address);
  const cached = opportunitiesCache.get(key);

  if (cached) {
    logger.cacheHit(key);
    logger.opportunitiesStart(address);
    logger.opportunitiesComplete(address, 0, cached.opportunities.length, "cache");
    return {
      opportunities: cached.opportunities,
      discovery: cached.discovery,
      fromCache: true,
    };
  }

  logger.cacheMiss(key);

  const result = await dedupeRequest(key, () =>
    scanOpportunities(snapshot, snapshot.activities)
  );
  opportunitiesCache.set(key, result, OPPORTUNITY_RANKINGS_CACHE_TTL_MS);

  return {
    opportunities: result.opportunities,
    discovery: result.discovery,
    fromCache: false,
  };
}

/**
 * Single entry point for all wallet intelligence.
 * Tiered cache: analysis 1min, opportunities 2min, STON.fi 5min (in stonfiMarket).
 */
export async function getWalletIntelligence(
  address: string
): Promise<WalletIntelligence> {
  const start = Date.now();

  const { bundle, fromCache: analysisFromCache } = await getAnalysisBundle(address);
  const { opportunities, discovery, fromCache: opportunitiesFromCache } =
    await getOpportunityRankings(address, bundle.snapshot);

  let analysis = enrichAnalysisWithLiveApy(
    bundle.analysis,
    bundle.snapshot,
    opportunities
  );
  analysis = enrichOpportunityCost(analysis, opportunities);
  const fromCache = analysisFromCache && opportunitiesFromCache;
  perfMetrics.recordPipeline(Date.now() - start, fromCache);

  return {
    snapshot: bundle.snapshot,
    analysis,
    opportunities,
    discovery: discovery ?? EMPTY_DISCOVERY,
    cachedAt: bundle.cachedAt,
    dataSource: bundle.dataSource,
    fromCache,
    analysisFromCache,
    opportunitiesFromCache,
  };
}

export function clearWalletCache(address?: string): void {
  if (address) {
    const lower = address.toLowerCase();
    analysisCache.delete(analysisKey(lower));
    opportunitiesCache.delete(opportunitiesKey(lower));
  } else {
    analysisCache.clear();
    opportunitiesCache.clear();
  }
}
