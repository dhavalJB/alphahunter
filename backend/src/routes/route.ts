import { Router } from "express";

import { toApiErrorResponse } from "../services/apiErrors";
import { getStonFiMarketSnapshot } from "../services/stonfiMarket";
import { buildRouteForOpportunity } from "../services/walletAnalyzer";
import { getWalletIntelligence } from "../services/walletPipeline";

const router = Router();

router.post("/route", async (req, res) => {
  const { opportunityId, walletAddress, amountUsd, percent } = req.body;

  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({
      success: false,
      error: "walletAddress is required",
    });
    return;
  }

  try {
    const address = walletAddress.trim();
    const intel = await getWalletIntelligence(address);
    const opportunity =
      intel.opportunities.find((o) => o.id === opportunityId) ??
      intel.opportunities[0];

    if (!opportunity) {
      res.status(404).json({
        success: false,
        error: "No opportunities found for this wallet",
      });
      return;
    }

    let deployAmount = opportunity.capitalRequired;
    if (typeof amountUsd === "number" && amountUsd > 0) {
      deployAmount = amountUsd;
    } else if (typeof percent === "number" && percent > 0) {
      deployAmount =
        Math.round(opportunity.capitalRequired * (percent / 100) * 100) / 100;
    }

    const stonfi = await getStonFiMarketSnapshot().catch(() => null);
    const usdtAddress = stonfi?.usdtAssetAddress ?? null;

    let poolTokens = null;
    if (opportunity.market?.poolAddress && stonfi) {
      const pool = [
        ...stonfi.tonUsdtPools,
        ...stonfi.usdtPools,
      ].find((p) => p.address === opportunity.market?.poolAddress);
      if (pool) {
        poolTokens = {
          token0Address: pool.token0Address,
          token1Address: pool.token1Address,
        };
      }
    }

    const route = await buildRouteForOpportunity(
      opportunity,
      deployAmount,
      usdtAddress,
      address,
      poolTokens
    );

    res.json({
      success: true,
      opportunityId: opportunity.id,
      walletAddress: address,
      deployAmount,
      route,
    });
  } catch (error) {
    const { status, message, retryable } = toApiErrorResponse(error);
    res.status(status).json({ success: false, error: message, retryable });
  }
});

export default router;
