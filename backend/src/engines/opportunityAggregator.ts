import type {
  Opportunity,
  OpportunityComparisonRow,
  OpportunityDiscovery,
  OpportunityMarketData,
  OpportunityMetrics,
  RiskLevel,
  WalletActivity,
  WalletSnapshot,
} from "../types/wallet";
import { computeYieldReturns } from "../services/yieldCalculator";
import {
  formatTvl,
  getStonFiMarketSnapshot,
  type StonFiMarketPool,
  type StonFiMarketSnapshot,
} from "../services/stonfiMarket";
import {
  getTonstakersPoolSnapshot,
  TONSTAKERS_POOL_ADDRESS,
} from "../services/tonstakers";
import { getTonUsdRate } from "../services/tonPrice";
import { scanIdleCapital, type IdleCapitalScan } from "./opportunityScanner";
import { fetchJson } from "../services/httpClient";

const RANK_LABELS = [
  "#1 Best Opportunity",
  "#2 Runner-Up",
  "#3 Strong Alternative",
  "#4 Worth Considering",
  "#5 Additional Option",
] as const;

const TOP_N = 5;
const MIN_DEPLOY_USDT_USD = 1;
const MIN_DEPLOY_TON_USD = 5;
const AGGREGATOR_TIMEOUT_MS = 5_000;

export type ExecutionType = "stake" | "swap" | "lp" | "farm" | "hold";

export interface ExecutableCapital {
  requiredAsset: string;
  availableUsd: number;
  deployableUsd: number;
  executable: boolean;
}

export interface YieldCandidate {
  id: string;
  protocol: string;
  title: string;
  executionType: ExecutionType;
  asset: string;
  apy: number;
  tvlUsd: number;
  liquidityScore: number;
  risk: RiskLevel;
  opportunityScore: number;
  confidence: number;
  poolAddress: string;
  poolName: string;
  stonfiPool?: StonFiMarketPool;
  apySource: string;
  actionLabel: string;
  summary: string;
  reasoning: string[];
  capital: ExecutableCapital;
}

export interface OpportunityAggregationResult {
  opportunities: Opportunity[];
  discovery: OpportunityDiscovery;
}

interface ScanStats {
  opportunitiesScanned: number;
  protocolsSeen: Set<string>;
}

function formatUsd(value: number, decimals = 0): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function riskPenalty(risk: RiskLevel): number {
  if (risk === "low") return 3;
  if (risk === "medium") return 8;
  return 15;
}

function capitalizeRisk(risk: RiskLevel): string {
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

function tvlComponent(tvlUsd: number): number {
  return Math.min(20, Math.log10(Math.max(tvlUsd, 100)) * 4);
}

function liquidityFromPool(pool: StonFiMarketPool): number {
  return Math.min(20, (pool.volume24hUsd / Math.max(pool.tvlUsd, 1)) * 50);
}

function trackScan(stats: ScanStats, protocol: string): void {
  stats.opportunitiesScanned += 1;
  stats.protocolsSeen.add(protocol);
}

function resolveExecutableCapital(
  scan: IdleCapitalScan,
  requiredAsset: string
): ExecutableCapital {
  if (requiredAsset === "USDT") {
    const available = scan.idleUsdt;
    const deployable = available;
    return {
      requiredAsset: "USDT",
      availableUsd: available,
      deployableUsd: deployable,
      executable: deployable >= MIN_DEPLOY_USDT_USD,
    };
  }

  if (requiredAsset === "TON") {
    const available = scan.idleTonUsd;
    const deployable = available;
    return {
      requiredAsset: "TON",
      availableUsd: available,
      deployableUsd: deployable,
      executable: deployable >= MIN_DEPLOY_TON_USD,
    };
  }

  return {
    requiredAsset,
    availableUsd: 0,
    deployableUsd: 0,
    executable: false,
  };
}

/**
 * Rank = Executable + Expected Return + APY + Liquidity + TVL − Risk
 * (+ USDT priority when idle USDT dominates wallet)
 */
export function calculateExecutableScore(
  candidate: Pick<YieldCandidate, "apy" | "tvlUsd" | "liquidityScore" | "risk" | "capital">,
  scan: IdleCapitalScan
): number {
  if (!candidate.capital.executable) return -1;

  const returns = computeYieldReturns(
    Math.max(candidate.capital.deployableUsd, MIN_DEPLOY_USDT_USD),
    candidate.apy
  );

  const executableBonus = 30;
  const returnScore = Math.min(25, returns.annual / 8);
  const apyScore = Math.min(20, candidate.apy);
  const tvlScore = tvlComponent(candidate.tvlUsd);
  const liqScore = candidate.liquidityScore;

  let usdtPriority = 0;
  if (scan.idleUsdt >= scan.idleTonUsd && candidate.capital.requiredAsset === "USDT") {
    usdtPriority = 20;
  }

  const raw =
    executableBonus +
    returnScore +
    apyScore +
    liqScore +
    tvlScore +
    usdtPriority -
    riskPenalty(candidate.risk);

  return clamp(Math.round(raw), 10, 99);
}

export function calculateExecutableConfidence(
  score: number,
  capital: ExecutableCapital,
  apy: number
): number {
  let confidence = Math.round(score * 0.9);

  if (!capital.executable) {
    return clamp(confidence - 45, 15, 40);
  }

  if (capital.requiredAsset === "TON" && capital.deployableUsd < MIN_DEPLOY_TON_USD) {
    confidence = Math.min(confidence, 22);
  }

  if (capital.deployableUsd >= 100) confidence += 6;
  else if (capital.deployableUsd >= 25) confidence += 3;

  if (apy >= 10) confidence += 3;

  return clamp(confidence, 35, 99);
}

function derivePoolRisk(pool: StonFiMarketPool): RiskLevel {
  if (pool.tvlUsd >= 500_000 && pool.apy1d <= 20) return "low";
  if (pool.tvlUsd >= 100_000) return "medium";
  return "high";
}

function poolRequiredAsset(pool: StonFiMarketPool, scan: IdleCapitalScan): string {
  const hasUsdt = pool.pairLabel.toUpperCase().includes("USDT");
  const hasTon = pool.pairLabel.toUpperCase().includes("TON");

  if (hasUsdt && scan.hasDeployableUsdt) return "USDT";
  if (hasTon && scan.hasDeployableTon) return "TON";
  if (hasUsdt) return "USDT";
  return "TON";
}

function buildCapitalReasoning(
  capital: ExecutableCapital,
  apy: number
): string[] {
  const returns = computeYieldReturns(
    Math.max(capital.deployableUsd, capital.executable ? MIN_DEPLOY_USDT_USD : 0),
    apy
  );

  return [
    `Required Asset: ${capital.requiredAsset}`,
    `Available: ${formatUsd(capital.availableUsd)}`,
    `Deployable: ${formatUsd(capital.deployableUsd)}`,
    `Expected Annual Return: ${formatUsd(returns.annual)}`,
    `Expected Monthly Return: ${formatUsd(returns.monthly, 2)}`,
    `Expected Daily Return: ${formatUsd(returns.daily, 2)}`,
  ];
}

function buildMarket(
  candidate: YieldCandidate,
  tonPriceUsd: number
): OpportunityMarketData {
  const deployable = Math.max(candidate.capital.deployableUsd, 0);
  const amountForYield =
    deployable > 0 ? deployable : candidate.apy > 0 ? MIN_DEPLOY_USDT_USD : 0;
  const returns = computeYieldReturns(amountForYield, candidate.apy);

  return {
    poolAddress: candidate.poolAddress,
    poolName: candidate.poolName,
    apy: candidate.apy,
    apyLabel: `${candidate.apy.toFixed(2)}%`,
    apySource: candidate.apySource,
    tvlUsd: candidate.tvlUsd,
    tvlLabel: formatTvl(candidate.tvlUsd),
    volume24hUsd: candidate.stonfiPool?.volume24hUsd,
    tonPriceUsd,
    expectedAnnualReturnUsd: returns.annual,
    expectedMonthlyReturnUsd: returns.monthly,
    expectedDailyReturnUsd: returns.daily,
  };
}

function buildMetrics(
  scan: IdleCapitalScan,
  market: OpportunityMarketData,
  capital: ExecutableCapital
): OpportunityMetrics {
  return {
    idleCapital: capital.deployableUsd,
    idleDurationDays: scan.idleDurationDays,
    missedYieldMin: market.expectedMonthlyReturnUsd,
    missedYieldMax: market.expectedAnnualReturnUsd,
    expectedBenefit: `+${formatUsd(market.expectedAnnualReturnUsd)}/yr`,
    capitalEfficiencyImpact: `+${market.apyLabel} APY`,
    apy: market.apy,
    apySource: market.apySource,
    tvlUsd: market.tvlUsd,
    expectedAnnualReturnUsd: market.expectedAnnualReturnUsd,
    expectedMonthlyReturnUsd: market.expectedMonthlyReturnUsd,
    expectedDailyReturnUsd: market.expectedDailyReturnUsd,
    requiredAsset: capital.requiredAsset,
    availableCapitalUsd: capital.availableUsd,
    deployableCapitalUsd: capital.deployableUsd,
  };
}

function candidateToOpportunity(
  candidate: YieldCandidate,
  scan: IdleCapitalScan,
  rank: number,
  rankLabel: string,
  tonPriceUsd: number
): Opportunity {
  const market = buildMarket(candidate, tonPriceUsd);
  const reasoning = [
    ...buildCapitalReasoning(candidate.capital, candidate.apy),
    ...candidate.reasoning,
  ];

  return {
    id: candidate.id,
    rank,
    title: candidate.title,
    risk: candidate.risk,
    confidence: candidate.confidence,
    opportunityScore: candidate.opportunityScore,
    expectedYield: market.apyLabel,
    capitalRequired: candidate.capital.deployableUsd,
    capitalImpact: `+${formatUsd(market.expectedAnnualReturnUsd)}/yr`,
    summary: candidate.summary,
    explanation: reasoning[0],
    actionLabel: candidate.actionLabel,
    recommendedAction: {
      asset: candidate.capital.requiredAsset,
      amount: candidate.capital.deployableUsd,
      amountLabel: formatUsd(candidate.capital.deployableUsd),
      estimatedBenefit: `+${formatUsd(market.expectedAnnualReturnUsd)}/yr`,
      summary: `${candidate.actionLabel} · ${formatUsd(candidate.capital.deployableUsd)} ${candidate.capital.requiredAsset}`,
      protocol: candidate.protocol,
    },
    market,
    metrics: buildMetrics(scan, market, candidate.capital),
    reasoning,
    aiAnalysis: reasoning,
    protocol: candidate.protocol,
    rankLabel,
    liquidityScore: candidate.liquidityScore,
    executionType: candidate.executionType,
    requiredAsset: candidate.capital.requiredAsset,
    availableCapitalUsd: candidate.capital.availableUsd,
    deployableCapitalUsd: candidate.capital.deployableUsd,
    executable: candidate.capital.executable,
  };
}

function toComparisonRow(
  candidate: YieldCandidate,
  rank: number,
  tonPriceUsd: number
): OpportunityComparisonRow {
  const market = buildMarket(candidate, tonPriceUsd);
  return {
    rank,
    protocol: candidate.protocol,
    title: candidate.title,
    apy: candidate.apy,
    apyLabel: market.apyLabel,
    tvlUsd: candidate.tvlUsd,
    tvlLabel: market.tvlLabel,
    risk: candidate.risk,
    requiredAsset: candidate.capital.requiredAsset,
    annualReturnUsd: market.expectedAnnualReturnUsd,
    opportunityScore: candidate.opportunityScore,
  };
}

function buildWinnerReason(
  winner: YieldCandidate,
  scan: IdleCapitalScan,
  discovery: Pick<OpportunityDiscovery, "opportunitiesScanned" | "protocolsCompared">,
  runnerUp: YieldCandidate | null
): string {
  const returns = computeYieldReturns(
    Math.max(winner.capital.deployableUsd, MIN_DEPLOY_USDT_USD),
    winner.apy
  );

  const parts = [
    `${winner.protocol} ranked #1 after scanning ${discovery.opportunitiesScanned} opportunities across ${discovery.protocolsCompared} protocols.`,
    `Highest composite score (${winner.opportunityScore}) from executable capital + ${formatUsd(returns.annual)}/yr expected return + ${winner.apy.toFixed(2)}% APY + ${formatTvl(winner.tvlUsd)} TVL − ${capitalizeRisk(winner.risk)} risk.`,
  ];

  if (scan.idleUsdt >= scan.idleTonUsd && winner.capital.requiredAsset === "USDT") {
    parts.push(
      `Matches ${formatUsd(scan.idleUsdt)} idle USDT — deployable with current wallet balance.`
    );
  }

  if (runnerUp && runnerUp.protocol !== winner.protocol) {
    parts.push(
      `Beat ${runnerUp.protocol} (${runnerUp.opportunityScore} score, ${formatUsd(computeYieldReturns(Math.max(runnerUp.capital.deployableUsd, MIN_DEPLOY_USDT_USD), runnerUp.apy).annual)}/yr).`
    );
  }

  return parts.join(" ");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("aggregator_timeout")), ms)
    ),
  ]);
}

async function fetchStonFiFarms(): Promise<
  Array<{ apy: number; tvlUsd: number; poolAddress: string; name: string }>
> {
  try {
    const res = await withTimeout(
      fetchJson<{
        farm_list?: Array<{
          apy?: string;
          locked_total_lp_usd?: string;
          pool_address?: string;
          status?: string;
          meta?: { name?: string };
        }>;
      } | null>("https://api.ston.fi/v1/farms?limit=15", {
        source: "stonfi",
        auth: "none",
        maxRetries: 1,
        failSoft: true,
      }),
      3_000
    );
    return (res?.farm_list ?? [])
      .filter((f) => f.status === "active" && parseFloat(f.apy ?? "0") > 0)
      .map((f) => ({
        apy: parseFloat(f.apy ?? "0"),
        tvlUsd: parseFloat(f.locked_total_lp_usd ?? "0"),
        poolAddress: f.pool_address ?? "",
        name: f.meta?.name ?? "STON.fi Farm",
      }))
      .slice(0, 5);
  } catch {
    return [];
  }
}

function finalizeCandidate(
  partial: Omit<YieldCandidate, "opportunityScore" | "confidence" | "reasoning"> & {
    reasoning?: string[];
  },
  scan: IdleCapitalScan
): YieldCandidate | null {
  if (!partial.capital.executable) return null;

  const candidate: YieldCandidate = {
    ...partial,
    reasoning: partial.reasoning ?? [],
    opportunityScore: 0,
    confidence: 0,
  };

  candidate.opportunityScore = calculateExecutableScore(candidate, scan);
  candidate.confidence = calculateExecutableConfidence(
    candidate.opportunityScore,
    candidate.capital,
    candidate.apy
  );

  const capitalLines = buildCapitalReasoning(candidate.capital, candidate.apy);
  candidate.reasoning = [...capitalLines, ...candidate.reasoning];

  return candidate;
}

function evaluateCandidate(
  stats: ScanStats,
  partial: Omit<YieldCandidate, "opportunityScore" | "confidence" | "reasoning"> & {
    reasoning?: string[];
  },
  scan: IdleCapitalScan
): YieldCandidate | null {
  trackScan(stats, partial.protocol);
  return finalizeCandidate(partial, scan);
}

function collectCandidates(
  scan: IdleCapitalScan,
  tonstakers: Awaited<ReturnType<typeof getTonstakersPoolSnapshot>>,
  stonfi: StonFiMarketSnapshot | null,
  farms: Array<{ apy: number; tvlUsd: number; poolAddress: string; name: string }>
): { candidates: YieldCandidate[]; stats: ScanStats } {
  const candidates: YieldCandidate[] = [];
  const stats: ScanStats = { opportunitiesScanned: 0, protocolsSeen: new Set() };
  const tonPrice = stonfi?.tonPriceUsd ?? 5;
  const tonstakersTvlUsd = Math.round(tonstakers.tvlTon * tonPrice);
  const liq = Math.min(15, tonstakers.stakersCount / 10_000);

  if (scan.hasDeployableUsdt) {
    const usdtCapital = resolveExecutableCapital(scan, "USDT");
    const c = evaluateCandidate(
      stats,
      {
        id: "agg-deploy-usdt-tonstakers",
        protocol: "Tonstakers",
        title: "Deploy Idle USDT",
        executionType: "stake",
        asset: "USDT",
        apy: tonstakers.apy,
        tvlUsd: tonstakersTvlUsd,
        liquidityScore: liq,
        risk: "low",
        poolAddress: TONSTAKERS_POOL_ADDRESS,
        poolName: "Tonstakers (USDT → TON stake)",
        apySource: "Tonstakers",
        actionLabel: "Deploy USDT",
        capital: usdtCapital,
        summary: `${formatUsd(usdtCapital.deployableUsd)} USDT deployable at ${tonstakers.apy.toFixed(2)}% APY via Tonstakers.`,
        reasoning: [
          `Protocol: Tonstakers · swap USDT → TON → stake`,
          `TVL: ${formatTvl(tonstakersTvlUsd)}`,
        ],
      },
      scan
    );
    if (c) candidates.push(c);
  }

  if (scan.hasDeployableTon) {
    const tonCapital = resolveExecutableCapital(scan, "TON");
    const stake = evaluateCandidate(
      stats,
      {
        id: "agg-tonstakers-stake-ton",
        protocol: "Tonstakers",
        title: "Stake TON via Tonstakers",
        executionType: "stake",
        asset: "TON",
        apy: tonstakers.apy,
        tvlUsd: tonstakersTvlUsd,
        liquidityScore: liq,
        risk: "low",
        poolAddress: TONSTAKERS_POOL_ADDRESS,
        poolName: "Tonstakers Liquid Staking",
        apySource: "Tonstakers",
        actionLabel: "Stake TON",
        capital: tonCapital,
        summary: `${formatUsd(tonCapital.deployableUsd)} TON deployable at ${tonstakers.apy.toFixed(2)}% APY.`,
        reasoning: [`${scan.idleTon.toFixed(2)} TON available beyond gas reserve`],
      },
      scan
    );
    if (stake) candidates.push(stake);

    const tston = evaluateCandidate(
      stats,
      {
        id: "agg-tston-yield",
        protocol: "Tonstakers · tsTON",
        title: "Mint tsTON",
        executionType: "stake",
        asset: "TON",
        apy: tonstakers.apy,
        tvlUsd: tonstakersTvlUsd,
        liquidityScore: liq,
        risk: "low",
        poolAddress: TONSTAKERS_POOL_ADDRESS,
        poolName: "tsTON Liquid Staking Token",
        apySource: "Tonstakers",
        actionLabel: "Mint tsTON",
        capital: tonCapital,
        summary: `${formatUsd(tonCapital.deployableUsd)} TON → tsTON at ${tonstakers.apy.toFixed(2)}% APY.`,
        reasoning: ["Requires deployable TON balance — not available with USDT-only capital"],
      },
      scan
    );
    if (tston) candidates.push(tston);
  }

  if (stonfi) {
    const pools = [
      ...stonfi.tonUsdtPools.slice(0, 10),
      ...stonfi.usdtPools
        .filter((p) => !stonfi.tonUsdtPools.some((t) => t.address === p.address))
        .slice(0, 8),
    ];

    for (const pool of pools) {
      const requiredAsset = poolRequiredAsset(pool, scan);
      const capital = resolveExecutableCapital(scan, requiredAsset);
      const risk = derivePoolRisk(pool);
      const poolLiq = liquidityFromPool(pool);

      const c = evaluateCandidate(
        stats,
        {
          id: `agg-stonfi-lp-${pool.address.slice(0, 8)}`,
          protocol: "STON.fi",
          title: `Provide ${pool.pairLabel} Liquidity`,
          executionType: "lp",
          asset: requiredAsset,
          apy: pool.apy1d,
          tvlUsd: pool.tvlUsd,
          liquidityScore: poolLiq,
          risk,
          poolAddress: pool.address,
          poolName: pool.pairLabel,
          stonfiPool: pool,
          apySource: "STON.fi",
          actionLabel: "Add Liquidity",
          capital,
          summary: `STON.fi ${pool.pairLabel}: ${pool.apy1d.toFixed(2)}% APY on ${formatUsd(capital.deployableUsd)} ${requiredAsset}.`,
          reasoning: [
            `Pool TVL: ${formatTvl(pool.tvlUsd)}`,
            `24h volume: ${formatTvl(pool.volume24hUsd)}`,
          ],
        },
        scan
      );
      if (c) candidates.push(c);
    }
  }

  for (const farm of farms) {
    evaluateCandidate(
      stats,
      {
        id: `agg-stonfi-farm-${farm.poolAddress.slice(0, 8)}`,
        protocol: "STON.fi Farm",
        title: farm.name,
        executionType: "farm",
        asset: "LP",
        apy: farm.apy,
        tvlUsd: farm.tvlUsd,
        liquidityScore: 5,
        risk: "medium",
        poolAddress: farm.poolAddress,
        poolName: farm.name,
        apySource: "STON.fi",
        actionLabel: "Stake LP",
        capital: {
          requiredAsset: "LP",
          availableUsd: 0,
          deployableUsd: 0,
          executable: false,
        },
        summary: `${farm.name}: ${farm.apy.toFixed(2)}% farm APY — requires LP tokens.`,
        reasoning: ["Requires existing LP position — not executable with idle capital alone"],
      },
      scan
    );
  }

  return { candidates, stats };
}

function sortCandidates(
  candidates: YieldCandidate[],
  scan: IdleCapitalScan
): YieldCandidate[] {
  const usdtBoost =
    scan.idleUsdt > scan.idleTonUsd
      ? (c: YieldCandidate) => (c.capital.requiredAsset === "USDT" ? 5 : 0)
      : () => 0;

  return [...candidates]
    .filter((c) => c.capital.executable)
    .sort(
      (a, b) =>
        b.opportunityScore +
        usdtBoost(b) -
        (a.opportunityScore + usdtBoost(a))
    );
}

function pickTopFive(
  candidates: YieldCandidate[],
  scan: IdleCapitalScan
): YieldCandidate[] {
  const sorted = sortCandidates(candidates, scan);
  if (sorted.length === 0) return [];

  const picked: YieldCandidate[] = [];
  const pickedIds = new Set<string>();
  const protocolsUsed = new Set<string>();

  for (const c of sorted) {
    if (picked.length >= TOP_N) break;
    if (!protocolsUsed.has(c.protocol)) {
      picked.push(c);
      pickedIds.add(c.id);
      protocolsUsed.add(c.protocol);
    }
  }

  for (const c of sorted) {
    if (picked.length >= TOP_N) break;
    if (!pickedIds.has(c.id)) {
      picked.push(c);
      pickedIds.add(c.id);
    }
  }

  return picked.slice(0, TOP_N);
}

export async function aggregateOpportunities(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): Promise<OpportunityAggregationResult> {
  const scan = scanIdleCapital(snapshot, activities);
  const [tonPriceUsd, tonstakers, stonfi, farms] = await Promise.all([
    getTonUsdRate(),
    getTonstakersPoolSnapshot(),
    withTimeout(getStonFiMarketSnapshot(), AGGREGATOR_TIMEOUT_MS).catch(() => null),
    fetchStonFiFarms(),
  ]);

  const { candidates, stats } = collectCandidates(scan, tonstakers, stonfi, farms);
  const topFive = pickTopFive(candidates, scan);

  const discoveryBase = {
    opportunitiesScanned: stats.opportunitiesScanned,
    protocolsCompared: stats.protocolsSeen.size,
    protocols: [...stats.protocolsSeen].sort(),
    comparison: topFive.map((c, i) => toComparisonRow(c, i + 1, tonPriceUsd)),
    winnerReason: "",
  };

  const runnerUp = topFive[1] ?? null;
  discoveryBase.winnerReason =
    topFive.length > 0
      ? buildWinnerReason(topFive[0], scan, discoveryBase, runnerUp)
      : "No executable opportunities found for current wallet balances.";

  const opportunities = topFive.map((c, i) =>
    candidateToOpportunity(
      c,
      scan,
      i + 1,
      RANK_LABELS[i] ?? `#${i + 1}`,
      tonPriceUsd
    )
  );

  return {
    opportunities,
    discovery: discoveryBase,
  };
}
