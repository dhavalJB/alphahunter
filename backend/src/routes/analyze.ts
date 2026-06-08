import { Router } from "express";

import { toApiErrorResponse } from "../services/apiErrors";
import { getWalletIntelligence } from "../services/walletPipeline";

const router = Router();

router.post("/analyze-wallet", async (req, res) => {
  const { walletAddress } = req.body;

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
    const analysis = intel.analysis;

    res.json({
      success: true,
      walletAddress: address,
      fromCache: intel.fromCache,
      dataSource: intel.dataSource,
      alphaScore: analysis.alphaScore,
      riskScore: analysis.riskScore,
      riskScoreNumeric: analysis.riskScoreNumeric,
      riskScoreLabel: analysis.riskScoreLabel,
      riskBreakdown: analysis.riskBreakdown,
      capitalEfficiency: analysis.capitalEfficiency,
      missedYield: analysis.missedYield,
      walletProfile: analysis.walletProfile,
      primaryPortfolio: analysis.primaryPortfolio,
      portfolioValue: analysis.portfolioValue,
      idleCapital: analysis.idleCapital,
      idleDurationDays: analysis.idleDurationDays,
      alphaBreakdown: analysis.alphaBreakdown,
      allocations: analysis.allocations,
      activities: analysis.activities,
      balances: analysis.balances,
      transactionCount30d: analysis.transactionCount30d,
      lastActivityDaysAgo: analysis.lastActivityDaysAgo,
    });
  } catch (error) {
    const { status, message, retryable } = toApiErrorResponse(error);
    res.status(status).json({ success: false, error: message, retryable });
  }
});

export default router;
