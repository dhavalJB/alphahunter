import { Router } from "express";

import { getMiraReport } from "../services/miraReportStore";

import { toApiErrorResponse } from "../services/apiErrors";
import { enrichReport, buildPortfolioReport } from "../services/miraReport";
import { getWalletIntelligence } from "../services/walletPipeline";

const router = Router();

router.post("/api/mira-report", async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ success: false, error: "walletAddress is required" });
    return;
  }

  try {
    const address = walletAddress.trim();
    const intel = await getWalletIntelligence(address);
    const report = enrichReport(
      buildPortfolioReport(address, intel.analysis, intel.opportunities),
      intel.analysis,
      intel.opportunities
    );

    res.json({ success: true, report, dataSource: intel.dataSource });
  } catch (error) {
    const { status, message, retryable } = toApiErrorResponse(error);
    res.status(status).json({ success: false, error: message, retryable });
  }
});

router.get("/api/mira-report/:reportId", (req, res) => {
  const raw = req.params.reportId;
  const stored = getMiraReport(raw);
  if (!stored) {
    res.status(404).json({ success: false, error: "Report not found or expired" });
    return;
  }
  res.json({
    success: true,
    reportId: stored.reportId,
    exportText: stored.exportText,
    verifyPrompt: stored.verifyPrompt,
    report: stored.report,
  });
});

export default router;
