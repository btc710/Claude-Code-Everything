# atlas-project-ledger

Persistent ledger of Atlas projects. Stores everything the protocol produces — scope, estimate, backtest history, follow-ups, 30/90/180 reviews — so a customer dashboard can show "this is what we shipped you and how it's performing."

Sketch #3 in the productization plan. JSON-file backed today; production swaps `src/store.js` for Postgres without touching call sites.

## Why

- **Single source of truth** for everything a tenant has run through the Atlas protocol.
- **History over snapshots** — every backtest run is stored with a plan hash, so you can prove the gate score the customer saw on day-1 and compare it to today's.
- **Forces follow-through** — `scheduleReviews()` is idempotent; `dueReviews()` and `stalefollowups()` are how you actually surface what needs attention this week.
- **Tenant-scoped** — every project is owned by a tenant; queries filter by tenant.

## Data shape

```
{
  version: 1,
  projects:  [{ id, tenant, name, slug, status, scope, estimate, createdAt, updatedAt }],
  backtests: [{ id, projectId, runAt, planHash, pass, summary, results }],
  followups: [{ id, projectId, topic, owner, askedOn, unblockBy, status, resolvedWith }],
  reviews:   [{ id, projectId, kind, dueAt, status, findings }]
}
```

`status` values:
- project: `draft | gated | in_flight | shipped | archived`
- followup: `open | blocked | answered | closed`
- review: `pending | in_progress | done | skipped`

A passing backtest flips a project from `draft` → `gated` automatically. The atlas-protocol then expects an explicit move to `in_flight` once the user starts execution.

## Library use

```js
const lib = require('atlas-project-ledger');
const file = '.atlas/ledger.json';

const p = lib.createProject(file, { tenant: 'acme', name: 'HubSpot → Meet → Email' });

lib.recordBacktest(file, {
  projectId: p.id,
  plan: '<full plan text>',
  summary: gatewayResult.summary,   // returned by atlas-model-gateway POST /v1/backtest
  results: gatewayResult.results,
});
// → project status flips to 'gated' when pass: true

lib.scheduleReviews(file, p.id);                       // 30/90/180 reviews booked
lib.openFollowup(file, { projectId: p.id, topic: 'CC team or static list?', owner: 'Blake' });

lib.dueReviews(file, new Date(), 7);                   // what's due this week
lib.stalefollowups(file);                              // open items past unblockBy
```

## CLI

```bash
node src/cli.js create --tenant acme --name "HubSpot → Meet → Email"
node src/cli.js list --tenant acme
node src/cli.js show <projectId>

node src/cli.js followup --project <id> --topic "CC team or static list?" --owner Blake --days 3
node src/cli.js resolve  --followup <id> --with "Pulled from deal owners; static fallback"

node src/cli.js schedule-reviews --project <id>
node src/cli.js due-reviews --days 14
node src/cli.js stale-followups
```

Default store: `.atlas/ledger.json` in the current working directory. Override with `ATLAS_LEDGER_FILE=/path/to/file`.

## Test

```bash
node tests/run-all.js
# → 15 passed, 0 failed (4 files)
```

## How it fits with the other Atlas pieces

```
atlas session  ──▶  atlas-model-gateway        scoring
   │                  /v1/backtest             ──▶ ledger.usage
   │
   │
   ▼
atlas-project-ledger
   ├─ projects     scope, estimate, status transitions
   ├─ backtests    every gate run with summary + results + plan hash
   ├─ followups    open questions tracked until closed
   └─ reviews      30/90/180 cadence enforced
```

The Jarvis-style dashboard (sketch #1, `projects/jarvis-dashboard-mockup/`) renders directly off the four collections above.

## Production hardening (not in this sketch)

- Replace `src/store.js` with Postgres (one table per collection, all rows scoped by `tenant`).
- Add row-level security so a tenant's queries can never see another tenant's rows.
- Append-only audit log of every status change (separate `audit_events` table).
- Soft delete via `archivedAt`; never hard-delete a project.
- Background worker that emits "due review" / "stale followup" notifications to the tenant's preferred channel.
