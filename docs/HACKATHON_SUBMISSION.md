# AlphaHunter — Hackathon Submission Guide

**AlphaHunter** · AI Opportunity Intelligence for TON

---

## 1. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     TON Connect (Frontend)                       │
│  Hero → Connect → POST /wallet-intelligence (single request)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   Express API (Backend)                          │
│  walletPipeline                                                  │
│    ├─ TonCenter (account, jettons, actions)  [cache 1 min]      │
│    ├─ CoinGecko (TON price)                  [cache 5 min]      │
│    ├─ Portfolio analysis (TON + USDT only)                      │
│    ├─ Idle capital + capital efficiency + opportunity cost      │
│    ├─ scanOpportunities → STON.fi APY/TVL  [cache 2 min opps] │
│    └─ generateMiraWorkflow (verify payload + export report)     │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   Dashboard Hero      Mira Verification    STON.fi Route
   Top 3 Opportunities  /verify payload      Preview + redirect
```

### Product Flow

1. **Connect Wallet** — TON Connect
2. **Analyze Portfolio** — TON + USDT valuation via TonCenter
3. **Detect Idle Capital** — Undeployed USDT, duration, efficiency, opportunity cost
4. **Find Best Opportunity** — Live STON.fi data, deterministic ranking
5. **Generate AI Report** — Local portfolio report (no Mira API)
6. **Verify With Mira** — Copy `/verify` payload → paste in Telegram
7. **Execute Through STON.fi** — Route preview + open app.ston.fi

### Key Files

| Layer | Path |
|-------|------|
| Unified API | `backend/src/routes/walletIntelligence.ts` |
| Pipeline | `backend/src/services/walletPipeline.ts` |
| Opportunities | `backend/src/engines/opportunities.ts` |
| STON.fi market | `backend/src/services/stonfiMarket.ts` |
| Mira verify | `backend/src/services/miraExplain.ts` |
| Frontend state | `frontend/lib/wallet-context.tsx` |
| Dashboard | `frontend/components/DashboardView.tsx` |
| Mira UI | `frontend/components/MiraWorkflowPanel.tsx` |

---

## 2. Remaining Bugs / Known Limitations

| Issue | Severity | Notes |
|-------|----------|-------|
| STON.fi API may timeout | Medium | Falls back to "Maintain Current Allocation"; verify network in demo env |
| Omniston not integrated | Low | Route preview + STON.fi redirect — acceptable per spec |
| Missed yield uses 4–8% when STON.fi unavailable | Low | `opportunityCost` uses live APY when STON.fi works |
| TON Connect manifest URL | Medium | Update `AppProviders.tsx` manifest to production URL before deploy |
| React Strict Mode (dev) | Low | May double-mount; `analyzingRef` guards in-flight |
| Route page triggers second API call | Low | `/route` endpoint; usually cache hit |
| No persistent database | N/A | In-memory cache only — by design |

---

## 3. Deployment Checklist

### Backend (`backend/`)

- [ ] Set `TON_API_KEY` (TonCenter rate limits without key)
- [ ] Set `CORS_ORIGIN` to production frontend URL
- [ ] Set `STONFI_API_URL=https://api.ston.fi`
- [ ] Set `MIRA_TELEGRAM_URL=https://t.me/mira`
- [ ] Deploy to Railway/Render/Fly — expose port 4000
- [ ] Verify `GET /health` returns OK
- [ ] Verify `GET /health/performance` accessible

### Frontend (`frontend/`)

- [ ] Set `NEXT_PUBLIC_API_URL` to production backend URL
- [ ] Set `NEXT_PUBLIC_MIRA_TELEGRAM_URL=https://t.me/mira`
- [ ] Set `NEXT_PUBLIC_STONFI_APP_URL=https://app.ston.fi`
- [ ] Update TON Connect manifest URL in `components/providers/AppProviders.tsx`
- [ ] Deploy to Vercel/Netlify
- [ ] Test wallet connect on mobile viewport (430px)

### Environment Template

See `backend/.env.example` for all variables.

---

## 4. Demo Checklist (5-minute judge demo)

### Setup (30 sec)
- [ ] Backend running, frontend open on mobile-sized window
- [ ] Test wallet with TON + USDT balance ready

### Flow (4 min)

1. **Landing** — Show tagline "AI Opportunity Intelligence for TON"
2. **Connect** — TON Connect wallet
3. **Dashboard loads** — Single analysis request (watch Network tab: 1 call to `/wallet-intelligence`)
4. **Portfolio** — Point out Portfolio Value = TON + USDT only
5. **Idle Capital** — Show idle USDT amount and duration
6. **Capital Efficiency + Opportunity Cost** — In hero metrics row
7. **Best Opportunity** — #1 ranked with live APY/TVL (or hold fallback)
8. **Top 3** — Scroll ranked opportunity cards
9. **Mira Verification** — Click "Verify With Mira"
   - Toast: "Verification prompt copied. Paste into Mira."
   - Telegram opens
   - Show `/verify` payload structure
10. **Export Report** — Click "Copy Report" on `/mira` page
11. **STON.fi Route** — Open route preview, show asset/amount/benefit
12. **Execute** — Click "Open STON.fi to Execute"

### Talking Points
- AlphaHunter **generates** recommendations from live STON.fi data
- Mira **verifies** — no Mira API, Telegram paste workflow
- One API call returns everything (performance fix)

---

## 5. Submission Checklist

### Functionality
- [ ] Wallet Connect works
- [ ] TON balance displays correctly
- [ ] USDT balance displays correctly (6 decimals)
- [ ] Portfolio value = TON USD + USDT USD
- [ ] Idle capital = undeployed USDT
- [ ] Opportunity engine returns top 3 with real STON.fi APY when available
- [ ] Mira Verification copies `/verify` payload and opens Telegram
- [ ] Export Report copies full portfolio report
- [ ] STON.fi route preview shows asset, amount, expected outcome
- [ ] STON.fi redirect link works

### Quality
- [ ] Mobile responsive (430px max-width layout)
- [ ] No console errors on happy path
- [ ] Loading state during analysis
- [ ] Error state with retry on failure
- [ ] Alpha Score de-emphasized (footer of hero, collapsed analytics)

### Documentation
- [ ] README describes product flow
- [ ] `.env.example` complete
- [ ] This submission guide linked in README (optional)

### Do NOT Submit
- Database migrations
- Auth system
- Smart contracts
- Fake Mira API integration claims

---

## Quick Verification Commands

```bash
# Backend health
curl http://localhost:4000/health

# Performance metrics
curl http://localhost:4000/health/performance

# Build check
cd backend && npm run build
cd frontend && npm run build
```

---

**Goal achieved:** Wallet Intelligence + Opportunity Discovery + Mira Verification + STON.fi Execution Path — without pretending Mira has an API.
