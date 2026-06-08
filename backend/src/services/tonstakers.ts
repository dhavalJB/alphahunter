import { MemoryCache } from "./cache";
import { fetchJson } from "./httpClient";
import { logger } from "./logger";

/** Mainnet Tonstakers liquid staking pool (tonstakers-sdk CONTRACT.STAKING_CONTRACT_ADDRESS) */
export const TONSTAKERS_POOL_ADDRESS =
  process.env.TONSTAKERS_POOL_ADDRESS ??
  "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR";

const TONAPI_BASE = process.env.TONAPI_BASE_URL ?? "https://tonapi.io";
const CACHE_KEY = "global:tonstakers:apy";
const CACHE_TTL_MS = Number(process.env.TONSTAKERS_CACHE_TTL_MS ?? 5 * 60 * 1000);

interface TonapiStakingPoolResponse {
  pool?: {
    apy?: number;
    total_amount?: number;
    current_nominators?: number;
    name?: string;
  };
}

const apyCache = new MemoryCache<number>();
const poolCache = new MemoryCache<TonapiStakingPoolResponse["pool"]>();

async function fetchPoolInfo(): Promise<TonapiStakingPoolResponse["pool"] | null> {
  const url = `${TONAPI_BASE}/v2/staking/pool/${TONSTAKERS_POOL_ADDRESS}`;
  const data = await fetchJson<TonapiStakingPoolResponse>(url, {
    source: "tonstakers",
    failSoft: true,
  });
  return data?.pool ?? null;
}

/**
 * Live Tonstakers APY — mirrors tonstakers-sdk getCurrentApy().
 * Uses tonapi.io staking pool endpoint (no wallet connector required).
 */
export async function getCurrentApy(): Promise<number> {
  const cached = apyCache.get(CACHE_KEY);
  if (cached !== null) {
    logger.cacheHit(CACHE_KEY);
    return cached;
  }

  logger.cacheMiss(CACHE_KEY);

  const pool = await fetchPoolInfo();
  const apy = pool?.apy;

  if (apy == null || !Number.isFinite(apy) || apy <= 0) {
    throw new Error("Tonstakers APY unavailable");
  }

  apyCache.set(CACHE_KEY, apy, CACHE_TTL_MS);
  if (pool) {
    poolCache.set("global:tonstakers:pool", pool, CACHE_TTL_MS);
  }

  return apy;
}

export async function getTonstakersPoolSnapshot(): Promise<{
  apy: number;
  tvlTon: number;
  stakersCount: number;
  poolName: string;
}> {
  const cachedPool = poolCache.get("global:tonstakers:pool");
  const apy = await getCurrentApy();
  const pool = cachedPool ?? (await fetchPoolInfo());

  const tvlNano = pool?.total_amount ?? 0;
  return {
    apy,
    tvlTon: tvlNano / 1e9,
    stakersCount: pool?.current_nominators ?? 0,
    poolName: pool?.name ?? "Tonstakers",
  };
}
