# TON Center 401 Authentication Diagnostic

## Summary

**Authentication method in code is correct.** TonCenter API v3 accepts `X-API-Key` header (or `api_key` query param). Both are documented at [docs.ton.org](https://docs.ton.org/applications/api/toncenter/v3-authentication).

**Why 401 occurs:** `API key does not exist` means TonCenter does not recognize the key value in `TON_API_KEY`. The key is loaded from `.env` but is **invalid, revoked, or never created via @toncenter bot** — not a header-format bug.

---

## 1. Request URL

```
https://toncenter.com/api/v3/accountStates?address=<wallet>&include_boc=false
https://toncenter.com/api/v3/jetton/wallets?owner_address=<wallet>&limit=100&sort=desc
https://toncenter.com/api/v3/actions?account=<wallet>&limit=10&sort=desc
```

Base URL: `TON_CENTER_BASE_URL` (default `https://toncenter.com/api/v3`)

---

## 2. Authentication Method

| Method | Implementation | TonCenter v3 docs |
|--------|----------------|-------------------|
| **X-API-Key header** | Default in `httpClient` via `toncenterAuth.ts` | ✅ Supported |
| **api_key query** | Available in probe / debug | ✅ Supported |
| **Public (no auth)** | Automatic fallback after 401 | ✅ 1 req/s limit |

---

## 3. Header Names Used

With API key:
```
Accept: application/json
X-API-Key: <key>   // never logged in full — preview first 4 chars only
```

Public fallback:
```
Accept: application/json
```

Audit log event: `toncenter_request_audit` includes `headerNames`, `authMethod`, `keyPreview`.

---

## 4. Why TonCenter Rejects the Key

Per official error table:

| Status | Error | Meaning |
|--------|-------|---------|
| **401** | API key does not exist | Key string not found in TonCenter registry |
| 403 | Network not allowed | Testnet key on mainnet (or reverse) |
| 429 | Ratelimit exceeded | Too many requests |

**Most likely cause for this project:** The `TON_API_KEY` in `.env` was copied from `.env.example` placeholder or an old/revoked token. TonCenter v3 keys must be created via **@toncenter** Telegram bot → Manage API Keys → Create API Key.

**Not the cause:**
- Wrong header name (`X-API-Key` is correct)
- dotenv load order (fixed via `loadEnv.ts`)
- Module-level key caching (fixed via `getTonApiKey()`)

---

## 5. Recommended Permanent Fix

1. Open [@toncenter](https://t.me/toncenter) on Telegram
2. Manage API Keys → Create API Key (mainnet)
3. Replace `TON_API_KEY` in `backend/.env`
4. Restart backend — startup should show `TON API Key Loaded: YES`
5. Verify: `GET http://localhost:4000/debug/toncenter`
   - `probes.xApiKeyHeader.ok` should be `true`

---

## Hackathon Fallback (Implemented)

If TonCenter returns `401 API key does not exist`:

1. Log `toncenter_auth_fallback`
2. Disable API key for all subsequent requests
3. Retry immediately without authentication (public tier)
4. Portfolio analysis continues (slower rate limit)

Test fallback:
```bash
curl http://localhost:4000/debug/toncenter
```

Look for `probes.public.ok: true` when header/query probes fail.

---

## Debug Endpoint

```
GET /debug/toncenter?address=<optional_wallet>
```

Returns:
- Auth diagnostics
- Three probes: X-API-Key, api_key query, public
- Status + body preview per probe
- Recommended action
