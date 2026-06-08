# AlphaHunter Performance Audit

Generated as part of the performance remediation sprint. No new features were added.

## Executive Summary

AlphaHunter was slow primarily because **one wallet connect triggered 4 sequential/parallel HTTP requests**, each invoking the full wallet intelligence pipeline (TonCenter + STON.fi + scoring). STON.fi timeouts (15s × retries) amplified latency.

**Fix applied:** Single `POST /wallet-intelligence` endpoint + tiered caching + frontend batch state update.

| Metric | Before | After |
|--------|--------|-------|
| HTTP requests on connect | 4 | **1** |
| TonCenter calls per connect (cold) | 3–4 (deduped across parallel endpoints) | **3–4 once** |
| STON.fi calls per connect (cold) | 2 (deduped) | **2 once** (5min global cache) |
| React state updates on connect | ~7 separate `setState` | **1 reducer dispatch** |
| Wallet analysis cache TTL | 5 min (monolithic) | **1 min** |
| Opportunity rankings TTL | 5 min (bundled) | **2 min** (separate layer) |

---

## 1. All API Calls Identified

### Frontend → Backend (on wallet connect)

| Before | Endpoint | Purpose |
|--------|----------|---------|
| ~~Parallel~~ | `POST /analyze-wallet` | Portfolio + scores |
| ~~Parallel~~ | `POST /opportunities` | Ranked opportunities |
| ~~Sequential~~ | `POST /api/mira-report` | Portfolio report |
| ~~Sequential~~ | `POST /api/mira-analysis` | Mira explain brief |
| **Now** | `POST /wallet-intelligence` | **All of the above** |

### On-demand (unchanged)

| Endpoint | Trigger |
|----------|---------|
| `POST /route` | Route preview page or manual button |
| `GET /health` | Health check |
| `GET /health/performance` | Performance metrics report |

### Backend → External

| Provider | Calls | Cached |
|----------|-------|--------|
| TonCenter | `accountStates`, `jetton/wallets`, `actions`, optional `jetton/masters` | **1 min** (via wallet analysis cache) |
| CoinGecko | TON/USD price | 5 min |
| STON.fi | `/v1/assets`, `/v1/pools` | **5 min** (global) |

---

## 2. Logging Added

### HTTP endpoint middleware (`middleware/requestPerf.ts`)

Logs per request:
- **Request count** — aggregated per `METHOD path`
- **Request duration** — avg and max ms
- **Duplicate requests** — same wallet + endpoint within 5 seconds

View live report: `GET http://localhost:4000/health/performance`

### External API (`services/httpClient.ts`)

Logs per outbound call:
- Source (`toncenter`, `stonfi`, `coingecko`)
- Path
- Duration ms
- Error flag

### Pipeline (`services/walletPipeline.ts` + `perfMetrics.ts`)

- Pipeline run count, avg/max duration
- Cache hit rate (analysis + opportunities layers)

---

## 3. Duplicate Work Identified

### Repeated TonCenter calls
- **Cause:** 4 frontend endpoints each called `getWalletIntelligence()` on connect
- **Mitigation:** In-flight dedupe existed but still paid HTTP overhead; now **1 request**

### Repeated STON.fi calls
- **Cause:** Every cold pipeline fetched assets + pools; slow API (timeouts up to 45s+)
- **Mitigation:** Global 5min cache unchanged; now fetched **once per connect** not 4×

### Repeated portfolio calculations
- **Cause:** `runAnalysis()` + `scanOpportunities()` ran on every endpoint hit
- **Mitigation:** Tiered cache — analysis 1min, rankings 2min; rankings reuse cached snapshot

### Repeated Mira generation
- **Cause:** `mira-report` + `mira-analysis` both rebuilt reports
- **Mitigation:** Single `generateMiraWorkflow()` in unified endpoint

---

## 4. React Component Issues

| Component | Issue | Fix |
|-----------|-------|-----|
| `wallet-context.tsx` | 4 API calls, ~7 `setState` per connect | `fetchWalletIntelligence` + `useReducer` |
| `wallet-context.tsx` | New context object every render | `useMemo` on context value |
| `OpportunityDetailView` | Refetched Mira on every mount | Uses context `miraInsights` |
| `DashboardView` | Re-renders on each context update | Reduced updates via reducer |
| All `useWallet()` consumers | No `React.memo` | Fewer updates = fewer re-renders |

**No infinite render loops found.** `useEffect` in wallet context correctly guards with `lastAnalyzedRef`.

**Strict Mode (dev):** May double-mount `WalletProvider`; `analyzingRef` prevents duplicate in-flight analysis.

---

## 5. Caching Configuration

| Layer | TTL | Env var | Default |
|-------|-----|---------|---------|
| Wallet analysis (TonCenter + scores) | 1 min | `WALLET_ANALYSIS_CACHE_TTL_MS` | 60000 |
| Opportunity rankings | 2 min | `OPPORTUNITY_RANKINGS_CACHE_TTL_MS` | 120000 |
| STON.fi market data | 5 min | `STONFI_CACHE_TTL_MS` | 300000 |
| TON/USD price (CoinGecko) | 5 min | hardcoded | 300000 |

When wallet analysis cache expires, opportunity rankings for that wallet are invalidated.

---

## 6. Slowest Endpoints (expected before fix)

| Endpoint | Why slow |
|----------|----------|
| `POST /analyze-wallet` | TonCenter ×3 + CoinGecko + STON.fi ×2 + scoring |
| `POST /opportunities` | Same pipeline (duplicate HTTP) |
| `POST /api/mira-report` | Pipeline + report build |
| `POST /api/mira-analysis` | Pipeline + Mira workflow |
| `POST /route` | Pipeline lookup (cheap if cached) |

**After fix:** `POST /wallet-intelligence` is the only slow path on connect.

---

## 7. Slowest External APIs

| API | Typical bottleneck |
|-----|-------------------|
| STON.fi `/v1/pools` | Large payload, network timeouts |
| STON.fi `/v1/assets` | Large payload |
| TonCenter `/jetton/wallets` | Per-wallet |
| TonCenter `/actions` | Per-wallet |
| CoinGecko | Usually fast; 5min cache |

---

## 8. Recommended Fixes (implemented)

- [x] Unified `POST /wallet-intelligence` endpoint
- [x] Frontend single fetch on connect
- [x] Tiered TTL caching (1min / 2min / 5min)
- [x] Performance metrics at `/health/performance`
- [x] Remove duplicate Mira fetch on opportunity detail
- [x] Batch React state with `useReducer` + `useMemo`

## 9. Future optimizations (not implemented)

- Add TonCenter response cache per wallet (currently tied to 1min analysis bundle)
- Client-side route cache to avoid repeat `/route` calls
- `React.memo` on heavy list items (`OpportunityCard`)
- Reduce STON.fi payload (`limit` tuning) if API supports filtering
- STON.fi timeout fallback faster (skip retries when markets unreachable)

---

## Monitoring

After connecting a wallet, check:

```bash
curl http://localhost:4000/health/performance
```

Look for:
- `duplicateRequests` → should trend to 0
- `slowestExternalApis` → STON.fi avg ms
- `pipelineCacheHitRate` → should rise on repeat visits within TTL
