import type { WalletActivity, WalletSnapshot } from "../types/wallet";
import {
  getPrimaryPortfolioValue,
  getTotalUsdtUsd,
} from "../services/primaryPortfolio";
import {
  computeIdleCapital,
  countDeFiActivity,
  countSwapActivity,
} from "../services/portfolioMetrics";

export interface CapitalEfficiencyResult {
  score: number;
  deployedPercent: number;
  idlePercent: number;
  label: string;
  factors: {
    deployment: number;
    defiUsage: number;
    activity: number;
    concentrationPenalty: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveLabel(score: number): string {
  if (score >= 85) return "Fully Deployed";
  if (score >= 65) return "Moderately Deployed";
  if (score >= 40) return "Partially Idle";
  return "Mostly Idle";
}

export function calculateCapitalEfficiency(
  snapshot: WalletSnapshot,
  activities: WalletActivity[],
  idleDurationDays: number
): CapitalEfficiencyResult {
  const idleUsdt = computeIdleCapital(snapshot);
  const totalUsdt = getTotalUsdtUsd(snapshot);
  const primaryTotal = getPrimaryPortfolioValue(snapshot) || 1;

  const usdtDeployedPercent =
    totalUsdt > 0 ? clamp(((totalUsdt - idleUsdt) / totalUsdt) * 100, 0, 100) : 100;

  const idlePercent = clamp((idleUsdt / primaryTotal) * 100, 0, 100);
  const deployedPercent = Math.round(usdtDeployedPercent);

  const defiCount = countDeFiActivity(activities);
  const swapCount = countSwapActivity(activities);

  const deploymentScore = Math.round(usdtDeployedPercent * 0.75);
  const defiScore = Math.min(15, defiCount * 5);
  const activityScore = Math.min(10, swapCount * 2 + Math.min(5, snapshot.transactionCount30d));

  let idleDurationPenalty = 0;
  if (idleDurationDays >= 30) idleDurationPenalty = 15;
  else if (idleDurationDays >= 14) idleDurationPenalty = 10;
  else if (idleDurationDays >= 7) idleDurationPenalty = 5;

  const raw =
    deploymentScore +
    defiScore +
    activityScore -
    idleDurationPenalty +
    (totalUsdt <= 0 ? 20 : 0);

  const score =
    totalUsdt <= 0 && idleUsdt <= 0
      ? clamp(Math.round(70 + activityScore), 50, 95)
      : clamp(Math.round(raw), 5, 100);

  return {
    score,
    deployedPercent,
    idlePercent: Math.round(idlePercent),
    label: deriveLabel(score),
    factors: {
      deployment: deploymentScore,
      defiUsage: defiScore,
      activity: activityScore,
      concentrationPenalty: idleDurationPenalty,
    },
  };
}
