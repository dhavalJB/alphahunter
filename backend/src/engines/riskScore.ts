import type { RiskLevel, WalletActivity, WalletSnapshot } from "../types/wallet";
import {
  countSwapActivity,
  getMaxConcentration,
} from "../services/portfolioMetrics";

export interface RiskScoreResult {
  level: RiskLevel;
  score: number;
  label: string;
  factors: {
    concentration: number;
    volatility: number;
    activity: number;
    liquidity: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getStablecoinPercent(snapshot: WalletSnapshot): number {
  const total = snapshot.totalPortfolioUsd || 1;
  const stable = snapshot.stablecoinBalances.reduce((s, t) => s + t.balanceUsd, 0);
  return (stable / total) * 100;
}

function deriveLevel(score: number): RiskLevel {
  if (score >= 66) return "high";
  if (score >= 38) return "medium";
  return "low";
}

function deriveLabel(level: RiskLevel): string {
  if (level === "high") return "Elevated";
  if (level === "medium") return "Moderate";
  return "Conservative";
}

export function calculateRiskScore(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): RiskScoreResult {
  const concentration = getMaxConcentration(snapshot).percent;
  const stablePercent = getStablecoinPercent(snapshot);
  const isActive =
    snapshot.transactionCount30d >= 3 || countSwapActivity(activities) >= 2;

  const concentrationRisk = clamp(
    concentration >= 85 ? 35 : concentration >= 70 ? 28 : concentration >= 50 ? 18 : concentration >= 35 ? 10 : 4,
    0,
    40
  );

  const volatilityRisk = clamp(
    stablePercent >= 70 ? 5 : stablePercent >= 40 ? 12 : stablePercent >= 20 ? 20 : 28,
    0,
    35
  );

  const activityRisk = isActive ? 8 : snapshot.transactionCount30d < 1 ? 18 : 12;

  const liquidityRisk = clamp(
    stablePercent >= 50 ? 6 : stablePercent >= 25 ? 12 : 18,
    0,
    25
  );

  const raw =
    concentrationRisk * 0.4 +
    volatilityRisk * 0.3 +
    activityRisk * 0.15 +
    liquidityRisk * 0.15;

  const score = clamp(Math.round(raw), 8, 92);
  const level = deriveLevel(score);

  return {
    level,
    score,
    label: deriveLabel(level),
    factors: {
      concentration: Math.round(concentrationRisk),
      volatility: Math.round(volatilityRisk),
      activity: Math.round(activityRisk),
      liquidity: Math.round(liquidityRisk),
    },
  };
}
