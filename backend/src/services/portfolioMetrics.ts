import type { TokenBalance, WalletActivity, WalletSnapshot } from "../types/wallet";
import {
  getPrimaryConcentration,
  getTonWorkingCapitalUsd,
  getTotalUsdtUsd,
  getUndeployedUsdtUsd,
  isDeployedReceiptToken,
} from "./primaryPortfolio";

const DEPLOYMENT_KEYWORDS = [
  "liquidity",
  "stake",
  "staking",
  "farm",
  "farming",
  "vault",
  "nominat",
  "deposit",
  "supply",
  "lend",
  "pool",
  "ston.fi",
  "dedust",
];

const SWAP_KEYWORDS = ["swap", "exchange", "trade"];

export function isDeploymentActivity(type: string): boolean {
  const lower = type.toLowerCase();
  if (SWAP_KEYWORDS.some((k) => lower.includes(k))) return false;
  if (lower.includes("transfer") && !lower.includes("liquidity")) return false;
  return DEPLOYMENT_KEYWORDS.some((k) => lower.includes(k));
}

export { isDeployedReceiptToken } from "./primaryPortfolio";

export function isDeployedStablecoinHolding(token: TokenBalance): boolean {
  if (!token.isStablecoin) return false;
  return isDeployedReceiptToken(token);
}

export function countSwapActivity(activities: WalletActivity[]): number {
  return activities.filter((a) =>
    SWAP_KEYWORDS.some((k) => a.type.toLowerCase().includes(k))
  ).length;
}

export function countDeFiActivity(activities: WalletActivity[]): number {
  return activities.filter((a) => isDeploymentActivity(a.type)).length;
}

export function getMaxConcentration(snapshot: WalletSnapshot): {
  asset: string;
  percent: number;
} {
  return getPrimaryConcentration(snapshot);
}

export function getDiversificationAssetCount(snapshot: WalletSnapshot): number {
  let count = 0;
  if (getTonWorkingCapitalUsd(snapshot) >= 1) count++;
  if (getTotalUsdtUsd(snapshot) >= 1) count++;
  return count;
}

export function getUndeployedStablecoinBalance(snapshot: WalletSnapshot): number {
  return getUndeployedUsdtUsd(snapshot);
}

export function computeIdleDurationDays(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): number {
  const stableKeywords = ["usdt", "stable", "jetton transfer"];
  const usdtActivity = activities.filter((a) => {
    const lower = a.type.toLowerCase();
    return (
      lower.includes("usdt") ||
      lower.includes("stable") ||
      isDeploymentActivity(a.type)
    );
  });

  const timestamps = usdtActivity.map((a) => a.timestamp);
  const referenceTimestamp =
    timestamps.length > 0
      ? Math.max(...timestamps)
      : snapshot.lastActivityTimestamp;

  if (!referenceTimestamp) return 7;

  const days = Math.floor((Date.now() / 1000 - referenceTimestamp) / 86400);
  const result = Math.min(365, Math.max(1, days));

  return result;
}

/** Idle capital = undeployed USDT only. TON is working capital. */
export function computeIdleCapital(snapshot: WalletSnapshot): number {
  return Math.round(getUndeployedUsdtUsd(snapshot));
}
