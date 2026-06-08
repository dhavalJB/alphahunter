import type { Opportunity, WalletAnalysis } from "../types/wallet";
import { discoverOmnistonRoute, type PoolTokenInfo } from "./omnistonRoute";
import { getWalletIntelligence } from "./walletPipeline";

export async function analyzeWallet(address: string): Promise<WalletAnalysis> {
  const intel = await getWalletIntelligence(address);
  return intel.analysis;
}

export async function getWalletOpportunities(address: string): Promise<Opportunity[]> {
  const intel = await getWalletIntelligence(address);
  return intel.opportunities;
}

export async function buildRouteForOpportunity(
  opportunity: Opportunity,
  amountUsd?: number,
  usdtAddress?: string | null,
  walletAddress?: string | null,
  poolTokens?: PoolTokenInfo | null
) {
  const capital = amountUsd ?? opportunity.capitalRequired;
  return discoverOmnistonRoute(
    opportunity,
    capital,
    usdtAddress,
    walletAddress,
    poolTokens
  );
}
