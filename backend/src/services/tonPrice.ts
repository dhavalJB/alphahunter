import { MemoryCache } from "./cache";
import { fetchJson } from "./httpClient";
import { logger } from "./logger";

const priceCache = new MemoryCache<number>();
const PRICE_CACHE_KEY = "global:ton:usd";
const PRICE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_TON_USD = 5.0;

interface CoinGeckoPriceResponse {
  "the-open-network"?: { usd?: number };
}

async function fetchFromCoinGecko(): Promise<number | null> {
  try {
    const data = await fetchJson<CoinGeckoPriceResponse>(
      "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd",
      { source: "coingecko", auth: "none" }
    );
    const price = data["the-open-network"]?.usd;
    return price && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** TON/USD via CoinGecko (not TonAPI). USDT valued 1:1 in walletData. */
export async function getTonUsdRate(): Promise<number> {
  const cached = priceCache.get(PRICE_CACHE_KEY);
  if (cached !== null) {
    logger.cacheHit(PRICE_CACHE_KEY);
    return cached;
  }

  logger.cacheMiss(PRICE_CACHE_KEY);

  const price = (await fetchFromCoinGecko()) ?? FALLBACK_TON_USD;

  priceCache.set(PRICE_CACHE_KEY, price, PRICE_TTL_MS);
  return price;
}
