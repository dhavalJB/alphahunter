import {
  HTTP_MAX_RETRIES,
  HTTP_TIMEOUT_MS,
} from "../config";
import { ApiError, RateLimitError } from "./apiErrors";
import { logger } from "./logger";
import { perfMetrics } from "./perfMetrics";
import {
  enableTonCenterPublicFallback,
  isInvalidApiKeyResponse,
  logTonCenterRequestAudit,
  resolveTonCenterAuth,
  type TonCenterAuthMethod,
} from "./toncenterAuth";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchOptions {
  source: string;
  headers?: Record<string, string>;
  auth?: "toncenter" | "none";
  maxRetries?: number;
  failSoft?: boolean;
  method?: "GET" | "POST";
}

function logExternalError(
  source: string,
  path: string,
  durationMs: number,
  status: number,
  reason: string
): void {
  perfMetrics.recordExternal(source, path, durationMs, true);
  logger.externalError(source, path, durationMs, status, reason);
}

function logExternalSuccess(
  source: string,
  path: string,
  durationMs: number
): void {
  perfMetrics.recordExternal(source, path, durationMs, false);
  logger.externalRequest(source, path, durationMs);
}

export async function fetchJson<T>(
  url: string,
  options: FetchOptions
): Promise<T> {
  const {
    source,
    headers: extraHeaders = {},
    auth = "none",
    maxRetries = HTTP_MAX_RETRIES,
    failSoft = false,
    method = "GET",
  } = options;

  let lastError: Error | null = null;
  const path = new URL(url).pathname;
  let toncenterAuthOverride: TonCenterAuthMethod | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const requestStart = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    let requestUrl = url;
    let requestHeaders: Record<string, string> = {
      Accept: "application/json",
      ...extraHeaders,
    };

    if (auth === "toncenter") {
      const resolved = resolveTonCenterAuth(url, toncenterAuthOverride);
      requestUrl = resolved.url;
      requestHeaders = { ...requestHeaders, ...resolved.headers };
      logTonCenterRequestAudit(
        requestUrl,
        resolved.authMethod,
        resolved.headerNames,
        resolved.keyPreview
      );
    }

    try {
      const response = await fetch(requestUrl, {
        method,
        headers: requestHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const elapsed = Date.now() - requestStart;

      if (response.status === 429) {
        logExternalError(source, path, elapsed, 429, "rate_limit");
        if (attempt < maxRetries - 1) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
        if (failSoft) return null as T;
        throw new RateLimitError(source);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logExternalError(
          source,
          path,
          elapsed,
          response.status,
          body.slice(0, 120) || response.statusText
        );

        // Hackathon fallback: invalid API key → retry this request without auth
        if (
          auth === "toncenter" &&
          isInvalidApiKeyResponse(response.status, body) &&
          toncenterAuthOverride !== "public"
        ) {
          enableTonCenterPublicFallback("401 API key does not exist");
          toncenterAuthOverride = "public";
          continue;
        }

        const retryable = response.status >= 500;
        if (retryable && attempt < maxRetries - 1) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
        if (failSoft) return null as T;
        throw new ApiError(
          body || response.statusText,
          response.status,
          source,
          retryable
        );
      }

      const text = await response.text();
      if (!text.trim()) {
        logExternalError(source, path, elapsed, response.status, "empty_body");
        if (failSoft) return null as T;
        throw new ApiError("Empty response body", response.status, source, false);
      }

      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        logExternalError(source, path, elapsed, response.status, "invalid_json");
        if (failSoft) return null as T;
        throw new ApiError("Invalid JSON response", response.status, source, false);
      }

      logExternalSuccess(source, path, elapsed);
      return data;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof RateLimitError || error instanceof ApiError) {
        if (failSoft) return null as T;
        throw error;
      }

      const elapsed = Date.now() - requestStart;
      const reason =
        error instanceof Error ? error.name + ": " + error.message : "unknown";
      logExternalError(source, path, elapsed, 0, reason);

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  if (failSoft) return null as T;
  throw lastError ?? new ApiError("Request failed", 500, options.source, true);
}
