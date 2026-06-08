import {
  ACTIONS_CACHE_TTL_MS,
  ACTIONS_FETCH_LIMIT,
  ENABLE_DEBUG_LOGS,
  STABLECOIN_SYMBOLS,
} from "../config";
import type { WalletActivity } from "../types/wallet";
import { MemoryCache } from "./cache";
import { logger } from "./logger";
import {
  buildMetadataIndex,
  getAccountActions,
  getAccountState,
  getJettonMasters,
  getJettonWallets,
  lookupKnownJetton,
  nanotonToTon,
  parseJettonBalance,
  resolveJettonMeta,
  type TonCenterAction,
  type TonCenterActionsResponse,
  type TonCenterAddressMetadata,
  type TonCenterJettonWallet,
} from "./toncenter";
import { getTonUsdRate } from "./tonPrice";
import { isTonCenterPublicFallback } from "./toncenterAuth";

const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
const actionsCache = new MemoryCache<TonCenterActionsResponse>();

export interface RawJettonBalance {
  symbol: string;
  name: string;
  balance: number;
  balanceUsd: number;
  decimals: number;
  jettonAddress: string;
  isStablecoin: boolean;
  isUsdt: boolean;
  metaSource: string;
}

export interface WalletRawData {
  address: string;
  tonBalance: number;
  tonBalanceNanoton: string;
  tonPriceUsd: number;
  jettons: RawJettonBalance[];
  activities: WalletActivity[];
  transactionCount30d: number;
  lastActivityTimestamp: number | null;
  dataSource: "toncenter";
}

function isStablecoinSymbol(symbol: string): boolean {
  const normalized = symbol.toUpperCase();
  if (STABLECOIN_SYMBOLS.has(normalized)) return true;
  return (
    normalized.includes("USDT") ||
    normalized.includes("USDC") ||
    normalized === "USD₮"
  );
}

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatActionType(type: string): string {
  return type
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function mapActionStatus(success: boolean, type: string): WalletActivity["status"] {
  if (!success) return "warning";
  const lower = type.toLowerCase();
  if (lower.includes("transfer")) return "info";
  if (lower.includes("swap")) return "info";
  return "success";
}

function mapTonCenterActions(actions: TonCenterAction[]): WalletActivity[] {
  return actions.slice(0, 10).map((action) => {
    const label = formatActionType(action.type);
    const timestamp = action.trace_end_utime || action.start_utime || 0;

    return {
      id: action.action_id,
      type: label,
      time: formatTimeAgo(timestamp),
      status: mapActionStatus(action.success, action.type),
      timestamp,
    };
  });
}

function estimateJettonUsd(
  balance: number,
  isStablecoin: boolean,
  isUsdt: boolean
): number {
  if (isUsdt || isStablecoin) {
    return balance;
  }
  return 0;
}

function mapJettons(
  wallets: TonCenterJettonWallet[],
  metadataIndex: Map<string, TonCenterAddressMetadata>
): RawJettonBalance[] {
  return wallets
    .map((w) => {
      const meta = resolveJettonMeta(w.jetton, metadataIndex);
      const balance = parseJettonBalance(w.balance, meta.decimals);
      const isStablecoin = meta.isStablecoin || isStablecoinSymbol(meta.symbol);
      const isUsdt = meta.isUsdt;

      const balanceUsd = estimateJettonUsd(balance, isStablecoin, isUsdt);

      return {
        symbol: isUsdt ? "USDT" : meta.symbol,
        name: meta.name,
        balance,
        balanceUsd,
        decimals: meta.decimals,
        jettonAddress: w.jetton,
        isStablecoin,
        isUsdt,
        metaSource: meta.source,
      };
    })
    .filter((j) => j.balance > 0);
}

function actionsCacheKey(address: string): string {
  return `actions:${address.toLowerCase()}`;
}

/** Optional — cached, fail-soft. Portfolio analysis never fails on 429. */
async function fetchActionsOptional(address: string): Promise<TonCenterActionsResponse> {
  const key = actionsCacheKey(address);
  const cached = actionsCache.get(key);
  if (cached) {
    logger.cacheHit(key);
    return cached;
  }

  try {
    const data = await getAccountActions(address, ACTIONS_FETCH_LIMIT, {
      failSoft: true,
    });
    actionsCache.set(key, data, ACTIONS_CACHE_TTL_MS);
    return data;
  } catch (error) {
    // fail-soft — portfolio analysis continues without activity data
    return { actions: [] };
  }
}

async function fetchTonCenterBatch(address: string) {
  // Required: account + jettons (parallel)
  const [account, jettonData] = await Promise.all([
    getAccountState(address),
    getJettonWallets(address),
  ]);

  // Optional: actions (cached, fail-soft, no pipeline failure)
  const actionsData = await fetchActionsOptional(address);

  return { account, jettonData, actionsData };
}

function needsJettonMasters(jettonWallets: TonCenterJettonWallet[]): boolean {
  return jettonWallets.some((w) => !lookupKnownJetton(w.jetton));
}

function logValuationOnce(
  address: string,
  raw: {
    tonBalance: number;
    tonPriceUsd: number;
    tonUsd: number;
    jettons: RawJettonBalance[];
    portfolioTotal: number;
    idleUsdt: number;
  }
): void {
  if (!ENABLE_DEBUG_LOGS) return;

  const usdtJettons = raw.jettons.filter((j) => j.isUsdt);

  logger.info("wallet_analysis_summary", {
    address: address.slice(0, 12),
    ton_usd: raw.tonUsd,
    usdt_usd: usdtJettons.reduce((s, j) => s + j.balanceUsd, 0),
    portfolio_total_usd: raw.portfolioTotal,
    idle_capital_usdt: raw.idleUsdt,
    usdt_positions: usdtJettons.length,
  });
}

export async function fetchWalletRawData(address: string): Promise<WalletRawData> {
  const [{ account, jettonData, actionsData }, tonPriceUsd] = await Promise.all([
    fetchTonCenterBatch(address),
    getTonUsdRate(),
  ]);

  const jettonWallets = jettonData.jetton_wallets ?? [];

  let mastersData: Awaited<ReturnType<typeof getJettonMasters>> = {
    jetton_masters: [],
  };

  if (needsJettonMasters(jettonWallets) && !isTonCenterPublicFallback()) {
    const uniqueMasters = [...new Set(jettonWallets.map((w) => w.jetton))];
    try {
      mastersData = await getJettonMasters(uniqueMasters);
    } catch (error) {
      // fail-soft — USDT resolved via known registry
    }
  }

  const metadataIndex = buildMetadataIndex(
    { ...jettonData.metadata, ...mastersData.metadata },
    { ...jettonData.address_book, ...mastersData.address_book }
  );

  const tonBalance = nanotonToTon(account.balance);
  const tonUsd = tonBalance * tonPriceUsd;

  const activities = mapTonCenterActions(actionsData.actions ?? []);
  const now = Math.floor(Date.now() / 1000);

  const transactionCount30d = (actionsData.actions ?? []).filter(
    (a) => (a.trace_end_utime || a.start_utime || 0) >= now - THIRTY_DAYS_SEC
  ).length;

  const lastActivityTimestamp =
    activities.length > 0 ? activities[0].timestamp : null;

  const jettons = mapJettons(jettonWallets, metadataIndex);

  const usdtUsd = jettons.filter((j) => j.isUsdt).reduce((s, j) => s + j.balanceUsd, 0);
  const portfolioTotal = Math.round((tonUsd + usdtUsd) * 100) / 100;
  const idleUsdt = Math.round(
    jettons
      .filter((j) => j.isUsdt)
      .reduce((s, j) => s + j.balanceUsd, 0) * 100
  ) / 100;

  logValuationOnce(address, {
    tonBalance,
    tonPriceUsd,
    tonUsd: Math.round(tonUsd * 100) / 100,
    jettons,
    portfolioTotal,
    idleUsdt,
  });

  return {
    address,
    tonBalance,
    tonBalanceNanoton: account.balance,
    tonPriceUsd,
    jettons,
    activities,
    transactionCount30d,
    lastActivityTimestamp,
    dataSource: "toncenter",
  };
}
