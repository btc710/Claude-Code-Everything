# atlas-e2e

End-to-end integration harness for the Atlas stack. Wires the
model-gateway + project-ledger + (when available) tenants + integrations
+ notifier + audit modules into a single demo scenario and proves the
full round-trip works.

## Why

Each Atlas sketch (`model-gateway`, `project-ledger`, `atlas-tenants`,
`atlas-integrations`, `atlas-notifier`, `atlas-audit`) has its own test
suite that exercises the unit in isolation. This package answers a
different question: do they actually compose? The harness runs one
realistic scenario end to end and asserts the cross-module state at
each step.

## Scenario

`src/scenario.js` exposes one async function
`runHubspotMeetEmailScenario(ctx)` that:

1. Creates a tenant (or uses the `'demo'` fallback).
2. Creates a project in the ledger.
3. Runs a 12-model backtest via the model-gateway against a fake fetch
   (the all-pass canned scores from `model-gateway/tests/backtest.test.js`).
4. Stores the backtest in the ledger — project flips `draft` -> `gated`.
5. Schedules the 30/90/180 reviews.
6. Opens 3 followups.
7. Resolves one, leaves two open.
8. Returns `{tenant, projectId, backtest, followups, reviews}` for
   assertion.

## Defensive composition

The sibling Atlas projects may or may not exist at the time this harness
runs. `src/wiring.js` probes each sibling and falls back to a minimal
stub when it isn't present. Stubs are obvious and clearly labelled —
look for `// STUB: replace with require('../atlas-<x>') when available`.

The model-gateway and project-ledger packages are required directly
because the scenario does not work without them.

## CLI

```bash
node src/cli.js run
# → writes ./e2e-data/ledger.json + tenants/audit sidecars and prints a summary
```

## Test

```bash
node tests/run-all.js
```

Tests cover:

- The scenario completes end to end with no errors.
- The ledger ends with exactly 1 project (status `gated`), 1 backtest
  (`pass=true`, `planHash` present), 3 followups (1 closed, 2 open),
  3 reviews (all pending).
- The model-gateway ledger has 12 entries for this tenant.
- Cost across all 12 calls is non-zero and reasonable.
- `scheduleReviews` is idempotent (re-running it does not duplicate
  rows).
