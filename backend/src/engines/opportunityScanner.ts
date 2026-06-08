import type { WalletActivity, WalletSnapshot } from "../types/wallet";
import {
  getPrimaryPortfolioValue,
  getTonWorkingCapitalUsd,
  getTotalUsdtUsd,
  getUndeployedUsdtUsd,
} from "../services/primaryPortfolio";
import { computeIdleDurationDays } from "../services/portfolioMetrics";

const GAS_RESERVE_TON = 2;
const MIN_IDLE_TON_USD = 5;

export interface IdleCapitalScan {
  portfolioValue: number;
  idleUsdt: number;
  idleTon: number;
  idleTonUsd: number;
  totalUsdt: number;
  tonWorkingUsd: number;
  idleDurationDays: number;
  hasDeployableUsdt: boolean;
  hasDeployableTon: boolean;
}

export function scanIdleCapital(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): IdleCapitalScan {
  const portfolioValue = getPrimaryPortfolioValue(snapshot);
  const idleUsdt = getUndeployedUsdtUsd(snapshot);
  const totalUsdt = getTotalUsdtUsd(snapshot);
  const tonWorkingUsd = getTonWorkingCapitalUsd(snapshot);
  const idleDurationDays = computeIdleDurationDays(snapshot, activities);

  const deployableTon = Math.max(0, snapshot.tonBalance - GAS_RESERVE_TON);
  const tonPrice = snapshot.tonPriceUsd || 1;
  const idleTonUsd = Math.round(deployableTon * tonPrice * 100) / 100;

  return {
    portfolioValue,
    idleUsdt,
    idleTon: deployableTon,
    idleTonUsd,
    totalUsdt,
    tonWorkingUsd,
    idleDurationDays,
    hasDeployableUsdt: idleUsdt >= 1,
    hasDeployableTon: idleTonUsd >= MIN_IDLE_TON_USD,
  };
}
