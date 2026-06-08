# AlphaHunter Emergency Performance Report

## Root Cause: TON API Key Not Used

**Bug:** `TON_API_KEY` was read in `config.ts` at **module load time**, before `dotenv.config()` ran in `app.ts`. The key was always `""` at runtime even when `.env` contained a valid key.

**Symptoms:**
- Log: `toncenter_sequential` / `reason: no_api_key_free_tier`
- No `X-API-Key` header on TonCenter requests
- Higher 429 rate on free tier

**Fix:**
1. `src/loadEnv.ts` — loads `.env` as **first import** in `app.ts`
2. `getTonApiKey()` — reads `process.env.TON_API_KEY` at **request time**
3. Startup log: `TON API Key Loaded: YES / NO` (never exposes full key)

---

## Optimizations Applied

### TonCenter (Hackathon Mode)

| Change | Before | After |
|--------|--------|-------|
| API key header | Missing (stale empty constant) | `X-API-Key` from `getTonApiKey()` |
| Required calls | account + jettons + actions (blocking) | account + jettons (parallel) |
| Actions | limit 30, 3 retries, blocks on 429 | limit 10, 1 retry, **fail-soft** |
| Actions cache | none | 5 min per wallet |
| Jetton masters | always fetched | skipped if known USDT registry hit |

### STON.fi

| Change | Before | After |
|--------|--------|-------|
| Assets TTL | 5 min | **10 min** global |
| Assets limit | 500 | 100 |
| Pools limit | 500 | 200 |
| Retries | 3 | 1 + fail-soft |
| Failure | could throw | empty snapshot → Hold opportunity |

### Logging

| Removed | Kept |
|---------|------|
| `portfolio_value_debug` (every `getPrimaryPortfolioValue` call) | `wallet_analysis_summary` once per fetch (if `ENABLE_DEBUG_LOGS=true`) |
| `idle_capital_debug` | `toncenter_batch_complete` |
| `valuation_debug_report` verbose dump | `startup_diagnostics` |

---

## Performance Mode Request Budget

**One cold wallet analysis:**

```
TonCenter (parallel, with API key):
  ✓ GET /accountStates
  ✓ GET /jetton/wallets
  ○ GET /actions (optional, cached, fail-soft)
  ○ GET /jetton/masters (only if unknown jettons)

CoinGecko:
  ✓ TON/USD (5min global cache)

STON.fi (global cache, 10min):
  ○ GET /v1/assets (once per 10min)
  ○ GET /v1/pools (once per 10min)
```

**Warm cache (same wallet < 1min):** 0 TonCenter calls

**Target:** < 2 seconds with API key + warm STON.fi cache

---

## Failsafe Guarantees

| Failure | Behavior |
|---------|----------|
| Actions 429/timeout | Empty activities; idle duration defaults safely |
| STON.fi unavailable | "Maintain Current Allocation" opportunity |
| Jetton masters fail | USDT from known registry (6 decimals) |
| CoinGecko fail | TON price fallback $5 |

**Always works:** Portfolio Value, USDT Balance, Idle Capital, Mira Export

---

## Verification

```bash
# Restart backend — must show:
# {"event":"TON API Key Loaded","value":"YES"}

curl http://localhost:4000/health
# tonApiKeyLoaded: "YES"

curl http://localhost:4000/health/performance
```

Connect wallet → Network tab should show **1** `POST /wallet-intelligence`

---

## Final Error Audit (Logging Fix)

### Fake errors — FIXED

**Cause:** `httpClient` logged `perf_external` immediately after `fetch()` returned, then threw `ApiError` for non-OK HTTP status. The `catch` block logged a second `perf_external` with `error: true` for the same request.

**Symptom:** Pairs like `durationMs: 221` (success) + `durationMs: 222, error: true` (duplicate).

**Fix:** Success logged only after validated JSON parse. `ApiError`/`RateLimitError` no longer double-log in `catch`. Renamed events:
- `external_request` — successful outbound call
- `external_error` — actual failure (with `status` + `reason`)

### Log surface (production)

| Kept | Removed |
|------|---------|
| `pipeline_start` | `perf_external`, `api_request`, `perf_request` |
| `pipeline_complete` | `cache_set`, `api_retry`, `rate_limit_detected` |
| `cache_hit` / `cache_miss` | `portfolio_value_debug`, `idle_capital_debug` |
| `external_request` | `toncenter_batch_complete`, `opportunity_scan_complete` |
| `external_error` | `idle_duration_debug`, `stonfi_market_loaded` |

---

## Remaining Risks

1. **Cold STON.fi fetch** — first request after 10min TTL may add 1–5s if API slow; subsequent wallets reuse cache
2. **Actions still called once per wallet** — cached 5min; does not block on failure
3. **Production start** — ensure `loadEnv` runs (`node dist/app.js` from `backend/` directory so `.env` resolves)
