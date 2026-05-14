# atlas-model-gateway

Tenant-scoped HTTP proxy in front of the 12 LLM vendors used by the Atlas backtest gate. Holds vendor API keys, meters cost per tenant/project, fans out backtest scoring to all 12 slots in parallel, and exposes a uniform JSON shape so callers never touch the underlying provider SDKs.

This is sketch #2 in the Atlas productization plan. It's wired against the same protocol defined in `skills/atlas-protocol/`.

## Why

- **One place for keys.** App code asks for "slot 7"; the gateway resolves the right provider, model, and API key. Rotate without touching call sites.
- **Tenant attribution.** Every call is tagged with a tenant (and optional project), so the ledger can answer "what did acme spend this month, and which model?".
- **Parallel backtest.** `/v1/backtest` calls all 12 (or a subset) in parallel and returns one aggregated report against the 750/700/750 thresholds.
- **Resilience.** A provider outage takes one slot offline; the others still report. The gate just won't pass partial coverage.

## Architecture

```
caller (atlas session)
   │  Bearer <tenant secret>
   ▼
src/server.js          ── HTTP dispatch + auth
   │
   ├─ src/score.js     ── single-slot scoring (provider-agnostic shape)
   │     │
   │     ├─ src/providers/anthropic.js     (slots 1-4)
   │     ├─ src/providers/openai-compat.js (slots 5,6,9,10,11,12 — same /chat/completions shape)
   │     └─ src/providers/google.js        (slots 7,8)
   │
   ├─ src/backtest.js  ── Promise.allSettled across selected slots
   ├─ src/ledger.js    ── per-call usage + cost; aggregations
   ├─ src/registry.js  ── 12 slots, models, prices
   ├─ src/secrets.js   ── env-backed today; swap for Vault/SM/SSM in prod
   └─ src/auth.js      ── Bearer → tenant
```

## Endpoints

| Method | Path             | Body / query                                   | Returns                                                  |
|--------|------------------|------------------------------------------------|----------------------------------------------------------|
| GET    | `/healthz`       | —                                              | `{ ok: true }`                                           |
| GET    | `/v1/slots`      | —                                              | Registry of 12 slots with provider+model+pricing         |
| POST   | `/v1/score`      | `{ slot, plan, project? }`                     | One scored result + token usage; recorded in ledger      |
| POST   | `/v1/backtest`   | `{ plan, project?, slots? }`                   | Aggregated report (pass/fail, mean, min, max, dim avgs)  |
| GET    | `/v1/usage`      | `?project=<id>&since=<ms>`                     | Per-tenant usage rollup                                  |

All authenticated endpoints require `Authorization: Bearer <tenant secret>`.

## Setup

```bash
cp .env.example .env       # fill in vendor keys + tenant tokens
node src/server.js         # listens on :8787
```

## Test it (no real vendor calls)

```bash
node tests/run-all.js
# → 21 passed, 0 failed (5 files)
```

The tests use a fake `fetch` so no keys are required. They cover the registry, ledger cost math, single-slot scoring for all three API shapes, the 12-way fan-out (full pass, one model below floor, provider failure tolerance), and the HTTP routes including auth.

## Smoke-test a real backtest

```bash
curl -s -X POST http://localhost:8787/v1/backtest \
  -H "Authorization: Bearer demo-secret-replace-me" \
  -H "content-type: application/json" \
  -d '{"plan": "<paste your plan here>", "project": "demo-001"}' | jq .summary
```

## Production hardening (not in this sketch)

- Swap `src/secrets.js` for AWS Secrets Manager / GCP Secret Manager / Vault.
- Persist the ledger (Postgres or DynamoDB) instead of in-memory.
- Add rate limits per tenant (token bucket).
- Add per-tenant model allow/deny lists in the registry resolver.
- TLS termination upstream (ALB, Cloud Run, Fly). The server itself stays plain HTTP.
- Structured logging + tracing (OpenTelemetry).
- Vendor key health checks on a separate timer; remove a slot from rotation when its provider is unhealthy.
