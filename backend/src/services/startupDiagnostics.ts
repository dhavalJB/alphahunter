import {
  isTonApiKeyLoaded,
  STONFI_CACHE_TTL_MS,
  TON_CENTER_BASE_URL,
  WALLET_ANALYSIS_CACHE_TTL_MS,
} from "../config";
import { logger } from "./logger";
import {
  enableTonCenterPublicFallback,
  getTonApiKeyPreview,
  probeTonCenterAuth,
} from "./toncenterAuth";

export function logStartupDiagnostics(): void {
  logger.info("startup_diagnostics", {
    tonApiKeyLoaded: isTonApiKeyLoaded() ? "YES" : "NO",
    tonApiKeyPreview: getTonApiKeyPreview(),
    tonCenterAuthMethod: "X-API-Key (with 401→public fallback)",
    tonCenterBaseUrl: TON_CENTER_BASE_URL,
    walletAnalysisCacheTtlMs: WALLET_ANALYSIS_CACHE_TTL_MS,
    stonfiCacheTtlMs: STONFI_CACHE_TTL_MS,
    hackathonMode: true,
    actionsOptional: true,
  });

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "TON API Key Loaded",
      value: isTonApiKeyLoaded() ? "YES" : "NO",
    })
  );
}

/** Pre-enable public fallback if configured key is rejected by TonCenter */
export async function validateTonCenterKeyAtStartup(): Promise<void> {
  if (!isTonApiKeyLoaded()) return;

  const probeUrl = `${TON_CENTER_BASE_URL}/masterchainInfo`;
  const headerProbe = await probeTonCenterAuth(probeUrl, "X-API-Key");

  if (!headerProbe.ok && headerProbe.status === 401) {
    enableTonCenterPublicFallback("startup probe: API key does not exist");
    logger.info("toncenter_startup_validation", {
      keyPreview: getTonApiKeyPreview(),
      headerStatus: headerProbe.status,
      action: "public_fallback_enabled",
    });
  } else if (headerProbe.ok) {
    logger.info("toncenter_startup_validation", {
      keyPreview: getTonApiKeyPreview(),
      headerStatus: headerProbe.status,
      action: "api_key_valid",
    });
  }
}
