import { STONFI_APP_URL } from "../config";
import type {
  ExecutionReadiness,
  Opportunity,
  StonFiRoute,
  StonFiRouteStep,
  TonConnectMessage,
} from "../types/wallet";
import { computeYieldReturns } from "./yieldCalculator";
import { fetchJson } from "./httpClient";
import {
  buildLiquidityTonConnectMessages,
  buildSwapTonConnectMessages,
} from "./swapPayloadBuilder";

const TON_NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

const STONFI_API = process.env.STONFI_API_URL ?? "https://api.ston.fi";
const SLIPPAGE = "0.01";

interface SwapSimulateResponse {
  ask_units?: string;
  min_ask_units?: string;
  offer_units?: string;
  pool_address?: string;
  price_impact?: string;
  recommended_slippage_tolerance?: string;
  router_address?: string;
  swap_rate?: string;
}

export interface PoolTokenInfo {
  token0Address: string;
  token1Address: string;
}

function stonfiSimUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${STONFI_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function simulateSwap(
  offerAddress: string,
  askAddress: string,
  offerUnits: string
): Promise<SwapSimulateResponse | null> {
  const url = stonfiSimUrl("/v1/swap/simulate", {
    offer_address: offerAddress,
    ask_address: askAddress,
    units: offerUnits,
    slippage_tolerance: SLIPPAGE,
    dex_v2: "true",
  });
  return fetchJson<SwapSimulateResponse>(url, {
    source: "stonfi",
    method: "POST",
    auth: "none",
    maxRetries: 1,
    failSoft: true,
  });
}

function toJettonUnits(amountUsd: number, decimals = 6): string {
  return Math.round(amountUsd * 10 ** decimals).toString();
}

function fromJettonUnits(units: string, decimals = 9): number {
  return parseFloat(units) / 10 ** decimals;
}

function buildReadiness(
  quoteAvailable: boolean,
  hasInWalletPayload: boolean
): ExecutionReadiness {
  if (quoteAvailable && hasInWalletPayload) {
    return {
      status: "ready",
      omnistonReady: true,
      message: "Quote ready — sign with TON Connect to execute in-wallet.",
      requiredIntegrations: ["TON Connect sendTransaction"],
    };
  }
  if (quoteAvailable) {
    return {
      status: "ready",
      omnistonReady: true,
      message:
        "Live quote available — execute via linked STON.fi / Tonstakers flow.",
      requiredIntegrations: ["STON.fi quote", "External execute URL"],
    };
  }
  return {
    status: "preview",
    omnistonReady: false,
    message:
      "No live quote — swap simulation failed or required asset address missing.",
    requiredIntegrations: [
      "STON.fi /v1/swap/simulate",
      "@ston-fi/sdk",
      "TON Connect sendTransaction",
    ],
  };
}

function buildSteps(
  source: string,
  dest: string,
  protocol: string,
  pool: string,
  extra?: StonFiRouteStep[]
): StonFiRouteStep[] {
  const steps: StonFiRouteStep[] = extra ?? [];
  if (source !== dest) {
    steps.unshift({
      type: "swap",
      from: source,
      to: dest,
      protocol: "Omniston / STON.fi",
      pool,
      description: `Swap ${source} → ${dest}`,
    });
  }
  steps.push({
    type: "deposit",
    from: dest,
    to: "Yield Position",
    protocol,
    pool,
    description: `Deploy to ${protocol}`,
  });
  return steps;
}

async function buildTonConnectPayload(
  opportunity: Opportunity,
  amountUsd: number,
  walletAddress: string,
  usdtAddress: string | null | undefined,
  poolTokens: PoolTokenInfo | null | undefined
): Promise<TonConnectMessage[]> {
  const execType = opportunity.executionType ?? "lp";
  const requiredAsset = opportunity.requiredAsset ?? opportunity.recommendedAction?.asset ?? "USDT";

  try {
    if (execType === "stake" && usdtAddress && requiredAsset === "USDT") {
      return await buildSwapTonConnectMessages({
        walletAddress,
        offerAddress: usdtAddress,
        askAddress: TON_NATIVE,
        offerUnits: toJettonUnits(amountUsd, 6),
      });
    }

    if (execType === "lp" && opportunity.market?.poolAddress && poolTokens) {
      const poolAddress = opportunity.market.poolAddress;
      const sendToken =
        requiredAsset === "TON"
          ? TON_NATIVE
          : usdtAddress ?? poolTokens.token0Address;

      const otherToken =
        sendToken === poolTokens.token0Address ||
        sendToken.toUpperCase() === poolTokens.token0Address.toUpperCase()
          ? poolTokens.token1Address
          : poolTokens.token0Address;

      const decimals = requiredAsset === "TON" ? 9 : 6;
      const offerUnits = toJettonUnits(amountUsd, decimals);

      return await buildLiquidityTonConnectMessages({
        walletAddress,
        poolAddress,
        sendTokenAddress: sendToken,
        otherTokenAddress: otherToken,
        offerUnits,
      });
    }

  } catch {
    return [];
  }

  return [];
}

export async function discoverOmnistonRoute(
  opportunity: Opportunity,
  amountUsd: number,
  usdtAddress?: string | null,
  walletAddress?: string | null,
  poolTokens?: PoolTokenInfo | null
): Promise<StonFiRoute> {
  const apy = opportunity.market?.apy ?? 0;
  const returns = computeYieldReturns(amountUsd, apy);
  const execType = opportunity.executionType ?? "lp";
  const protocol = opportunity.protocol ?? opportunity.recommendedAction.protocol;

  let sourceAsset = opportunity.recommendedAction?.asset ?? "USDT";
  let destAsset = "LP";
  let expectedOutput = amountUsd;
  let slippage = 1;
  let routePath = `${sourceAsset} → ${destAsset}`;
  let steps: StonFiRouteStep[] = [];
  let simulateOk = false;
  let poolAddress = opportunity.market?.poolAddress ?? "";
  let executeUrl = STONFI_APP_URL;
  let priceImpact: string | undefined;

  if (execType === "stake" && usdtAddress) {
    sourceAsset = "USDT";
    destAsset = "TON";
    const sim = await simulateSwap(
      usdtAddress,
      TON_NATIVE,
      toJettonUnits(amountUsd, 6)
    );
    if (sim?.ask_units) {
      expectedOutput = fromJettonUnits(sim.ask_units, 9);
      slippage = parseFloat(sim.recommended_slippage_tolerance ?? "0.01") * 100;
      routePath = `USDT → TON → ${protocol}`;
      poolAddress = sim.pool_address ?? poolAddress;
      priceImpact = sim.price_impact;
      simulateOk = true;
      steps = buildSteps("USDT", "TON", protocol, opportunity.market?.poolName ?? "Tonstakers", [
        {
          type: "stake",
          from: "TON",
          to: "tsTON",
          protocol,
          pool: opportunity.market?.poolName ?? "Tonstakers",
          description: "Stake TON via Tonstakers",
        },
      ]);
    }
    executeUrl = "https://tonstakers.com/";
  } else if (execType === "lp" && opportunity.market?.poolAddress) {
    sourceAsset = opportunity.recommendedAction?.asset ?? "USDT";
    destAsset = `${opportunity.market.poolName} LP`;
    routePath = `${sourceAsset} → ${destAsset}`;
    steps = buildSteps(
      sourceAsset,
      destAsset,
      "STON.fi",
      opportunity.market.poolName,
      []
    );
    executeUrl = `${STONFI_APP_URL}/pools/${opportunity.market.poolAddress}`;
    simulateOk = true;
  } else if (execType === "farm") {
    sourceAsset = "LP";
    destAsset = "Farm Rewards";
    routePath = `LP → ${opportunity.market?.poolName ?? "Farm"}`;
    steps = [
      {
        type: "stake",
        from: "LP",
        to: "Farm NFT",
        protocol: "STON.fi Farm",
        pool: opportunity.market?.poolName ?? "Farm",
        description: "Stake LP in STON.fi farm",
      },
    ];
    executeUrl = `${STONFI_APP_URL}/farms`;
    simulateOk = true;
  } else {
    steps = buildSteps(sourceAsset, destAsset, protocol, opportunity.market?.poolName ?? "Pool");
  }

  let tonConnectMessages: TonConnectMessage[] = [];
  if (walletAddress && simulateOk) {
    tonConnectMessages = await buildTonConnectPayload(
      opportunity,
      amountUsd,
      walletAddress,
      usdtAddress,
      poolTokens
    );
  }

  const inWalletExecutable = tonConnectMessages.length > 0;
  const readiness = buildReadiness(simulateOk, inWalletExecutable);

  return {
    protocol: "Omniston / STON.fi",
    inputToken: sourceAsset,
    outputToken: destAsset,
    inputAmount: amountUsd,
    expectedOutput,
    estimatedApy: opportunity.market?.apyLabel ?? `${apy.toFixed(2)}%`,
    estimatedBenefit: `+${returns.annual.toLocaleString("en-US", { maximumFractionDigits: 0 })}/yr`,
    recommendedAsset: sourceAsset,
    recommendedAmount: amountUsd,
    steps,
    fees: { network: 0.05, protocol: 0.3, total: 0.35 },
    slippage,
    estimatedTime: "~45s",
    readiness,
    sourceAssetAddress: usdtAddress ?? undefined,
    destinationAssetAddress: poolAddress || undefined,
    routeDescription: routePath,
    executeUrl,
    expectedAnnualUsd: returns.annual,
    expectedMonthlyUsd: returns.monthly,
    expectedDailyUsd: returns.daily,
    priceImpact,
    tonConnectMessages,
    inWalletExecutable,
  };
}
