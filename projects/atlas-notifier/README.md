# atlas-notifier

Notification worker for the Atlas project ledger. Auto-nudges open follow-ups that have slipped past their `unblockBy` date and surfaces 30/90/180 reviews coming due in the next *N* days.

Sketch #7 in the productization plan. Consumes the same JSON store that `atlas-project-ledger` writes; in production both swap to Postgres without touching call sites.

## Why

- **Surfaces what would otherwise rot.** The ledger already records stale followups and due reviews — the notifier is what closes the loop and pages the right human.
- **Per-tenant routing.** Items are grouped by tenant + owner so acme's followups never land in beta's Slack channel.
- **Idempotent.** A sidecar `notifier-state.json` records `(day, item-id)` markers so a 5-minute scheduler cron never double-pages the same followup in the same day.
- **Sink-agnostic.** Slack, email (Resend-shape), and a generic webhook all expose the same `async send({channel, subject, body, meta})` contract.

## Library use

```js
const notifier = require('atlas-notifier');
const file = '.atlas/ledger.json';

const followupBatches = notifier.scanStaleFollowups(file);
const reviewBatches = notifier.scanDueReviews(file, 7);
const merged = notifier.mergeBatches(followupBatches, reviewBatches);

const slack = notifier.sinks.slack;
for (const batch of merged) {
  await notifier.dispatch(slack, batch, {
    channel: '#atlas-' + batch.tenant,
    stateFile: '.atlas/notifier-state.json',
    sinkName: 'slack',
  });
}
```

## CLI

```bash
node src/cli.js scan     --ledger .atlas/ledger.json
node src/cli.js dispatch --ledger .atlas/ledger.json --sink slack --channel "#atlas"
node src/cli.js status   --ledger .atlas/ledger.json
```

## Idempotency

The notifier writes `notifier-state.json` alongside the ledger. Each notified item is keyed `<UTC-day>:<id>` so:

- Two scans on the same day suppress the second send.
- A followup that is still stale tomorrow re-sends (different day key).
- Marker storage is O(items-notified); old keys can be GC'd by trimming on a schedule (not implemented in this sketch).

## Retry

Sink errors retry with exponential backoff: 1s / 2s / 4s, max 3 attempts. After the final failure the error is logged with the sink name and the dispatch returns `{ ok: false, attempts, error }` without crashing.

## Sinks

- `slack` — POST to `chat.postMessage`, Bearer auth from `SLACK_BOT_TOKEN`.
- `email` — POST to `https://api.resend.com/emails`, Bearer auth from `RESEND_API_KEY`. Treats the `channel` argument as a recipient address.
- `webhook` — generic JSON POST to whatever URL is passed as `channel`.

Add a sink by dropping a file in `src/sinks/` that exports `async send({channel, subject, body, meta}, opts)` and registering it in `src/sinks/index.js`.

## Test

```bash
node tests/run-all.js
```

All sink tests use a fake fetch — no real network calls.
