import { getTonApiKey, isTonApiKeyLoaded, TON_CENTER_BASE_URL } from "../config";
import { logger } from "./logger";

export type TonCenterAuthMethod =
  | "X-API-Key"
  | "api_key_query"
  | "public"
  | "none";

/** After 401 invalid-key, switch to public access for all subsequent requests */
let usePublicFallback = false;

export function isTonCenterPublicFallback(): boolean {
  return usePublicFallback;
}

export function enableTonCenterPublicFallback(reason: string): void {
  if (!usePublicFallback) {
    usePublicFallback = true;
    logger.warn("toncenter_auth_fallback", {
      reason,
      mode: "public",
      note: "Invalid API key disabled — using unauthenticated access (1 req/s)",
    });
  }
}

export function getTonApiKeyPreview(): string {
  const key = getTonApiKey();
  return key.length >= 4 ? `${key.slice(0, 4)}…` : "none";
}

export function resolveTonCenterAuth(
  url: string,
  forceMethod?: TonCenterAuthMethod
): {
  url: string;
  headers: Record<string, string>;
  authMethod: TonCenterAuthMethod;
  keyPreview: string;
  headerNames: string[];
} {
  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
  };

  const key = getTonApiKey();
  const keyPreview = getTonApiKeyPreview();

  if (forceMethod === "public" || forceMethod === "none") {
    return {
      url,
      headers: baseHeaders,
      authMethod: "public",
      keyPreview: "none",
      headerNames: Object.keys(baseHeaders),
    };
  }

  if (forceMethod === "api_key_query" && key) {
    const parsed = new URL(url);
    parsed.searchParams.set("api_key", key);
    return {
      url: parsed.toString(),
      headers: baseHeaders,
      authMethod: "api_key_query",
      keyPreview,
      headerNames: Object.keys(baseHeaders),
    };
  }

  if (usePublicFallback || !key) {
    return {
      url,
      headers: baseHeaders,
      authMethod: "public",
      keyPreview: "none",
      headerNames: Object.keys(baseHeaders),
    };
  }

  if (forceMethod === "X-API-Key" || !forceMethod) {
    return {
      url,
      headers: { ...baseHeaders, "X-API-Key": key },
      authMethod: "X-API-Key",
      keyPreview,
      headerNames: Object.keys({ ...baseHeaders, "X-API-Key": key }),
    };
  }

  return {
    url,
    headers: baseHeaders,
    authMethod: "public",
    keyPreview: "none",
    headerNames: Object.keys(baseHeaders),
  };
}

export function isInvalidApiKeyResponse(status: number, body: string): boolean {
  if (status !== 401) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("api key does not exist") ||
    lower.includes("api_key does not exist") ||
    lower.includes('"code":401')
  );
}

export function logTonCenterRequestAudit(
  url: string,
  authMethod: TonCenterAuthMethod,
  headerNames: string[],
  keyPreview: string
): void {
  const parsed = new URL(url);
  // Never log api_key query value
  parsed.searchParams.delete("api_key");

  logger.info("toncenter_request_audit", {
    requestUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
    baseUrl: TON_CENTER_BASE_URL,
    authMethod,
    headerNames,
    keyPreview,
    publicFallback: usePublicFallback,
    keyLoaded: isTonApiKeyLoaded() ? "YES" : "NO",
  });
}

export interface TonCenterAuthProbeResult {
  authMethod: TonCenterAuthMethod;
  status: number;
  ok: boolean;
  bodyPreview: string;
  durationMs: number;
  headerNames: string[];
  requestUrl: string;
  keyPreview: string;
}

/** Raw probe for /debug/toncenter — does not mutate fallback state */
export async function probeTonCenterAuth(
  testUrl: string,
  method: TonCenterAuthMethod
): Promise<TonCenterAuthProbeResult> {
  const { url, headers, authMethod, keyPreview, headerNames } =
    resolveTonCenterAuth(testUrl, method === "public" ? "public" : method);

  const start = Date.now();
  const response = await fetch(url, { headers });
  const body = await response.text().catch(() => "");
  const parsed = new URL(url);
  parsed.searchParams.delete("api_key");

  return {
    authMethod,
    status: response.status,
    ok: response.ok,
    bodyPreview: body.slice(0, 300),
    durationMs: Date.now() - start,
    headerNames,
    requestUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
    keyPreview,
  };
}

export function getTonCenterAuthDiagnostics() {
  return {
    baseUrl: TON_CENTER_BASE_URL,
    keyLoaded: isTonApiKeyLoaded() ? "YES" : "NO",
    keyPreview: getTonApiKeyPreview(),
    activeAuthMethod: usePublicFallback ? "public" : isTonApiKeyLoaded() ? "X-API-Key" : "public",
    publicFallbackActive: usePublicFallback,
    documentedMethods: ["X-API-Key (header)", "api_key (query param)", "public (no auth)"],
    error401Meaning: "API key does not exist — key is invalid, revoked, or never registered with @toncenter bot",
    error403Meaning: "Network not allowed — testnet key used on mainnet or vice versa",
  };
}
