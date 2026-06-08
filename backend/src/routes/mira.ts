import { Router } from "express";

import { toApiErrorResponse } from "../services/apiErrors";
import { generateMiraWorkflow } from "../services/mira";
import { getWalletIntelligence } from "../services/walletPipeline";

const router = Router();

router.post("/api/mira-analysis", async (req, res) => {
  const { walletAddress, opportunityId } = req.body;

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

    const miraAnalysis = generateMiraWorkflow({
      walletAddress: address,
      analysis: intel.analysis,
      opportunities: intel.opportunities,
      opportunityId: typeof opportunityId === "string" ? opportunityId : undefined,
    });

    res.json({
      success: true,
      ...miraAnalysis,
    });
  } catch (error) {
    const { status, message, retryable } = toApiErrorResponse(error);
    res.status(status).json({ success: false, error: message, retryable });
  }
});

export default router;
