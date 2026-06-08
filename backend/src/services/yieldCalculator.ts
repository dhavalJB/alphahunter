export interface YieldReturns {
  annual: number;
  monthly: number;
  daily: number;
}

/** Compute yield from capital and APY percentage (e.g. 24.08 → 24.08%). */
export function computeYieldReturns(
  capitalUsd: number,
  apyPercent: number
): YieldReturns {
  const annual = Math.round(capitalUsd * (apyPercent / 100) * 100) / 100;
  const monthly = Math.round((annual / 12) * 100) / 100;
  const daily = Math.round((annual / 365) * 100) / 100;
  return { annual, monthly, daily };
}

/** @deprecated Use computeYieldReturns */
export function computeReturns(
  capitalUsd: number,
  apyPercent: number
): { annual: number; monthly: number } {
  const { annual, monthly } = computeYieldReturns(capitalUsd, apyPercent);
  return { annual, monthly };
}
