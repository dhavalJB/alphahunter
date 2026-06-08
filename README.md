# AlphaHunter

**Discover Alpha Across TON**

AI-powered portfolio intelligence and opportunity discovery for TON users. Bloomberg Terminal meets AI financial copilot — not a wallet explorer.

## API Data Layer

| Source | Used For | Auth |
|--------|----------|------|
| **TON Center v3** (primary) | Balance, jettons, decoded actions | `X-API-Key` → `TON_API_KEY` |
| **CoinGecko** | TON/USD price (global, cached 5 min) | None |
| **CoinGecko** | TON/USD price only | None |

**Per wallet (with key):** 3 TON Center requests (parallel)  
**Per wallet (no key):** 3 sequential (~1 req/sec) to avoid 429  
**Repeat requests:** 0 API calls — 5 min in-memory cache + in-flight dedup

## Updated Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js + TON Connect)                  │
│                                                                       │
│  Connect Wallet → AI Portfolio Report (hero) → Mira Workflow Panel   │
│                → Factor Breakdown → Opportunity Feed                  │
│                → Opportunity Detail → Execution Card → Route Preview  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST
┌───────────────────────────────▼──────────────────────────────────────┐
│                      Backend (Express + TypeScript)                   │
│                                                                       │
│  TON Center ──► walletData ──► walletPipeline (cache) ──► Snapshot   │
│                    │                                                  │
│    ┌───────────────┼───────────────┬──────────────┬─────────────┐    │
│    ▼               ▼               ▼              ▼             ▼    │
│ alphaScore   capitalEfficiency  missedYield  walletProfile  riskScore│
│    │               │               │              │             │    │
│    └───────────────┴───────────────┴──────────────┴─────────────┘    │
│                    │                                                  │
│         opportunities ──► stonfi (route preview layer)               │
│         miraReport ──► mira (Telegram workflow, no API)                │
└──────────────────────────────────────────────────────────────────────┘

Mira Track Workflow:
  AlphaHunter → Generate Report → Copy → Open Mira (Telegram) → Discuss
```

## Folder Structure

```
AlphaHunter/
├── README.md
├── frontend/
│   ├── app/                         # /, /dashboard, /opportunities/[id]
│   ├── components/
│   │   ├── PortfolioReportHero.tsx  # AI Portfolio Report (main hero)
│   │   ├── MiraWorkflowPanel.tsx    # Ask Mira / Export / Open in Mira
│   │   ├── ExecutionCard.tsx        # STON.fi execution recommendation
│   │   ├── RoutePreviewPanel.tsx    # Omniston route preview
│   │   ├── FactorBreakdown.tsx
│   │   ├── OpportunityCard.tsx
│   │   └── ...
│   └── lib/
│       ├── api.ts
│       ├── mira-workflow.ts         # Clipboard + Telegram deep link
│       ├── types.ts
│       └── wallet-context.tsx
└── backend/src/
    ├── engines/
    │   ├── alphaScore.ts
    │   ├── capitalEfficiency.ts
    │   ├── missedYield.ts
    │   ├── walletProfile.ts         # + Liquidity Provider
    │   ├── riskScore.ts
    │   └── opportunities.ts         # + Treasury Optimization
    ├── services/
    │   ├── toncenter.ts             # Sole blockchain provider
    │   ├── portfolioMetrics.ts      # + idle duration
    │   ├── miraReport.ts            # NEW — structured report
    │   ├── mira.ts                  # Telegram workflow
    │   └── stonfi.ts                # Execution readiness layer
    └── routes/
        ├── analyze.ts
        ├── opportunities.ts
        ├── route.ts
        ├── mira.ts                  # POST /api/mira-analysis
        └── miraReport.ts            # POST /api/mira-report
```

## New Services

| Service | File | Purpose |
|---------|------|---------|
| `miraReport` | `services/miraReport.ts` | Builds structured AlphaHunter portfolio report |
| `mira` | `services/mira.ts` | Telegram-native Mira workflow (no API) |
| `stonfi` | `services/stonfi.ts` | Route templates + execution readiness |
| `portfolioMetrics` | `services/portfolioMetrics.ts` | Idle capital + idle duration |

## New APIs

| Method | Path | Returns |
|--------|------|---------|
| POST | `/analyze-wallet` | Full intelligence + `idleDurationDays` |
| POST | `/opportunities` | Opportunities with `recommendedAction` |
| POST | `/route` | STON.fi route preview + execution readiness |
| POST | `/api/mira-analysis` | Mira workflow payload + report + Telegram URL |
| POST | `/api/mira-report` | Structured `AlphaHunterReport` + export text |

## Environment Variables

### Backend
```
PORT=4000
CORS_ORIGIN=http://localhost:3000
TON_CENTER_BASE_URL=https://toncenter.com/api/v3
TON_API_KEY=                    # TON Center X-API-Key (required for production)
TON_API_KEY=                    # Required for reliable TON Center access
CACHE_TTL_MS=300000
MIRA_TELEGRAM_URL=https://t.me/mira
```

### Frontend
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_MIRA_TELEGRAM_URL=https://t.me/mira
```

## Intelligence Outputs

| Output | Range / Type | Engine |
|--------|--------------|--------|
| Alpha Score | 0–100 | `alphaScore.ts` |
| Capital Efficiency | 0–100 | `capitalEfficiency.ts` |
| Risk Score | 0–100 + Low/Med/High | `riskScore.ts` |
| Wallet Profile | 5 types | `walletProfile.ts` |
| Idle Capital | USD | `portfolioMetrics.ts` |
| Idle Duration | days | `portfolioMetrics.ts` |
| Missed Yield | $0.82 – $4.55 est. | `missedYield.ts` |
| Opportunities | Rule-based feed | `opportunities.ts` |

### Wallet Profiles
- Passive Holder
- Stablecoin Treasury
- Active Trader
- Yield Seeker
- Liquidity Provider

## Remaining STON.fi Tasks

1. Integrate Omniston SDK for live pool quotes
2. Wire `POST /route` to real swap/deposit transaction builders
3. Connect TON Connect `sendTransaction` for execution
4. Add slippage tolerance UI and confirmation modal
5. Set `readiness.omnistonReady = true` when SDK connected

**Integration point:** `backend/src/services/stonfi.ts` → `buildStonFiRoute()`

## Remaining Mira Tasks

Mira has **no public API**. The hackathon workflow is complete:

1. ✅ Generate structured AlphaHunter report
2. ✅ Export to clipboard
3. ✅ Open Mira on Telegram
4. ✅ Ask Mira with pre-built prompt

**Optional enhancements:**
- Deep link with `?t=start` if Mira bot supports report ingestion
- Telegram Mini App `openTelegramLink()` when deployed as TMA
- Auto-format report as Telegram-friendly markdown

**Integration point:** `backend/src/services/miraReport.ts` + `frontend/lib/mira-workflow.ts`

## Deployment Readiness Checklist

### Backend
- [ ] Set `TON_API_KEY` on production host
- [ ] Set `CORS_ORIGIN` to frontend domain
- [ ] Deploy Express (Railway, Render, Fly.io)
- [ ] Verify `/health` responds
- [ ] Test `/analyze-wallet` with real wallet

### Frontend
- [ ] Set `NEXT_PUBLIC_API_URL` to backend URL
- [ ] Set `NEXT_PUBLIC_MIRA_TELEGRAM_URL` to official Mira bot
- [ ] Deploy Next.js (Vercel, Netlify)
- [ ] Host valid `tonconnect-manifest.json` with production URL
- [ ] Update manifest in `AppProviders.tsx`

### TON Connect
- [ ] Manifest `url` matches deployed frontend
- [ ] `iconUrl` accessible over HTTPS
- [ ] Test connect/disconnect on mobile Telegram

### Hackathon Demo Flow
1. Connect wallet on landing
2. Dashboard loads AI Portfolio Report with real data
3. Show Alpha Score, Capital Efficiency, Risk, Idle Capital, Missed Yield
4. Tap "Open in Mira" → report copies → Telegram opens
5. Browse Opportunity Feed → tap opportunity
6. View Execution Card + Route Preview
7. Explain STON.fi Omniston as next step

## Run Locally

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Open http://localhost:3000
