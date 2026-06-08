import { STONFI_CACHE_TTL_MS } from "../config";
import { MemoryCache, dedupeRequest } from "./cache";
import { fetchJson } from "./httpClient";
import { logger } from "./logger";
import { normalizeTonAddress } from "./toncenter";

const STONFI_API_BASE = process.env.STONFI_API_URL ?? "https://api.ston.fi";
const SOURCE = "stonfi";
const CACHE_KEY_POOLS = "stonfi:pools";
const CACHE_KEY_ASSETS = "stonfi:assets";
const CACHE_TTL_MS = STONFI_CACHE_TTL_MS;

const TON_NATIVE_ADDRESS =
  "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

export interface StonFiAsset {
  contractAddress: string;
  symbol: string;
  displayName: string;
  decimals: number;
  dexPriceUsd: number;
}

export interface StonFiMarketPool {
  address: string;
  pairLabel: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  apy1d: number;
  apy7d: number;
  tvlUsd: number;
  volume24hUsd: number;
  deprecated: boolean;
}

export interface StonFiMarketSnapshot {
  tonPriceUsd: number;
  usdtAssetAddress: string | null;
  tonUsdtPools: StonFiMarketPool[];
  usdtPools: StonFiMarketPool[];
  fetchedAt: string;
}

interface RawAsset {
  contract_address?: string;
  symbol?: string;
  display_name?: string;
  decimals?: number;
  dex_price_usd?: string;
  dex_usd_price?: string;
  deprecated?: boolean;
  blacklisted?: boolean;
}

interface RawPool {
  address: string;
  token0_address: string;
  token1_address: string;
  apy_1d?: string;
  apy_7d?: string;
  apy_30d?: string;
  lp_total_supply_usd?: string;
  volume_24h_usd?: string;
  deprecated?: boolean;
}

const poolsCache = new MemoryCache<StonFiMarketPool[]>();
const assetsCache = new MemoryCache<StonFiAsset[]>();

function stonfiUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(`${STONFI_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function parseNum(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** STON.fi returns APY as percentage string e.g. "6.82" */
function parseApyPercent(value: string | undefined): number {
  const n = parseNum(value);
  if (n <= 0) return 0;
  if (n < 1) return Math.round(n * 10000) / 100;
  return Math.round(n * 100) / 100;
}

function isUsdtSymbol(sym: string): boolean {
  const u = sym.toUpperCase();
  return u === "USDT" || u === "USD₮" || u.includes("USDT");
}

function isTonSymbol(sym: string): boolean {
  return sym.toUpperCase() === "TON";
}

async function fetchAssets(): Promise<StonFiAsset[]> {
  const cached = assetsCache.get(CACHE_KEY_ASSETS);
  if (cached) {
    logger.cacheHit(CACHE_KEY_ASSETS);
    return cached;
  }

  try {
    const data = await dedupeRequest("stonfi:fetch:assets", async () => {
      const res = await fetchJson<{ asset_list?: RawAsset[] } | null>(
        stonfiUrl("/v1/assets", { limit: 100 }),
        { source: SOURCE, auth: "none", maxRetries: 1, failSoft: true }
      );
      if (!res) return [];
      return (res.asset_list ?? [])
        .filter((a) => !a.deprecated && !a.blacklisted)
        .map((a) => ({
          contractAddress: a.contract_address ?? "",
          symbol: (a.symbol ?? a.display_name ?? "").trim(),
          displayName: a.display_name ?? a.symbol ?? "",
          decimals: a.decimals ?? 9,
          dexPriceUsd: parseNum(a.dex_price_usd ?? a.dex_usd_price),
        }))
        .filter((a) => a.contractAddress);
    });

    assetsCache.set(CACHE_KEY_ASSETS, data, CACHE_TTL_MS);
    return data;
  } catch (error) {
    // fail-soft — pools may still resolve via token addresses
    return [];
  }
}

function resolveAssetSymbol(
  address: string,
  assetIndex: Map<string, StonFiAsset>
): string {
  const asset = assetIndex.get(normalizeTonAddress(address));
  if (asset) return asset.symbol;
  if (normalizeTonAddress(address) === normalizeTonAddress(TON_NATIVE_ADDRESS)) {
    return "TON";
  }
  return "UNKNOWN";
}

async function fetchAllPools(assetIndex: Map<string, StonFiAsset>): Promise<StonFiMarketPool[]> {
  const cached = poolsCache.get(CACHE_KEY_POOLS);
  if (cached) {
    logger.cacheHit(CACHE_KEY_POOLS);
    return cached;
  }

  const rawPools = await dedupeRequest("stonfi:fetch:pools", async () => {
    const res = await fetchJson<{ pool_list?: RawPool[] } | null>(
      stonfiUrl("/v1/pools", { limit: 200 }),
      { source: SOURCE, auth: "none", maxRetries: 1, failSoft: true }
    );
    return res?.pool_list ?? [];
  });

  const pools: StonFiMarketPool[] = rawPools
    .filter((p) => !p.deprecated)
    .map((p) => {
      const token0Symbol = resolveAssetSymbol(p.token0_address, assetIndex);
      const token1Symbol = resolveAssetSymbol(p.token1_address, assetIndex);
      return {
        address: p.address,
        pairLabel: `${token0Symbol}/${token1Symbol}`,
        token0Address: p.token0_address,
        token1Address: p.token1_address,
        token0Symbol,
        token1Symbol,
        apy1d: parseApyPercent(p.apy_1d),
        apy7d: parseApyPercent(p.apy_7d),
        tvlUsd: parseNum(p.lp_total_supply_usd),
        volume24hUsd: parseNum(p.volume_24h_usd),
        deprecated: Boolean(p.deprecated),
      };
    })
    .filter((p) => p.tvlUsd > 1000 && p.apy1d > 0);

  poolsCache.set(CACHE_KEY_POOLS, pools, CACHE_TTL_MS);
  return pools;
}

function findUsdtAsset(assets: StonFiAsset[]): StonFiAsset | null {
  return (
    assets.find((a) => isUsdtSymbol(a.symbol) && a.dexPriceUsd > 0) ??
    assets.find((a) => isUsdtSymbol(a.symbol)) ??
    null
  );
}

function getTonUsdtPools(pools: StonFiMarketPool[]): StonFiMarketPool[] {
  return pools.filter(
    (p) =>
      (isTonSymbol(p.token0Symbol) && isUsdtSymbol(p.token1Symbol)) ||
      (isUsdtSymbol(p.token0Symbol) && isTonSymbol(p.token1Symbol))
  );
}

function getUsdtPools(pools: StonFiMarketPool[], usdtAddress: string | null): StonFiMarketPool[] {
  const usdtNorm = usdtAddress ? normalizeTonAddress(usdtAddress) : "";
  return pools.filter((p) => {
    if (isUsdtSymbol(p.token0Symbol) || isUsdtSymbol(p.token1Symbol)) return true;
    if (!usdtNorm) return false;
    return (
      normalizeTonAddress(p.token0Address) === usdtNorm ||
      normalizeTonAddress(p.token1Address) === usdtNorm
    );
  });
}

const EMPTY_SNAPSHOT: StonFiMarketSnapshot = {
  tonPriceUsd: 0,
  usdtAssetAddress: null,
  tonUsdtPools: [],
  usdtPools: [],
  fetchedAt: new Date().toISOString(),
};

export async function getStonFiMarketSnapshot(): Promise<StonFiMarketSnapshot> {
  try {
    const assets = await fetchAssets();
    const assetIndex = new Map<string, StonFiAsset>();
    for (const a of assets) {
      assetIndex.set(normalizeTonAddress(a.contractAddress), a);
    }
    assetIndex.set(normalizeTonAddress(TON_NATIVE_ADDRESS), {
      contractAddress: TON_NATIVE_ADDRESS,
      symbol: "TON",
      displayName: "Toncoin",
      decimals: 9,
      dexPriceUsd: 0,
    });

    const pools = await fetchAllPools(assetIndex);
    const usdtAsset = findUsdtAsset(assets);
    const tonAsset = assetIndex.get(normalizeTonAddress(TON_NATIVE_ADDRESS));
    const tonUsdtPools = getTonUsdtPools(pools);
    const usdtPools = getUsdtPools(pools, usdtAsset?.contractAddress ?? null);

    const tonFromAsset = assets.find((a) => isTonSymbol(a.symbol));
    const tonPriceUsd =
      tonAsset?.dexPriceUsd ||
      tonFromAsset?.dexPriceUsd ||
      parseNum(assets.find((a) => a.symbol === "TON")?.dexPriceUsd);

    return {
      tonPriceUsd,
      usdtAssetAddress: usdtAsset?.contractAddress ?? null,
      tonUsdtPools: tonUsdtPools.sort((a, b) => b.apy1d - a.apy1d),
      usdtPools: usdtPools.sort((a, b) => b.tvlUsd - a.tvlUsd),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    // fail-soft — empty snapshot, hold opportunity
    return { ...EMPTY_SNAPSHOT, fetchedAt: new Date().toISOString() };
  }
}

export function pickBestPool(
  pools: StonFiMarketPool[],
  preferTonPair = true
): StonFiMarketPool | null {
  if (pools.length === 0) return null;

  const scored = pools.map((p) => {
    const tvlScore = Math.min(25, Math.log10(Math.max(p.tvlUsd, 1)) * 4);
    const apyScore = Math.min(35, p.apy1d * 4);
    const volScore = Math.min(10, (p.volume24hUsd / Math.max(p.tvlUsd, 1)) * 100);
    const pairBonus = preferTonPair && p.pairLabel.includes("TON") && p.pairLabel.includes("USDT") ? 5 : 0;
    return { pool: p, score: apyScore + tvlScore + volScore + pairBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.pool ?? null;
}

export function formatTvl(tvl: number): string {
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(1)}M`;
  if (tvl >= 1_000) return `$${Math.round(tvl / 1_000)}K`;
  return `$${Math.round(tvl)}`;
}
