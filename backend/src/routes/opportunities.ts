import { Router } from "express";

import { toApiErrorResponse } from "../services/apiErrors";
import { getWalletIntelligence } from "../services/walletPipeline";

const router = Router();

router.post("/opportunities", async (req, res) => {
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

    res.json({
      success: true,
      walletAddress: address,
      count: intel.opportunities.length,
      opportunities: intel.opportunities,
      discovery: intel.discovery,
      dataSource: intel.dataSource,
    });
  } catch (error) {
    const { status, message, retryable } = toApiErrorResponse(error);
    res.status(status).json({ success: false, error: message, retryable });
  }
});

export default router;
