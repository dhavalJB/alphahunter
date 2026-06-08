export const TON_CENTER_BASE_URL =
  process.env.TON_CENTER_BASE_URL ?? "https://toncenter.com/api/v3";

/** Read at runtime — never cache at module load (dotenv loads after imports). */
export function getTonApiKey(): string {
  return (process.env.TON_API_KEY ?? "").trim();
}

export function isTonApiKeyLoaded(): boolean {
  return getTonApiKey().length > 0;
}

/** @deprecated Use getTonApiKey() — may be empty if read before dotenv */
export const TON_API_KEY = "";

export const STONFI_API_URL = process.env.STONFI_API_URL ?? "https://api.ston.fi";

export const STONFI_APP_URL =
  process.env.STONFI_APP_URL ?? "https://app.ston.fi";

export const MIRA_TELEGRAM_URL =
  process.env.MIRA_TELEGRAM_URL ?? "https://t.me/mira";

/** Wallet analysis (TonCenter + scores): 1 minute */
export const WALLET_ANALYSIS_CACHE_TTL_MS = Number(
  process.env.WALLET_ANALYSIS_CACHE_TTL_MS ?? 60_000
);

/** Opportunity rankings (STON.fi scan): 2 minutes */
export const OPPORTUNITY_RANKINGS_CACHE_TTL_MS = Number(
  process.env.OPPORTUNITY_RANKINGS_CACHE_TTL_MS ?? 120_000
);

/** STON.fi market data (assets + pools): 10 minutes */
export const STONFI_CACHE_TTL_MS = Number(
  process.env.STONFI_CACHE_TTL_MS ?? 10 * 60 * 1000
);

/** TonCenter actions cache per wallet */
export const ACTIONS_CACHE_TTL_MS = Number(
  process.env.ACTIONS_CACHE_TTL_MS ?? 5 * 60 * 1000
);

/** Hackathon: max actions to fetch (reduces 429 risk) */
export const ACTIONS_FETCH_LIMIT = Number(
  process.env.ACTIONS_FETCH_LIMIT ?? 10
);

export const ENABLE_DEBUG_LOGS =
  (process.env.ENABLE_DEBUG_LOGS ?? "false").toLowerCase() === "true";

/** @deprecated Use tiered TTLs above */
export const CACHE_TTL_MS = WALLET_ANALYSIS_CACHE_TTL_MS;

export const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS ?? 15_000);
export const HTTP_MAX_RETRIES = Number(process.env.HTTP_MAX_RETRIES ?? 3);

export const STABLECOIN_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "USD₮",
  "JUSDT",
  "JUSDC",
  "USDTT",
  "USDE",
]);

export const ALLOCATION_COLORS: Record<string, string> = {
  TON: "#00E5FF",
  USDT: "#00FF94",
  USDC: "#7C3AED",
  DEFAULT: "#FFB800",
};
