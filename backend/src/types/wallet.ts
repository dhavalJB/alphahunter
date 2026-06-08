export type RiskLevel = "low" | "medium" | "high";

export type WalletProfileType =
  | "active_trader"
  | "passive_holder"
  | "stablecoin_treasury"
  | "yield_seeker"
  | "liquidity_provider";

export interface TokenBalance {
  symbol: string;
  name: string;
  balance: number;
  balanceUsd: number;
  decimals: number;
  isStablecoin: boolean;
  isNative: boolean;
}

export interface WalletActivity {
  id: string;
  type: string;
  amount?: string;
  time: string;
  status: "success" | "info" | "warning" | "neutral";
  timestamp: number;
}

export interface Allocation {
  asset: string;
  percentage: number;
  valueUsd: number;
  color: string;
}

export interface AlphaBreakdown {
  confidence: number;
  risk: string;
  performance: string;
  factors: {
    activity: number;
    diversification: number;
    stablecoinAllocation: number;
    concentration: number;
  };
}

export interface CapitalEfficiencyBreakdown {
  score: number;
  deployedPercent: number;
  idlePercent: number;
  label: string;
  factors: {
    deployment: number;
    defiUsage: number;
    activity: number;
    concentrationPenalty: number;
  };
}

export interface MissedYieldBreakdown {
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

export interface OpportunityCostBreakdown {
  annualUsd: number;
  periodUsd: number;
  monthlyUsd?: number;
  dailyUsd?: number;
  apyLabel: string;
  apySource?: string;
  source: "tonstakers" | "stonfi" | "estimate";
  disclaimer: string;
}

export interface WalletProfileBreakdown {
  type: WalletProfileType;
  label: string;
  description: string;
  traits: string[];
}

export interface RiskBreakdown {
  score: number;
  level: RiskLevel;
  label: string;
  factors: {
    concentration: number;
    volatility: number;
    activity: number;
    liquidity: number;
  };
}

export interface RecommendedAction {
  asset: string;
  amount: number;
  amountLabel: string;
  estimatedBenefit: string;
  summary: string;
  protocol: string;
}

export interface OpportunityMarketData {
  poolAddress: string;
  poolName: string;
  apy: number;
  apyLabel: string;
  apySource?: string;
  tvlUsd: number;
  tvlLabel: string;
  volume24hUsd?: number;
  tonPriceUsd?: number;
  expectedAnnualReturnUsd: number;
  expectedMonthlyReturnUsd: number;
  expectedDailyReturnUsd?: number;
}

export interface OpportunityMetrics {
  idleCapital: number;
  idleDurationDays: number;
  missedYieldMin: number;
  missedYieldMax: number;
  expectedBenefit: string;
  capitalEfficiencyImpact: string;
  apy?: number;
  apySource?: string;
  tvlUsd?: number;
  expectedAnnualReturnUsd?: number;
  expectedMonthlyReturnUsd?: number;
  expectedDailyReturnUsd?: number;
  requiredAsset?: string;
  availableCapitalUsd?: number;
  deployableCapitalUsd?: number;
}

export interface PrimaryPortfolioBreakdown {
  tonWorkingCapitalUsd: number;
  tonBalance: number;
  usdtBalanceUsd: number;
  usdtBalance: number;
  portfolioValueUsd: number;
  idleUsdtUsd: number;
  deployedUsdtUsd: number;
  tonPriceUsd: number;
}

export interface WalletAnalysis {
  alphaScore: number;
  riskScore: RiskLevel;
  riskScoreNumeric: number;
  riskScoreLabel: string;
  riskBreakdown: RiskBreakdown;
  capitalEfficiency: CapitalEfficiencyBreakdown;
  missedYield: MissedYieldBreakdown;
  opportunityCost?: OpportunityCostBreakdown;
  walletProfile: WalletProfileBreakdown;
  primaryPortfolio: PrimaryPortfolioBreakdown;
  portfolioValue: number;
  idleCapital: number;
  idleDurationDays: number;
  alphaBreakdown: AlphaBreakdown;
  allocations: Allocation[];
  activities: WalletActivity[];
  balances: TokenBalance[];
  transactionCount30d: number;
  lastActivityDaysAgo: number;
}

export type ExecutionType = "stake" | "swap" | "lp" | "farm" | "hold";

export interface OpportunityComparisonRow {
  rank: number;
  protocol: string;
  title: string;
  apy: number;
  apyLabel: string;
  tvlUsd: number;
  tvlLabel: string;
  risk: RiskLevel;
  requiredAsset: string;
  annualReturnUsd: number;
  opportunityScore: number;
}

export interface OpportunityDiscovery {
  opportunitiesScanned: number;
  protocolsCompared: number;
  protocols: string[];
  winnerReason: string;
  comparison: OpportunityComparisonRow[];
}

export interface Opportunity {
  id: string;
  rank?: number;
  rankLabel?: string;
  title: string;
  protocol?: string;
  executionType?: ExecutionType;
  liquidityScore?: number;
  risk: RiskLevel;
  confidence: number;
  opportunityScore?: number;
  expectedYield: string;
  capitalRequired: number;
  capitalImpact: string;
  summary: string;
  explanation: string;
  actionLabel: string;
  recommendedAction: RecommendedAction;
  market?: OpportunityMarketData;
  metrics?: OpportunityMetrics;
  reasoning?: string[];
  aiAnalysis: string[];
  requiredAsset?: string;
  availableCapitalUsd?: number;
  deployableCapitalUsd?: number;
  executable?: boolean;
}

export interface ReportOpportunitySummary {
  id: string;
  title: string;
  confidence: number;
  risk: string;
  capitalImpact: string;
  recommendedAction: RecommendedAction;
}

export interface PortfolioReportSummary {
  portfolioValue: number;
  tonWorkingCapital: number;
  idleStablecoins: number;
  alphaScore: number;
  capitalEfficiency: number;
  capitalEfficiencyLabel: string;
  riskScore: number;
  riskLevel: string;
  riskLabel: string;
  walletProfile: string;
  idleCapital: number;
  idleDurationDays: number;
  missedYieldMin: number;
  missedYieldMax: number;
  missedYieldRangeLabel: string;
}

export interface AlphaHunterReport {
  reportId?: string;
  walletAddress: string;
  generatedAt: string;
  portfolioSummary: PortfolioReportSummary;
  topOpportunities: ReportOpportunitySummary[];
  topOpportunity: ReportOpportunitySummary | null;
  miraRecommendation: string;
  askMiraPrompt: string;
  exportText: string;
}

export interface WalletSnapshot {
  address: string;
  tonBalance: number;
  tonBalanceUsd: number;
  tonPriceUsd: number;
  tokens: TokenBalance[];
  activities: WalletActivity[];
  transactionCount30d: number;
  lastActivityTimestamp: number | null;
  stablecoinBalances: TokenBalance[];
  totalPortfolioUsd: number;
}

export interface StonFiRouteStep {
  type: string;
  from?: string;
  to?: string;
  asset?: string;
  protocol: string;
  pool: string;
  description?: string;
}

export interface RouteFees {
  network: number;
  protocol: number;
  total: number;
}

export interface TonConnectMessage {
  address: string;
  amount: string;
  payload?: string;
}

export interface ExecutionReadiness {
  status: "preview" | "ready" | "unavailable";
  omnistonReady: boolean;
  message: string;
  requiredIntegrations: string[];
}

export interface StonFiRoute {
  protocol: string;
  inputToken: string;
  outputToken: string;
  inputAmount: number;
  expectedOutput: number;
  estimatedApy: string;
  estimatedBenefit: string;
  recommendedAsset: string;
  recommendedAmount: number;
  steps: StonFiRouteStep[];
  fees: RouteFees;
  slippage: number;
  estimatedTime: string;
  readiness: ExecutionReadiness;
  sourceAssetAddress?: string;
  destinationAssetAddress?: string;
  routeDescription?: string;
  executeUrl?: string;
  expectedAnnualUsd?: number;
  expectedMonthlyUsd?: number;
  expectedDailyUsd?: number;
  priceImpact?: string;
  tonConnectMessages?: TonConnectMessage[];
  inWalletExecutable?: boolean;
}

export interface MiraAnalysisRequest {
  walletAddress: string;
  analysis: WalletAnalysis;
  opportunities?: Opportunity[];
  discovery?: OpportunityDiscovery;
  opportunityId?: string;
}

export interface MiraAnalysisResponse {
  walletAddress: string;
  reportId?: string;
  source: "local" | "telegram";
  summary: string;
  insights: string[];
  recommendations: string[];
  confidence: number;
  generatedAt: string;
  disclaimer: string;
  explainPrompt?: string;
  verifyPrompt?: string;
  report?: AlphaHunterReport;
  miraTelegramUrl: string;
  miraDeepLink?: string;
  workflow: {
    exportLabel: string;
    askLabel: string;
    openLabel: string;
    instructions: string;
  };
}
