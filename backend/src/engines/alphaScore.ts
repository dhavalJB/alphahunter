import type { RiskLevel, WalletActivity, WalletSnapshot } from "../types/wallet";
import { getPrimaryPortfolioValue, getTotalUsdtUsd } from "../services/primaryPortfolio";
import {
  computeIdleCapital,
  countDeFiActivity,
  countSwapActivity,
  getMaxConcentration,
} from "../services/portfolioMetrics";

interface AlphaScoreResult {
  alphaScore: number;
  riskScore: RiskLevel;
  portfolioValue: number;
  idleCapital: number;
  alphaBreakdown: {
    confidence: number;
    risk: string;
    performance: string;
    factors: {
      activity: number;
      diversification: number;
      stablecoinAllocation: number;
      concentration: number;
    };
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getUsdtAllocationPercent(snapshot: WalletSnapshot): number {
  const total = getPrimaryPortfolioValue(snapshot) || 1;
  return (getTotalUsdtUsd(snapshot) / total) * 100;
}

function getTransactionScore(count: number): number {
  if (count >= 20) return 10;
  if (count >= 10) return 8;
  if (count >= 5) return 6;
  if (count >= 2) return 4;
  if (count >= 1) return 2;
  return 0;
}

function getSwapScore(activities: WalletActivity[]): number {
  const swaps = countSwapActivity(activities);
  if (swaps >= 5) return 10;
  if (swaps >= 3) return 8;
  if (swaps >= 1) return 5;
  return 0;
}

function getDeFiScore(activities: WalletActivity[]): number {
  const defi = countDeFiActivity(activities);
  if (defi >= 3) return 12;
  if (defi >= 1) return 8;
  return 0;
}

function getParticipationScore(snapshot: WalletSnapshot, activities: WalletActivity[]): number {
  const tx = getTransactionScore(snapshot.transactionCount30d);
  const swaps = getSwapScore(activities);
  const defi = getDeFiScore(activities);
  return Math.min(24, tx + swaps + defi);
}

function getIdleUsdtPenalty(idleUsdt: number, totalUsdt: number): number {
  if (totalUsdt <= 0 || idleUsdt <= 0) return 0;
  const ratio = idleUsdt / totalUsdt;
  if (ratio >= 0.9) return 18;
  if (ratio >= 0.7) return 12;
  if (ratio >= 0.5) return 8;
  if (ratio >= 0.25) return 4;
  return 0;
}

function getConcentrationPenalty(concentration: number): number {
  if (concentration >= 85) return 8;
  if (concentration >= 70) return 4;
  return 0;
}

function deriveRiskScore(
  concentration: number,
  idleUsdt: number,
  totalUsdt: number,
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): RiskLevel {
  let riskPoints = 0;
  if (concentration >= 85) riskPoints += 2;
  else if (concentration >= 70) riskPoints += 1;

  if (totalUsdt > 0 && idleUsdt / totalUsdt >= 0.8) riskPoints += 1;

  const isActive =
    snapshot.transactionCount30d >= 3 || countSwapActivity(activities) >= 2;
  if (!isActive && snapshot.transactionCount30d < 1) riskPoints += 1;

  if (riskPoints >= 3) return "high";
  if (riskPoints >= 1) return "medium";
  return "low";
}

function derivePerformance(alphaScore: number): string {
  if (alphaScore >= 80) return "Strong";
  if (alphaScore >= 65) return "Moderate";
  if (alphaScore >= 50) return "Developing";
  return "Low";
}

export function calculateAlphaScore(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): AlphaScoreResult {
  const portfolioValue = getPrimaryPortfolioValue(snapshot);
  const concentration = getMaxConcentration(snapshot).percent;
  const usdtPercent = getUsdtAllocationPercent(snapshot);
  const totalUsdt = getTotalUsdtUsd(snapshot);
  const idleCapital = computeIdleCapital(snapshot);

  const participationScore = getParticipationScore(snapshot, activities);
  const idlePenalty = getIdleUsdtPenalty(idleCapital, totalUsdt);
  const concentrationPenalty = getConcentrationPenalty(concentration);

  const deploymentBonus =
    totalUsdt > 0 && idleCapital < totalUsdt * 0.2 ? 10 : 0;

  const rawScore =
    50 +
    participationScore +
    deploymentBonus -
    idlePenalty -
    concentrationPenalty;

  const alphaScore = clamp(Math.round(rawScore), 25, 98);
  const riskScore = deriveRiskScore(
    concentration,
    idleCapital,
    totalUsdt,
    snapshot,
    activities
  );

  const confidence = clamp(
    Math.round(
      60 +
        (idleCapital >= 1 ? 15 : 0) +
        Math.min(12, participationScore) +
        (portfolioValue > 20 ? 8 : 0)
    ),
    45,
    98
  );

  return {
    alphaScore,
    riskScore,
    portfolioValue: Math.round(portfolioValue * 100) / 100,
    idleCapital,
    alphaBreakdown: {
      confidence,
      risk: riskScore.charAt(0).toUpperCase() + riskScore.slice(1),
      performance: derivePerformance(alphaScore),
      factors: {
        activity: participationScore,
        diversification: totalUsdt > 0 && snapshot.tonBalanceUsd > 0 ? 12 : 6,
        stablecoinAllocation: Math.round(usdtPercent),
        concentration: Math.round(concentration),
      },
    },
  };
}
