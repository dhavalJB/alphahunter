import type { WalletActivity, WalletSnapshot } from "../types/wallet";
import { logger } from "../services/logger";
import {
  aggregateOpportunities,
  type OpportunityAggregationResult,
} from "./opportunityAggregator";

export async function scanOpportunities(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
): Promise<OpportunityAggregationResult> {
  const address = snapshot.address;
  const start = Date.now();
  logger.opportunitiesStart(address);

  try {
    const result = await aggregateOpportunities(snapshot, activities);
    logger.opportunitiesComplete(
      address,
      Date.now() - start,
      result.opportunities.length,
      "stonfi"
    );
    return result;
  } catch (error) {
    logger.opportunitiesComplete(address, Date.now() - start, 0, "fallback");
    return {
      opportunities: [],
      discovery: {
        opportunitiesScanned: 0,
        protocolsCompared: 0,
        protocols: [],
        winnerReason: "Opportunity scan failed — no comparison available.",
        comparison: [],
      },
    };
  }
}

/** @deprecated Use scanOpportunities */
export async function generateOpportunities(
  snapshot: WalletSnapshot,
  activities: WalletActivity[]
) {
  const result = await scanOpportunities(snapshot, activities);
  return result.opportunities;
}
