import type { WalletActivity, WalletSnapshot } from "../types/wallet";
import {
  countDeFiActivity,
  countSwapActivity,
  isDeployedReceiptToken,
} from "../services/portfolioMetrics";

export type WalletProfileType =
  | "active_trader"
  | "passive_holder"
  | "stablecoin_treasury"
  | "yield_seeker"
  | "liquidity_provider";

export interface WalletProfileResult {
  type: WalletProfileType;
  label: string;
  description: string;
  traits: string[];
}

const PROFILES: Record<
  WalletProfileType,
  { label: string; description: string }
> = {
  active_trader: {
    label: "Active Trader",
    description:
      "Frequent swap activity and on-chain participation suggest an active trading style.",
  },
  passive_holder: {
    label: "Passive Holder",
    description:
      "Low transaction frequency with minimal DeFi engagement — capital is mostly held.",
  },
  stablecoin_treasury: {
    label: "Stablecoin Treasury",
    description:
      "Portfolio is dominated by stablecoin balances, functioning as a liquidity reserve.",
  },
  yield_seeker: {
    label: "Yield Seeker",
    description:
      "Evidence of DeFi deployment, staking, or yield positions indicates active yield optimization.",
  },
  liquidity_provider: {
    label: "Liquidity Provider",
    description:
      "LP positions and liquidity-related activity indicate a market-making or pool provision strategy.",
  },
};

function getStablecoinPercent(snapshot: WalletSnapshot): number {
  const total = snapshot.totalPortfolioUsd || 1;
  const stable = snapshot.stablecoinBalances.reduce((s, t) => s + t.balanceUsd, 0);
  return (stable / total) * 100;
}

function hasLpPositions(snapshot: WalletSnapshot, activities: WalletActivity[]): boolean {
  const lpTokens = snapshot.tokens.some(
    (t) => t.symbol.toUpperCase().includes("LP") || isDeployedReceiptToken(t)
  );
  const lpActivity = activities.some((a) =>
    a.type.toLowerCase().includes("liquidity")
  );
  return lpTokens && lpActivity;
}

function hasDeployedPositions(snapshot: WalletSnapshot): boolean {
  return snapshot.tokens.some((t) => isDeployedReceiptToken(t));
}

export function deriveWalletProfile(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): WalletProfileResult {
  const swapCount = countSwapActivity(activities);
  const defiCount = countDeFiActivity(activities);
  const stablePercent = getStablecoinPercent(snapshot);
  const txCount = snapshot.transactionCount30d;
  const traits: string[] = [];

  let type: WalletProfileType = "passive_holder";

  if (hasLpPositions(snapshot, activities)) {
    type = "liquidity_provider";
    traits.push("LP positions detected");
    traits.push("Liquidity pool activity");
  } else if (defiCount >= 2 || hasDeployedPositions(snapshot)) {
    type = "yield_seeker";
    traits.push("DeFi positions detected");
    if (defiCount >= 1) traits.push(`${defiCount} deployment events`);
  } else if (swapCount >= 3 || (swapCount >= 1 && txCount >= 5)) {
    type = "active_trader";
    traits.push(`${swapCount} swap(s) in recent history`);
    if (txCount >= 5) traits.push(`${txCount} txs / 30d`);
  } else if (stablePercent >= 65) {
    type = "stablecoin_treasury";
    traits.push(`${Math.round(stablePercent)}% stablecoin allocation`);
  } else if (txCount < 2 && swapCount === 0 && defiCount === 0) {
    type = "passive_holder";
    traits.push("Minimal on-chain activity");
  } else if (swapCount >= 1) {
    type = "active_trader";
    traits.push("Occasional swap activity");
  }

  if (stablePercent >= 50 && type !== "stablecoin_treasury") {
    traits.push("Significant stablecoin holdings");
  }

  const profile = PROFILES[type];
  return {
    type,
    label: profile.label,
    description: profile.description,
    traits: traits.slice(0, 3),
  };
}
