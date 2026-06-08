import { Router } from "express";

import {
  ACTIONS_CACHE_TTL_MS,
  ACTIONS_FETCH_LIMIT,
  isTonApiKeyLoaded,
  OPPORTUNITY_RANKINGS_CACHE_TTL_MS,
  STONFI_CACHE_TTL_MS,
  WALLET_ANALYSIS_CACHE_TTL_MS,
} from "../config";
import { perfMetrics } from "../services/perfMetrics";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "AlphaHunter API",
    dataSources: {
      blockchain: "toncenter",
      tonPrice: "coingecko",
      tonApiKeyLoaded: isTonApiKeyLoaded() ? "YES" : "NO",
    },
    cache: {
      walletAnalysisTtlMs: WALLET_ANALYSIS_CACHE_TTL_MS,
      opportunityRankingsTtlMs: OPPORTUNITY_RANKINGS_CACHE_TTL_MS,
      stonfiMarketTtlMs: STONFI_CACHE_TTL_MS,
      actionsCacheTtlMs: ACTIONS_CACHE_TTL_MS,
      actionsFetchLimit: ACTIONS_FETCH_LIMIT,
      strategy: "tiered in-memory",
      hackathonMode: true,
    },
  });
});

router.get("/health/performance", (_req, res) => {
  res.json({
    success: true,
    ...perfMetrics.getReport(),
  });
});

export default router;
