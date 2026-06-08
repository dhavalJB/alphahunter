import { ENABLE_DEBUG_LOGS } from "../config";
import type { WalletSnapshot } from "../types/wallet";
import { computeIdleCapital } from "../services/portfolioMetrics";
import { computeYieldReturns } from "../services/yieldCalculator";
import { logger } from "../services/logger";

export interface MissedYieldResult {
  idleCapital: number;
  idleUsdt: number;
  idleDays: number;
  liveApy?: number;
  apySource?: string;
  annualYieldUsd?: number;
  monthlyYieldUsd?: number;
  dailyYieldUsd?: number;
  estimatedMinUsd: number;
  estimatedMaxUsd: number;
  annualizedMinUsd: number;
  annualizedMaxUsd: number;
  yieldRangeLabel: string;
  disclaimer: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Build missed-yield breakdown from live Tonstakers APY. */
export function calculateMissedYieldWithApy(
  snapshot: WalletSnapshot,
  idleDurationDays: number,
  liveApy: number,
  apySource = "Tonstakers"
): MissedYieldResult {
  const idleUsdt = computeIdleCapital(snapshot);
  const idleDays = clamp(idleDurationDays, 1, 365);
  const returns = computeYieldReturns(idleUsdt, liveApy);
  const periodUsd = Math.round(((returns.annual * idleDays) / 365) * 100) / 100;
  const apyLabel = `${liveApy.toFixed(2)}% APY (${apySource})`;

  const result: MissedYieldResult = {
    idleCapital: idleUsdt,
    idleUsdt,
    idleDays,
    liveApy,
    apySource,
    annualYieldUsd: returns.annual,
    monthlyYieldUsd: returns.monthly,
    dailyYieldUsd: returns.daily,
    estimatedMinUsd: periodUsd,
    estimatedMaxUsd: periodUsd,
    annualizedMinUsd: returns.annual,
    annualizedMaxUsd: returns.annual,
    yieldRangeLabel: apyLabel,
    disclaimer:
      `Based on live ${apySource} APY applied to idle capital. Not guaranteed.`,
  };

  if (ENABLE_DEBUG_LOGS) {
    logger.info("missed_yield_debug", {
      address: snapshot.address.slice(0, 8),
      idleUsdt: result.idleUsdt,
      idleDays: result.idleDays,
      liveApy,
    });
  }

  return result;
}

/** Sync placeholder — enriched with live APY in walletPipeline. */
export function calculateMissedYield(
  snapshot: WalletSnapshot,
  idleDurationDays: number
): MissedYieldResult {
  const idleUsdt = computeIdleCapital(snapshot);
  const idleDays = clamp(idleDurationDays, 1, 365);

  return {
    idleCapital: idleUsdt,
    idleUsdt,
    idleDays,
    estimatedMinUsd: 0,
    estimatedMaxUsd: 0,
    annualizedMinUsd: 0,
    annualizedMaxUsd: 0,
    yieldRangeLabel: "Loading live APY…",
    disclaimer: "Yield calculated from live Tonstakers APY when available.",
  };
}
