import { ALLOCATION_COLORS } from "../config";
import type { TokenBalance, WalletSnapshot } from "../types/wallet";
import {
  getPrimaryPortfolioValue,
  getTonWorkingCapitalUsd,
  getTotalUsdtUsd,
} from "./primaryPortfolio";
import { computeIdleCapital } from "./portfolioMetrics";
import type { WalletRawData } from "./walletData";

export { computeIdleCapital } from "./portfolioMetrics";

export function buildWalletSnapshotFromRaw(data: WalletRawData): WalletSnapshot {
  const tonBalanceUsd = data.tonBalance * data.tonPriceUsd;

  const nativeTon: TokenBalance = {
    symbol: "TON",
    name: "Toncoin",
    balance: data.tonBalance,
    balanceUsd: tonBalanceUsd,
    decimals: 9,
    isStablecoin: false,
    isNative: true,
  };

  const tokens: TokenBalance[] = data.jettons
    .filter((j) => j.isUsdt)
    .map((j) => ({
      symbol: j.symbol,
      name: j.name,
      balance: j.balance,
      balanceUsd: j.balanceUsd,
      decimals: j.decimals,
      isStablecoin: true,
      isNative: false,
    }));

  const allTokens = [nativeTon, ...tokens].filter(
    (t) => t.isNative || t.balance > 0
  );
  const stablecoinBalances = allTokens.filter((t) => t.isStablecoin);

  const snapshot: WalletSnapshot = {
    address: data.address,
    tonBalance: data.tonBalance,
    tonBalanceUsd,
    tonPriceUsd: data.tonPriceUsd,
    tokens: allTokens,
    activities: data.activities,
    transactionCount30d: data.transactionCount30d,
    lastActivityTimestamp: data.lastActivityTimestamp,
    stablecoinBalances,
    totalPortfolioUsd: 0,
  };

  snapshot.totalPortfolioUsd = getPrimaryPortfolioValue(snapshot);
  return snapshot;
}

export function buildAllocations(snapshot: WalletSnapshot) {
  const total = snapshot.totalPortfolioUsd || 1;
  const tonUsd = getTonWorkingCapitalUsd(snapshot);
  const usdtUsd = getTotalUsdtUsd(snapshot);

  const primary = [
    { asset: "TON", valueUsd: tonUsd },
    { asset: "USDT", valueUsd: usdtUsd },
  ].filter((a) => a.valueUsd > 0);

  const allocations = primary.map((entry) => {
    let pct = Math.round((entry.valueUsd / total) * 100);
    if (entry.valueUsd > 0 && pct === 0) pct = 1;
    return {
      asset: entry.asset,
      percentage: pct,
      valueUsd: Math.round(entry.valueUsd * 100) / 100,
      color: ALLOCATION_COLORS[entry.asset] ?? ALLOCATION_COLORS.DEFAULT,
    };
  });

  const sum = allocations.reduce((s, a) => s + a.percentage, 0);
  if (sum !== 100 && allocations.length > 0) {
    const largest = allocations.reduce((a, b) => (a.valueUsd >= b.valueUsd ? a : b));
    largest.percentage += 100 - sum;
  }

  return allocations;
}
