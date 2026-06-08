import { TON_CENTER_BASE_URL } from "../config";
import { fetchJson } from "./httpClient";

const SOURCE = "toncenter";

// ─── Known jetton masters (mainnet) ───────────────────────────────────────────

export interface KnownJettonMeta {
  symbol: string;
  name: string;
  decimals: number;
  isUsdt: boolean;
  isStablecoin: boolean;
}

/** Canonical registry — keys are lowercase alphanumeric address fragments */
export const KNOWN_JETTONS: Record<string, KnownJettonMeta> = {
  // Tether USD₮ (official)
  eqcxe6mutqjkfngfarotkot1lzbdii1r2jytesh2qvyv0: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    isUsdt: true,
    isStablecoin: true,
  },
  // Legacy / alternate USDT masters seen on-chain
  eqblqsm144dnx8njtkddptgnd7hu7upgritdycwacs1rmh: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    isUsdt: true,
    isStablecoin: true,
  },
};

// ─── Response types ───────────────────────────────────────────────────────────

export interface TonCenterAccount {
  address: string;
  balance: string;
  status: string;
}

export interface TonCenterJettonWallet {
  address: string;
  balance: string;
  jetton: string;
  owner: string;
}

export interface TonCenterTokenInfo {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  type?: string;
  valid?: boolean;
  extra?: Record<string, unknown>;
}

export interface TonCenterAddressMetadata {
  is_indexed?: boolean;
  token_info?: TonCenterTokenInfo[];
}

export interface TonCenterAddressBookRow {
  domain?: string;
  interfaces?: string[];
  user_friendly?: string;
}

export interface TonCenterJettonWalletsResponse {
  jetton_wallets: TonCenterJettonWallet[];
  metadata?: Record<string, TonCenterAddressMetadata>;
  address_book?: Record<string, TonCenterAddressBookRow>;
}

export interface TonCenterJettonMaster {
  address: string;
  admin_address?: string;
  total_supply?: string;
  mintable?: boolean;
  jetton_content?: Record<string, unknown>;
}

export interface TonCenterJettonMastersResponse {
  jetton_masters: TonCenterJettonMaster[];
  metadata?: Record<string, TonCenterAddressMetadata>;
  address_book?: Record<string, TonCenterAddressBookRow>;
}

export interface TonCenterAction {
  action_id: string;
  type: string;
  success: boolean;
  start_utime: number;
  trace_end_utime: number;
  details?: Record<string, unknown> | null;
}

export interface TonCenterActionsResponse {
  actions: TonCenterAction[];
}

export interface TonCenterAccountStatesResponse {
  accounts: TonCenterAccount[];
}

// ─── Address helpers ────────────────────────────────────────────────────────

/** Normalize any TON address form to a lowercase key for registry lookup */
export function normalizeTonAddress(address: string): string {
  return address.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function lookupKnownJetton(address: string): KnownJettonMeta | null {
  const key = normalizeTonAddress(address);
  if (KNOWN_JETTONS[key]) return KNOWN_JETTONS[key];

  for (const [registryKey, meta] of Object.entries(KNOWN_JETTONS)) {
    if (key.includes(registryKey) || registryKey.includes(key)) {
      return meta;
    }
  }
  return null;
}

export function buildMetadataIndex(
  metadata?: Record<string, TonCenterAddressMetadata>,
  addressBook?: Record<string, TonCenterAddressBookRow>
): Map<string, TonCenterAddressMetadata> {
  const index = new Map<string, TonCenterAddressMetadata>();

  for (const [key, value] of Object.entries(metadata ?? {})) {
    index.set(normalizeTonAddress(key), value);
    const friendly = addressBook?.[key]?.user_friendly;
    if (friendly) index.set(normalizeTonAddress(friendly), value);
  }

  for (const [key, row] of Object.entries(addressBook ?? {})) {
    const meta = metadata?.[key];
    if (!meta) continue;
    index.set(normalizeTonAddress(key), meta);
    if (row.user_friendly) {
      index.set(normalizeTonAddress(row.user_friendly), meta);
    }
  }

  return index;
}

export function extractDecimalsFromTokenInfo(info?: TonCenterTokenInfo): number | undefined {
  if (!info?.extra || typeof info.extra !== "object") return undefined;
  const extra = info.extra;
  const raw = extra.decimals ?? extra.Decimals ?? extra.DECIMALS;
  if (typeof raw === "number" && raw >= 0 && raw <= 18) return raw;
  if (typeof raw === "string") {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 18) return parsed;
  }
  return undefined;
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

function buildUrl(path: string, params: Record<string, string | number | string[]>): string {
  const url = new URL(`${TON_CENTER_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function getAccountState(address: string): Promise<TonCenterAccount> {
  const url = buildUrl("/accountStates", { address, include_boc: "false" });
  const data = await fetchJson<TonCenterAccountStatesResponse>(url, {
    source: SOURCE,
    auth: "toncenter",
  });

  const account = data.accounts?.[0];
  if (!account) {
    throw new Error(`Account not found: ${address}`);
  }
  return account;
}

export async function getJettonWallets(
  ownerAddress: string,
  limit = 100
): Promise<TonCenterJettonWalletsResponse> {
  const url = buildUrl("/jetton/wallets", {
    owner_address: ownerAddress,
    limit,
    sort: "desc",
  });

  return fetchJson<TonCenterJettonWalletsResponse>(url, {
    source: SOURCE,
    auth: "toncenter",
  });
}

export async function getJettonMasters(
  addresses: string[]
): Promise<TonCenterJettonMastersResponse> {
  if (addresses.length === 0) {
    return { jetton_masters: [] };
  }

  const url = buildUrl("/jetton/masters", {
    address: addresses.slice(0, 100),
    limit: Math.min(addresses.length, 100),
  });

  return fetchJson<TonCenterJettonMastersResponse>(url, {
    source: SOURCE,
    auth: "toncenter",
  });
}

export async function getAccountActions(
  account: string,
  limit = 10,
  options?: { failSoft?: boolean }
): Promise<TonCenterActionsResponse> {
  const url = buildUrl("/actions", {
    account,
    limit,
    sort: "desc",
  });

  const data = await fetchJson<TonCenterActionsResponse | null>(url, {
    source: SOURCE,
    auth: "toncenter",
    maxRetries: 1,
    failSoft: options?.failSoft ?? false,
  });

  if (!data) {
    return { actions: [] };
  }
  return data;
}

export function nanotonToTon(nanotons: string | number): number {
  const raw =
    typeof nanotons === "string" ? BigInt(nanotons) : BigInt(Math.trunc(nanotons));
  return Number(raw) / 1e9;
}

export function parseJettonBalance(balance: string, decimals: number): number {
  const raw = BigInt(balance);
  const divisor = BigInt(10 ** decimals);
  return Number(raw) / Number(divisor);
}

export interface ResolvedJettonMeta {
  symbol: string;
  name: string;
  decimals: number;
  isUsdt: boolean;
  isStablecoin: boolean;
  source: "known_registry" | "metadata" | "inferred";
}

export function resolveJettonMeta(
  jettonAddress: string,
  metadataIndex: Map<string, TonCenterAddressMetadata>
): ResolvedJettonMeta {
  const known = lookupKnownJetton(jettonAddress);
  if (known) {
    return { ...known, source: "known_registry" };
  }

  const meta = metadataIndex.get(normalizeTonAddress(jettonAddress));
  const tokenInfo = meta?.token_info?.find((t) => t.valid !== false) ?? meta?.token_info?.[0];

  const symbol = (tokenInfo?.symbol ?? "").trim();
  const name = (tokenInfo?.name ?? "").trim();
  const upper = symbol.toUpperCase();
  const nameLower = name.toLowerCase();

  const inferredUsdt =
    upper === "USDT" ||
    upper === "USD₮" ||
    upper.includes("USDT") ||
    nameLower.includes("tether") ||
    nameLower.includes("usdt");

  const inferredStable =
    inferredUsdt ||
    upper.includes("USDC") ||
    nameLower.includes("usd coin") ||
    nameLower.includes("stablecoin");

  let decimals = extractDecimalsFromTokenInfo(tokenInfo);
  if (decimals === undefined) {
    decimals = inferredStable ? 6 : 9;
  }

  return {
    symbol: symbol || (inferredUsdt ? "USDT" : "JETTON"),
    name: name || (inferredUsdt ? "Tether USD" : "Unknown Jetton"),
    decimals,
    isUsdt: inferredUsdt,
    isStablecoin: inferredStable,
    source: tokenInfo ? "metadata" : "inferred",
  };
}
