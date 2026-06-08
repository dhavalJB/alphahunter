import { Router } from "express";

import { TON_CENTER_BASE_URL } from "../config";
import {
  getTonCenterAuthDiagnostics,
  isTonCenterPublicFallback,
  probeTonCenterAuth,
} from "../services/toncenterAuth";

const router = Router();

const DEFAULT_TEST_ADDRESS =
  "0:2cbe084dee9fd6f866d42df874da374f4fe38d0e7d741542ab134307b5b75475";

/**
 * Standalone TonCenter auth diagnostic.
 * GET /debug/toncenter?address=<optional>
 */
router.get("/debug/toncenter", async (req, res) => {
  const address =
    typeof req.query.address === "string" && req.query.address.trim()
      ? req.query.address.trim()
      : DEFAULT_TEST_ADDRESS;

  const testUrl = `${TON_CENTER_BASE_URL}/accountStates?address=${encodeURIComponent(address)}&include_boc=false`;

  try {
    const [headerProbe, queryProbe, publicProbe] = await Promise.all([
      probeTonCenterAuth(testUrl, "X-API-Key"),
      probeTonCenterAuth(testUrl, "api_key_query"),
      probeTonCenterAuth(testUrl, "public"),
    ]);

    const recommended =
      headerProbe.ok || queryProbe.ok
        ? "API key is valid — use X-API-Key header (current default)"
        : publicProbe.ok
          ? "API key is INVALID — use public fallback (active automatically on 401)"
          : "All auth methods failed — check address format and TonCenter availability";

    res.json({
      success: true,
      diagnostics: getTonCenterAuthDiagnostics(),
      publicFallbackActive: isTonCenterPublicFallback(),
      testAddress: address.slice(0, 12) + "…",
      probes: {
        xApiKeyHeader: headerProbe,
        apiKeyQuery: queryProbe,
        public: publicProbe,
      },
      analysis: {
        headerWorks: headerProbe.ok,
        queryWorks: queryProbe.ok,
        publicWorks: publicProbe.ok,
        keyRejectedReason: !headerProbe.ok
          ? headerProbe.bodyPreview
          : null,
        recommended,
        permanentFix: !headerProbe.ok && !queryProbe.ok
          ? "Generate a new mainnet API key via @toncenter Telegram bot (Manage API Keys → Create API Key). Replace TON_API_KEY in .env. The current key is not registered in TonCenter v3."
          : "No change needed — authentication is working.",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Diagnostic failed",
      diagnostics: getTonCenterAuthDiagnostics(),
    });
  }
});

export default router;
