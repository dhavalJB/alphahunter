import type {
  ExecutionReadiness,
  OpportunityMarketData,
  StonFiRoute,
  StonFiRouteStep,
} from "../types/wallet";

function buildReadiness(): ExecutionReadiness {
  return {
    status: "preview",
    omnistonReady: false,
    message:
      "Route preview ready. Omniston execution will be enabled in a future release.",
    requiredIntegrations: ["STON.fi Omniston SDK", "TON Connect transaction signing"],
  };
}

function buildSteps(
  inputToken: string,
  poolName: string,
  poolAddress?: string
): StonFiRouteStep[] {
  const poolLabel = poolAddress
    ? `${poolName} (${poolAddress.slice(0, 6)}…)`
    : poolName;

  return [
    {
      type: "approve",
      from: inputToken,
      to: "STON.fi Router",
      protocol: "STON.fi",
      pool: `${inputToken} Approval`,
      description: `Approve ${inputToken} for STON.fi router`,
    },
    {
      type: "deposit",
      from: inputToken,
      to: "LP",
      protocol: "STON.fi",
      pool: poolLabel,
      description: `Provide ${inputToken} liquidity to ${poolName}`,
    },
  ];
}

export function buildStonFiRoute(
  opportunityId: string,
  capitalRequired: number,
  market?: OpportunityMarketData,
  inputToken = "USDT"
): StonFiRoute {
  const inputAmount = Math.round(capitalRequired * 100) / 100;
  const apy = market?.apy ?? 0;
  const annualBenefit = market?.expectedAnnualReturnUsd ??
    Math.round(inputAmount * (apy / 100) * 100) / 100;

  const poolName = market?.poolName ?? "STON.fi Pool";
  const estimatedApy = market?.apyLabel ?? (apy > 0 ? `${apy.toFixed(1)}%` : "—");

  return {
    protocol: "STON.fi Omniston",
    inputToken,
    outputToken: "LP",
    inputAmount,
    expectedOutput: inputAmount,
    estimatedApy,
    estimatedBenefit: apy > 0 ? `~$${annualBenefit.toLocaleString()}/yr` : "—",
    recommendedAsset: inputToken,
    recommendedAmount: inputAmount,
    steps: buildSteps(inputToken, poolName, market?.poolAddress),
    fees: { network: 0.05, protocol: 0.3, total: 0.35 },
    slippage: 0.1,
    estimatedTime: "~45s",
    readiness: buildReadiness(),
  };
}
