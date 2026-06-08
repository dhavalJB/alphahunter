import type { RiskLevel } from "../types/wallet";
import type { StonFiMarketPool } from "../services/stonfiMarket";

export interface RankingInput {
  apy: number;
  tvlUsd: number;
  volume24hUsd: number;
  capitalAvailableUsd: number;
  portfolioValueUsd: number;
  risk: RiskLevel;
  idleDurationDays: number;
}

export interface RankingResult {
  opportunityScore: number;
  confidence: number;
  risk: RiskLevel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic opportunity score (0–100).
 * Factors: APY, TVL, liquidity (volume/TVL), capital available, risk penalty.
 */
export function calculateOpportunityScore(input: RankingInput): number {
  const apyScore = clamp(input.apy * 4, 0, 35);
  const tvlScore = clamp(Math.log10(Math.max(input.tvlUsd, 100)) * 4, 0, 25);
  const liquidityRatio = input.volume24hUsd / Math.max(input.tvlUsd, 1);
  const liquidityScore = clamp(liquidityRatio * 50, 0, 15);
  const capitalScore = clamp(
    (input.capitalAvailableUsd / Math.max(input.portfolioValueUsd, 1)) * 20,
    0,
    15
  );

  let riskPenalty = 0;
  if (input.risk === "medium") riskPenalty = 6;
  if (input.risk === "high") riskPenalty = 12;

  const idleBonus = clamp(Math.min(input.idleDurationDays, 30) * 0.2, 0, 6);

  const raw =
    apyScore + tvlScore + liquidityScore + capitalScore + idleBonus - riskPenalty;

  return clamp(Math.round(raw), 10, 99);
}

export function calculateConfidence(
  opportunityScore: number,
  capitalAvailableUsd: number,
  apy: number
): number {
  const base = opportunityScore * 0.85;
  const capitalBoost = capitalAvailableUsd >= 100 ? 8 : capitalAvailableUsd >= 25 ? 5 : 2;
  const apyBoost = apy >= 5 ? 4 : apy >= 3 ? 2 : 0;
  return clamp(Math.round(base + capitalBoost + apyBoost), 55, 99);
}

export function rankPoolsForCapital(
  pools: StonFiMarketPool[],
  capitalUsd: number
): StonFiMarketPool[] {
  return [...pools]
    .map((pool) => {
      const score =
        pool.apy1d * 4 +
        Math.log10(Math.max(pool.tvlUsd, 100)) * 3 +
        (pool.volume24hUsd / Math.max(pool.tvlUsd, 1)) * 20;
      return { pool, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.pool);
}

export { computeReturns, computeYieldReturns } from "../services/yieldCalculator";

export function deriveRiskFromPool(pool: StonFiMarketPool): RiskLevel {
  if (pool.tvlUsd >= 500_000 && pool.apy1d <= 15) return "low";
  if (pool.tvlUsd >= 100_000) return "medium";
  return "high";
}

export function buildRankingResult(
  input: RankingInput
): RankingResult {
  const opportunityScore = calculateOpportunityScore(input);
  const confidence = calculateConfidence(
    opportunityScore,
    input.capitalAvailableUsd,
    input.apy
  );
  return { opportunityScore, confidence, risk: input.risk };
}
